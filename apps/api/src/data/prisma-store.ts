import { prisma } from "@invoice/db";
import { DocumentType as SharedDocumentType } from "@invoice/shared";
import type {
  BusinessSettings,
  CreateCustomerInput,
  CreateDraftInvoiceInput,
  Customer,
  DocumentSeriesConfig,
  DraftInvoice,
  ReceiptPayment,
  UpdateBusinessSettingsInput
} from "@invoice/shared";
import { DocumentStatus, PaymentMethod, BusinessTaxProfile, calculateDraftInvoice } from "@invoice/shared";

type RuntimeContext = {
  userId: string;
  businessId: string;
  taxProfile: "PTUR" | "MURSHE";
};

// Per-user context cache (invalidated when business settings change)
const contextCache = new Map<string, Promise<RuntimeContext>>();

export function invalidateContextCache(userId: string) {
  contextCache.delete(userId);
}

const allowedForMurshe: SharedDocumentType[] = [
  SharedDocumentType.TAX_INVOICE,
  SharedDocumentType.INVOICE_RECEIPT,
  SharedDocumentType.RECEIPT,
  SharedDocumentType.PROFORMA,
  SharedDocumentType.RETURN_NOTE
];

const allowedForPtur: SharedDocumentType[] = [
  SharedDocumentType.RECEIPT,
  SharedDocumentType.PROFORMA,
  SharedDocumentType.RETURN_NOTE
];

function resolveDocumentType(
  requested: SharedDocumentType | undefined,
  taxProfile: RuntimeContext["taxProfile"]
) {
  const allowed = taxProfile === "PTUR" ? allowedForPtur : allowedForMurshe;

  if (!requested) {
    return taxProfile === "PTUR"
      ? SharedDocumentType.RECEIPT
      : SharedDocumentType.TAX_INVOICE;
  }

  if (!allowed.includes(requested)) {
    throw new Error("DOCUMENT_TYPE_NOT_ALLOWED");
  }

  return requested;
}

function toNumber(value: { toString(): string } | number | null | undefined) {
  if (!value) {
    return 0;
  }

  return Number(value);
}

/**
 * Assigns a sequence number to a document within a transaction.
 * Reads the prefix and startingNumber from the DocumentSequence config row if present.
 * Returns { nextNumber, prefix } so callers can format the display number.
 */
async function assignSequenceNumber(
  tx: any,
  businessId: string,
  documentType: string,
  fiscalYear: number
): Promise<{ nextNumber: number; prefix: string }> {
  const seqKey = {
    businessId_documentType_fiscalYear: { businessId, documentType, fiscalYear }
  };
  const seq = await tx.documentSequence.findUnique({ where: seqKey });
  const startingNumber = seq?.startingNumber ?? 1;
  const nextNumber = seq?.nextNumber ?? startingNumber;
  const prefix = seq?.prefix ?? "";

  if (seq) {
    await tx.documentSequence.update({ where: seqKey, data: { nextNumber: { increment: 1 } } });
  } else {
    await tx.documentSequence.create({
      data: { businessId, documentType, fiscalYear, prefix, startingNumber, nextNumber: startingNumber + 1 }
    });
  }

  return { nextNumber, prefix };
}

function mapCustomer(customer: {
  id: string;
  displayNameHe: string;
  legalNameHe: string | null;
  type: "PRIVATE" | "COMPANY";
  taxId: string | null;
  email: string | null;
  phone: string | null;
  addressHe: string | null;
  cityHe: string | null;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: Date;
}): Customer {
  return {
    id: customer.id,
    displayNameHe: customer.displayNameHe,
    legalNameHe: customer.legalNameHe ?? undefined,
    type: customer.type,
    taxId: customer.taxId ?? undefined,
    email: customer.email ?? undefined,
    phone: customer.phone ?? undefined,
    addressHe: customer.addressHe ?? undefined,
    cityHe: customer.cityHe ?? undefined,
    paymentTermsDays: customer.paymentTermsDays,
    isActive: customer.isActive,
    createdAt: customer.createdAt.toISOString()
  };
}

function mapDraftInvoice(
  invoice: {
    id: string;
    customerId: string;
    issueDate: Date;
    dueDate: Date | null;
    currency: string;
    status: string;
    documentType?: string;
    paymentMethod?: string | null;
    paymentDetails?: unknown;
    sequenceNumber?: number | null;
    notesHe: string | null;
    subtotalAmount: { toString(): string } | number;
    vatAmount: { toString(): string } | number;
    totalAmount: { toString(): string } | number;
    balanceDue: { toString(): string } | number;
    issuedAt?: Date | null;
    createdAt: Date;
    lines: Array<{
      lineNo: number;
      descriptionHe: string;
      quantity: { toString(): string } | number;
      unitPrice: { toString(): string } | number;
      vatRate: { toString(): string } | number;
      lineSubtotal: { toString(): string } | number;
      lineVatAmount: { toString(): string } | number;
      lineTotal: { toString(): string } | number;
    }>;
  }
): DraftInvoice {
  const payment = invoice.paymentMethod
    ? {
        method: invoice.paymentMethod as PaymentMethod,
        details:
          invoice.paymentDetails && typeof invoice.paymentDetails === "object" && !Array.isArray(invoice.paymentDetails)
            ? (invoice.paymentDetails as Record<string, string | number | boolean>)
            : undefined
      } satisfies ReceiptPayment
    : undefined;

  return {
    id: invoice.id,
    customerId: invoice.customerId,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: invoice.dueDate?.toISOString().slice(0, 10),
    currency: invoice.currency,
    status: invoice.status as DocumentStatus,
    documentType: invoice.documentType as SharedDocumentType | undefined,
    sequenceNumber: invoice.sequenceNumber ?? undefined,
    notesHe: invoice.notesHe ?? undefined,
    payment,
    subtotalAmount: toNumber(invoice.subtotalAmount),
    vatAmount: toNumber(invoice.vatAmount),
    totalAmount: toNumber(invoice.totalAmount),
    balanceDue: toNumber(invoice.balanceDue),
    issuedAt: invoice.issuedAt?.toISOString(),
    createdAt: invoice.createdAt.toISOString(),
    lines: invoice.lines
      .sort((a: { lineNo: number }, b: { lineNo: number }) => a.lineNo - b.lineNo)
      .map((line) => ({
        descriptionHe: line.descriptionHe,
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        vatRate: toNumber(line.vatRate),
        lineSubtotal: toNumber(line.lineSubtotal),
        lineVatAmount: toNumber(line.lineVatAmount),
        lineTotal: toNumber(line.lineTotal)
      }))
  };
}

async function getOrCreateBusinessForUser(userId: string): Promise<RuntimeContext> {
  // Find existing business owned by this user
  const existing = await prisma.business.findFirst({
    where: { ownerUserId: userId, isActive: true },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return { userId, businessId: existing.id, taxProfile: existing.taxProfile as RuntimeContext["taxProfile"] };
  }

  // Auto-create a blank business for new users
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("USER_NOT_FOUND");

  const business = await prisma.business.create({
    data: {
      ownerUserId: userId,
      nameHe: user.displayName,
      taxId: `NEW-${userId.slice(0, 12)}`, // placeholder — user must update in settings
      taxProfile: "MURSHE",
      vatRegistered: true,
      defaultCurrency: "ILS",
      email: user.email,
      isActive: true
    }
  });

  return { userId, businessId: business.id, taxProfile: business.taxProfile as RuntimeContext["taxProfile"] };
}

export function getContextForUser(userId: string): Promise<RuntimeContext> {
  const cached = contextCache.get(userId);
  if (cached) return cached;
  const promise = getOrCreateBusinessForUser(userId);
  contextCache.set(userId, promise);
  return promise;
}

// Legacy shim — kept so the seed customer helper still compiles
async function ensureSeedCustomer(business: { id: string }) {
  const existingCustomers = await prisma.customer.count({
    where: { businessId: business.id }
  });

  if (existingCustomers > 0) {
    return;
  }

  await prisma.customer.create({
    data: {
      businessId: business.id,
      type: "COMPANY",
      displayNameHe: "סטודיו כהן",
      legalNameHe: 'סטודיו כהן בע"מ',
      taxId: "515555555",
      email: "office@cohen.example",
      phone: "050-1234567",
      addressHe: "רחוב הרצל 12",
      cityHe: "תל אביב",
      paymentTermsDays: 30,
      isActive: true
    }
  });
}

export function getRuntimeContext() {
  throw new Error("getRuntimeContext() removed — use getContextForUser(userId) instead");
}

export async function listCustomers(userId: string) {
  const context = await getContextForUser(userId);

  const customers = await prisma.customer.findMany({
    where: {
      businessId: context.businessId,
      isActive: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return customers.map(mapCustomer);
}

export async function createCustomer(userId: string, input: CreateCustomerInput) {
  const context = await getContextForUser(userId);

  const customer = await prisma.customer.create({
    data: {
      businessId: context.businessId,
      displayNameHe: input.displayNameHe.trim(),
      legalNameHe: input.legalNameHe?.trim() || null,
      type: input.type === "COMPANY" ? "COMPANY" : "PRIVATE",
      taxId: input.taxId?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      addressHe: input.addressHe?.trim() || null,
      cityHe: input.cityHe?.trim() || null,
      paymentTermsDays: input.paymentTermsDays ?? 0,
      isActive: true
    }
  });

  return mapCustomer(customer);
}

export async function updateCustomer(userId: string, customerId: string, input: Partial<CreateCustomerInput>) {
  const context = await getContextForUser(userId);

  const customer = await prisma.customer.update({
    where: { id: customerId, businessId: context.businessId },
    data: {
      ...(input.displayNameHe !== undefined ? { displayNameHe: input.displayNameHe.trim() } : {}),
      ...(input.legalNameHe !== undefined ? { legalNameHe: input.legalNameHe?.trim() || null } : {}),
      ...(input.type !== undefined ? { type: input.type === "COMPANY" ? "COMPANY" : "PRIVATE" } : {}),
      ...(input.taxId !== undefined ? { taxId: input.taxId?.trim() || null } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.addressHe !== undefined ? { addressHe: input.addressHe?.trim() || null } : {}),
      ...(input.cityHe !== undefined ? { cityHe: input.cityHe?.trim() || null } : {}),
      ...(input.paymentTermsDays !== undefined ? { paymentTermsDays: input.paymentTermsDays } : {}),
    }
  });

  return mapCustomer(customer);
}

export async function listDraftInvoices(userId: string) {
  const context = await getContextForUser(userId);

  const invoices = await prisma.invoice.findMany({
    where: {
      businessId: context.businessId,
      status: "DRAFT"
    },
    include: {
      lines: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  return invoices.map(mapDraftInvoice);
}

export async function listIssuedInvoices(userId: string) {
  const context = await getContextForUser(userId);

  const invoices = await prisma.invoice.findMany({
    where: {
      businessId: context.businessId,
      status: "ISSUED"
    },
    include: {
      lines: true
    },
    orderBy: {
      issuedAt: "desc"
    }
  });

  return invoices.map(mapDraftInvoice);
}

export async function createCreditNote(userId: string, originalInvoiceId: string) {
  const context = await getContextForUser(userId);

  const result = await prisma.$transaction(async (tx: any) => {
    const original = await tx.invoice.findFirst({
      where: { id: originalInvoiceId, businessId: context.businessId },
      include: { lines: true }
    });

    if (!original) throw new Error("INVOICE_NOT_FOUND");
    if (original.status === "CANCELLED") throw new Error("INVOICE_ALREADY_CANCELLED");
    if (original.documentType === "CREDIT_NOTE") throw new Error("CANNOT_CREDIT_CREDIT_NOTE");
    if (original.documentType === "RECEIPT") throw new Error("CANNOT_CREDIT_RECEIPT");

    const today = new Date();
    const fiscalYear = today.getFullYear();

    // Create credit note with negated amounts and linked to original
    const creditNote = await tx.invoice.create({
      data: {
        businessId: context.businessId,
        customerId: original.customerId,
        documentType: "CREDIT_NOTE",
        status: "DRAFT",
        fiscalYear,
        issueDate: today,
        currency: original.currency,
        subtotalAmount: (-Number(original.subtotalAmount)).toFixed(2),
        discountAmount: "0.00",
        vatAmount: (-Number(original.vatAmount)).toFixed(2),
        totalAmount: (-Number(original.totalAmount)).toFixed(2),
        paidAmount: "0.00",
        balanceDue: (-Number(original.totalAmount)).toFixed(2),
        notesHe: `זיכוי עבור מסמך מספר ${original.sequenceNumber ?? original.id}`,
        linkedDocumentId: original.id,
        createdByUserId: context.userId,
        lines: {
          create: original.lines.map((line: any) => ({
            lineNo: line.lineNo,
            descriptionHe: line.descriptionHe,
            quantity: (-Number(line.quantity)).toFixed(3),
            unitPrice: Number(line.unitPrice).toFixed(2),
            discountPct: "0.00",
            lineSubtotal: (-Number(line.lineSubtotal)).toFixed(2),
            vatRate: Number(line.vatRate).toFixed(2),
            lineVatAmount: (-Number(line.lineVatAmount)).toFixed(2),
            lineTotal: (-Number(line.lineTotal)).toFixed(2)
          }))
        }
      },
      include: { lines: true }
    });

    // Assign sequence number and mark as issued immediately
    const { nextNumber: cnNextNumber } = await assignSequenceNumber(tx, context.businessId, "CREDIT_NOTE", fiscalYear);

    const issued = await tx.invoice.update({
      where: { id: creditNote.id },
      data: { status: "ISSUED", sequenceNumber: cnNextNumber, issuedAt: new Date() },
      include: { lines: true }
    });

    // Mark original as CANCELLED and zero its balance
    await tx.invoice.update({
      where: { id: original.id },
      data: { status: "CANCELLED", balanceDue: "0.00", cancelledAt: new Date() }
    });

    return issued;
  });

  return mapDraftInvoice(result);
}

export async function createReturnNote(userId: string, originalInvoiceId: string) {
  const context = await getContextForUser(userId);

  const result = await prisma.$transaction(async (tx: any) => {
    const original = await tx.invoice.findFirst({
      where: { id: originalInvoiceId, businessId: context.businessId },
      include: { lines: true }
    });

    if (!original) throw new Error("INVOICE_NOT_FOUND");
    if (original.status === "CANCELLED") throw new Error("INVOICE_ALREADY_CANCELLED");
    if (original.documentType === "CREDIT_NOTE") throw new Error("CANNOT_RETURN_CREDIT_NOTE");
    if (original.documentType === "RETURN_NOTE") throw new Error("CANNOT_RETURN_RETURN_NOTE");
    if (original.documentType === "PROFORMA") throw new Error("CANNOT_RETURN_PROFORMA");

    const today = new Date();
    const fiscalYear = today.getFullYear();

    const returnNote = await tx.invoice.create({
      data: {
        businessId: context.businessId,
        customerId: original.customerId,
        documentType: "RETURN_NOTE",
        status: "DRAFT",
        fiscalYear,
        issueDate: today,
        currency: original.currency,
        subtotalAmount: (-Number(original.subtotalAmount)).toFixed(2),
        discountAmount: "0.00",
        vatAmount: (-Number(original.vatAmount)).toFixed(2),
        totalAmount: (-Number(original.totalAmount)).toFixed(2),
        paidAmount: "0.00",
        balanceDue: (-Number(original.totalAmount)).toFixed(2),
        notesHe: `תעודת החזרה עבור מסמך מספר ${original.sequenceNumber ?? original.id}`,
        linkedDocumentId: original.id,
        createdByUserId: context.userId,
        lines: {
          create: original.lines.map((line: any) => ({
            lineNo: line.lineNo,
            descriptionHe: line.descriptionHe,
            quantity: (-Number(line.quantity)).toFixed(3),
            unitPrice: Number(line.unitPrice).toFixed(2),
            discountPct: "0.00",
            lineSubtotal: (-Number(line.lineSubtotal)).toFixed(2),
            vatRate: Number(line.vatRate).toFixed(2),
            lineVatAmount: (-Number(line.lineVatAmount)).toFixed(2),
            lineTotal: (-Number(line.lineTotal)).toFixed(2)
          }))
        }
      },
      include: { lines: true }
    });

    const { nextNumber: rnNextNumber } = await assignSequenceNumber(tx, context.businessId, "RETURN_NOTE", fiscalYear);

    const issued = await tx.invoice.update({
      where: { id: returnNote.id },
      data: { status: "ISSUED", sequenceNumber: rnNextNumber, issuedAt: new Date() },
      include: { lines: true }
    });

    return issued;
  });

  return mapDraftInvoice(result);
}

export async function createDraftInvoice(userId: string, input: CreateDraftInvoiceInput) {
  const context = await getContextForUser(userId);
  const totals = calculateDraftInvoice(input.lines);
  const issueDate = new Date(input.issueDate);
  const dueDate = input.dueDate ? new Date(input.dueDate) : null;
  const documentType = resolveDocumentType(input.documentType, context.taxProfile);

  const invoice = await prisma.invoice.create({
    data: {
      businessId: context.businessId,
      customerId: input.customerId,
      documentType,
      status: "DRAFT",
      fiscalYear: issueDate.getFullYear(),
      issueDate,
      dueDate,
      currency: "ILS",
      paymentMethod: input.payment?.method,
      paymentDetails: input.payment?.details ?? null,
      subtotalAmount: totals.subtotalAmount.toFixed(2),
      discountAmount: "0.00",
      vatAmount: totals.vatAmount.toFixed(2),
      totalAmount: totals.totalAmount.toFixed(2),
      paidAmount: "0.00",
      balanceDue: totals.balanceDue.toFixed(2),
      notesHe: input.notesHe?.trim() || null,
      createdByUserId: context.userId,
      lines: {
        create: totals.lines.map((line, index) => ({
          lineNo: index + 1,
          descriptionHe: line.descriptionHe,
          quantity: line.quantity.toFixed(3),
          unitPrice: line.unitPrice.toFixed(2),
          discountPct: "0.00",
          lineSubtotal: line.lineSubtotal.toFixed(2),
          vatRate: line.vatRate.toFixed(2),
          lineVatAmount: line.lineVatAmount.toFixed(2),
          lineTotal: line.lineTotal.toFixed(2)
        }))
      }
    },
    include: {
      lines: true
    }
  });

  return mapDraftInvoice(invoice);
}

export async function issueDraftInvoice(userId: string, invoiceId: string) {
  const context = await getContextForUser(userId);

  const issuedInvoice = await prisma.$transaction(async (tx: any) => {
    const invoice = await tx.invoice.findFirst({
      where: {
        id: invoiceId,
        businessId: context.businessId
      },
      include: {
        lines: true
      }
    });

    if (!invoice) {
      throw new Error("INVOICE_NOT_FOUND");
    }

    if (invoice.status !== "DRAFT") {
      return invoice;
    }

    const { nextNumber } = await assignSequenceNumber(tx, context.businessId, invoice.documentType, invoice.fiscalYear);

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "ISSUED",
        sequenceNumber: nextNumber,
        issuedAt: new Date()
      },
      include: {
        lines: true
      }
    });
  });

  return mapDraftInvoice(issuedInvoice);
}

export async function getInvoiceForExport(userId: string, invoiceId: string) {
  const context = await getContextForUser(userId);

  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      businessId: context.businessId
    },
    include: {
      lines: {
        orderBy: {
          lineNo: "asc"
        }
      },
      customer: true,
      business: true
    }
  });

  if (!invoice) return null;

  // Fetch the prefix for this document type (look across all fiscal years, newest first)
  const seq = await prisma.documentSequence.findFirst({
    where: { businessId: context.businessId, documentType: invoice.documentType },
    orderBy: { fiscalYear: "desc" }
  });

  return { ...invoice, seriesPrefix: seq?.prefix ?? "" };
}

export async function getBusinessSettings(userId: string) {
  const context = await getContextForUser(userId);

  const business = await prisma.business.findUnique({
    where: { id: context.businessId }
  });

  if (!business) {
    throw new Error("BUSINESS_NOT_FOUND");
  }

  // Load the latest series config across all fiscal years (one entry per documentType)
  const sequences = await prisma.documentSequence.findMany({
    where: { businessId: context.businessId },
    orderBy: { fiscalYear: "desc" }
  });

  const seenTypes = new Set<string>();
  const seriesConfig: DocumentSeriesConfig[] = [];
  for (const seq of sequences) {
    if (!seenTypes.has(seq.documentType)) {
      seenTypes.add(seq.documentType);
      seriesConfig.push({
        documentType: seq.documentType as SharedDocumentType,
        prefix: seq.prefix,
        startingNumber: seq.startingNumber
      });
    }
  }

  return {
    nameHe: business.nameHe,
    detailsHe: business.detailsHe ?? undefined,
    taxId: business.taxId,
    taxProfile: business.taxProfile as BusinessTaxProfile,
    addressHe: business.addressHe ?? undefined,
    phone: business.phone ?? undefined,
    email: business.email ?? undefined,
    logoUrl: business.logoUrl ?? undefined,
    printTemplate: (business.printTemplate as { primaryColor: string; fontFamily: string } | null) ?? undefined,
    seriesConfig
  } satisfies BusinessSettings;
}

export async function updateBusinessSettings(userId: string, input: UpdateBusinessSettingsInput) {
  const context = await getContextForUser(userId);
  invalidateContextCache(userId); // taxProfile may change

  const business = await prisma.business.update({
    where: { id: context.businessId },
    data: {
      nameHe: input.nameHe.trim(),
      ...(input.taxId?.trim() ? { taxId: input.taxId.trim() } : {}),
      taxProfile: input.taxProfile ?? undefined,
      detailsHe: input.detailsHe?.trim() || null,
      addressHe: input.addressHe?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      logoUrl: input.logoUrl?.trim() || null,
      printTemplate: input.printTemplate ?? undefined
    }
  });

  // Update series config: upsert DocumentSequence rows for each provided config
  if (input.seriesConfig && input.seriesConfig.length > 0) {
    const currentYear = new Date().getFullYear();
    for (const cfg of input.seriesConfig) {
      // Upsert: if no sequence exists yet, create one; if it exists, update prefix/startingNumber
      const existing = await prisma.documentSequence.findUnique({
        where: {
          businessId_documentType_fiscalYear: {
            businessId: context.businessId,
            documentType: cfg.documentType,
            fiscalYear: currentYear
          }
        }
      });

      if (existing) {
        // Only update prefix and startingNumber; do not touch nextNumber if docs already issued
        await prisma.documentSequence.update({
          where: { id: existing.id },
          data: {
            prefix: cfg.prefix ?? "",
            startingNumber: cfg.startingNumber ?? 1,
            // Reset nextNumber to startingNumber only if no docs issued yet (nextNumber still equals startingNumber)
            ...(existing.nextNumber === existing.startingNumber
              ? { nextNumber: cfg.startingNumber ?? 1 }
              : {})
          }
        });
      } else {
        await prisma.documentSequence.create({
          data: {
            businessId: context.businessId,
            documentType: cfg.documentType,
            fiscalYear: currentYear,
            prefix: cfg.prefix ?? "",
            startingNumber: cfg.startingNumber ?? 1,
            nextNumber: cfg.startingNumber ?? 1
          }
        });
      }
    }
  }

  return getBusinessSettings(userId);
}

export async function getFullExportData(userId: string) {
  const context = await getContextForUser(userId);

  const [business, customers, invoices, sequences] = await Promise.all([
    prisma.business.findUnique({ where: { id: context.businessId } }),
    prisma.customer.findMany({
      where: { businessId: context.businessId },
      orderBy: { createdAt: "asc" }
    }),
    prisma.invoice.findMany({
      where: { businessId: context.businessId },
      include: { lines: { orderBy: { lineNo: "asc" } } },
      orderBy: { createdAt: "asc" }
    }),
    prisma.documentSequence.findMany({
      where: { businessId: context.businessId },
      orderBy: [{ documentType: "asc" }, { fiscalYear: "desc" }]
    })
  ]);

  if (!business) throw new Error("BUSINESS_NOT_FOUND");

  return { business, customers, invoices, sequences };
}

export async function importData(
  userId: string,
  rawCustomers: unknown[],
  rawInvoices: unknown[]
): Promise<{ importedCustomers: number; importedInvoices: number; skippedInvoices: number }> {
  const context = await getContextForUser(userId);

  let importedCustomers = 0;
  let importedInvoices = 0;
  let skippedInvoices = 0;

  // ── Customers ──────────────────────────────────────────────────────────────
  for (const raw of rawCustomers) {
    const c = raw as any;
    if (!c.id || !c.displayNameHe) continue;
    const customerData = {
      businessId: context.businessId,
      displayNameHe: String(c.displayNameHe),
      legalNameHe: c.legalNameHe || null,
      type: (c.type === "COMPANY" ? "COMPANY" : "PRIVATE") as "COMPANY" | "PRIVATE",
      taxId: c.taxId || null,
      email: c.email || null,
      phone: c.phone || null,
      addressHe: c.addressHe || null,
      cityHe: c.cityHe || null,
      paymentTermsDays: Number(c.paymentTermsDays) || 0,
      isActive: c.isActive !== false
    };
    try {
      await prisma.customer.upsert({
        where: { id: c.id },
        create: { id: c.id, ...customerData },
        update: customerData
      });
      importedCustomers++;
    } catch { /* skip invalid */ }
  }

  // ── Invoices pass 1: upsert without linkedDocumentId ─────────────────────
  const importedInvoiceIds = new Set<string>();

  for (const raw of rawInvoices) {
    const inv = raw as any;
    if (!inv.id || !inv.documentType || !inv.customerId || !inv.issueDate) continue;
    const invoiceData = {
      businessId: context.businessId,
      customerId: inv.customerId,
      documentType: inv.documentType,
      status: inv.status || "ISSUED",
      fiscalYear: Number(inv.fiscalYear) || new Date().getFullYear(),
      sequenceNumber: inv.sequenceNumber != null ? Number(inv.sequenceNumber) : null,
      issueDate: new Date(inv.issueDate),
      dueDate: inv.dueDate ? new Date(inv.dueDate) : null,
      currency: inv.currency || "ILS",
      paymentMethod: inv.paymentMethod || null,
      paymentDetails: inv.paymentDetails ?? null,
      subtotalAmount: String(inv.subtotalAmount ?? "0"),
      discountAmount: String(inv.discountAmount ?? "0"),
      vatAmount: String(inv.vatAmount ?? "0"),
      totalAmount: String(inv.totalAmount ?? "0"),
      paidAmount: String(inv.paidAmount ?? "0"),
      balanceDue: String(inv.balanceDue ?? inv.totalAmount ?? "0"),
      notesHe: inv.notesHe || null,
      linkedDocumentId: null as string | null, // resolved in pass 2
      createdByUserId: context.userId,
      issuedAt: inv.issuedAt ? new Date(inv.issuedAt) : null,
      cancelledAt: inv.cancelledAt ? new Date(inv.cancelledAt) : null
    };

    try {
      await prisma.invoice.upsert({
        where: { id: inv.id },
        create: { id: inv.id, ...invoiceData },
        update: invoiceData
      });

      // Re-create lines (delete + insert = idempotent)
      await prisma.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
      if (Array.isArray(inv.lines)) {
        let autoLineNo = 1;
        for (const line of inv.lines) {
          await prisma.invoiceLine.create({
            data: {
              invoiceId: inv.id,
              lineNo: line.lineNo ?? autoLineNo++,
              descriptionHe: line.descriptionHe || "",
              quantity: String(line.quantity ?? 1),
              unitPrice: String(line.unitPrice ?? 0),
              discountPct: String(line.discountPct ?? 0),
              lineSubtotal: String(line.lineSubtotal ?? 0),
              vatRate: String(line.vatRate ?? 0),
              lineVatAmount: String(line.lineVatAmount ?? 0),
              lineTotal: String(line.lineTotal ?? 0)
            }
          });
        }
      }

      importedInvoiceIds.add(inv.id);
      importedInvoices++;
    } catch {
      skippedInvoices++;
    }
  }

  // ── Invoices pass 2: wire linkedDocumentId ────────────────────────────────
  for (const raw of rawInvoices) {
    const inv = raw as any;
    if (!importedInvoiceIds.has(inv.id) || !inv.linkedDocumentId) continue;
    if (!importedInvoiceIds.has(inv.linkedDocumentId)) continue; // linked doc not imported
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { linkedDocumentId: inv.linkedDocumentId }
    }).catch(() => {});
  }

  return { importedCustomers, importedInvoices, skippedInvoices };
}
