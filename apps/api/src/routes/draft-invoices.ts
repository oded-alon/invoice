import type { FastifyInstance } from "fastify";
import type { Customer, DraftInvoice } from "@invoice/shared";
import { DocumentType, PaymentMethod, getDocumentTypeLabel } from "@invoice/shared";
import { createCreditNote, createReturnNote, createDraftInvoice, getInvoiceForExport, issueDraftInvoice, listCustomers, listDraftInvoices, listIssuedInvoices } from "../data/prisma-store.js";
import { buildInvoiceHtml } from "../lib/invoice-html.js";
import puppeteerCore, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_REMOTE_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v137.0.0/chromium-v137.0.0-pack.tar";

let _browser: Browser | null = null;
async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.connected) return _browser;
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    const executablePath = await chromium.executablePath(CHROMIUM_REMOTE_URL);
    _browser = await puppeteerCore.launch({
      executablePath,
      args: chromium.args,
      headless: true,
    });
  } else {
    // Local dev: use system Chrome or puppeteer's bundled one
    const localPuppeteer = await import("puppeteer");
    _browser = await localPuppeteer.default.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    }) as unknown as Browser;
  }
  return _browser;
}

function getUserId(request: { user: unknown }): string {
  return (request.user as { sub: string }).sub;
}

type DraftInvoiceLineBody = {
  descriptionHe?: string;
  quantity?: number;
  unitPrice?: number;
  vatRate?: number;
};

type CreateDraftInvoiceBody = {
  customerId?: string;
  documentType?: DocumentType;
  issueDate?: string;
  dueDate?: string;
  notesHe?: string;
  payment?: {
    method?: PaymentMethod;
    details?: Record<string, unknown>;
  };
  lines?: DraftInvoiceLineBody[];
};

type InvoiceParams = {
  id: string;
};

type IssuedInvoiceQuery = {
  search?: string;
  customerId?: string;
  documentType?: DocumentType;
  fromDate?: string;
  toDate?: string;
};

function normalizePaymentDetails(
  details: Record<string, unknown> | undefined
): Record<string, string | number | boolean> | undefined {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return undefined;
  }

  const entries = Object.entries(details).filter(([, value]) => {
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries) as Record<string, string | number | boolean>;
}

function hasValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== undefined && value !== null;
}

function validatePaymentDetails(method: PaymentMethod, details: Record<string, unknown> | undefined) {
  switch (method) {
    case PaymentMethod.CREDIT:
      return hasValue(details?.cardNumber);
    case PaymentMethod.CHECK:
      return hasValue(details?.checkNumber);
    case PaymentMethod.CASH:
      return true;
    case PaymentMethod.BANK_TRANSFER:
      return hasValue(details?.reference);
    case PaymentMethod.PAYMENT_APP:
      return hasValue(details?.appName);
    case PaymentMethod.OTHER:
      return hasValue(details?.description);
    default:
      return false;
  }
}

export async function registerDraftInvoiceRoutes(app: FastifyInstance) {
  app.get("/v1/invoices/drafts", async (request) => ({ items: await listDraftInvoices(getUserId(request)) }));
  app.get("/v1/invoices/issued", async (request) => ({ items: await listIssuedInvoices(getUserId(request)) }));

  app.get<{ Querystring: IssuedInvoiceQuery }>("/v1/invoices/issued/export-csv", async (request, reply) => {
    const query = request.query ?? {};
    const userId = getUserId(request);
    const customers = await listCustomers(userId);
    const issuedInvoices = await listIssuedInvoices(userId);
    const search = query.search?.trim().toLowerCase() ?? "";

    const filtered = issuedInvoices.filter((invoice: DraftInvoice) => {
      if (query.customerId && invoice.customerId !== query.customerId) return false;
      if (query.documentType && invoice.documentType !== query.documentType) return false;
      if (query.fromDate && invoice.issueDate < query.fromDate) return false;
      if (query.toDate && invoice.issueDate > query.toDate) return false;
      if (!search) return true;

      const customer = customers.find((item: Customer) => item.id === invoice.customerId);
      const customerName = customer?.displayNameHe.toLowerCase() ?? "";
      const sequence = String(invoice.sequenceNumber ?? "");

      return customerName.includes(search) || sequence.includes(search);
    });

    const escape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

    const header = ["מספר מסמך", "תאריך", "לקוח", "סוג מסמך", "מטבע", "לפני מעמ", "מעמ", "סהכ", "יתרה", "הונפק בתאריך"]
      .map(escape).join(",");

    const rows = filtered.map((invoice: DraftInvoice) => {
      const customer = customers.find((item: Customer) => item.id === invoice.customerId);
      return [
        invoice.sequenceNumber ?? "",
        invoice.issueDate,
        customer?.displayNameHe ?? "לקוח לא ידוע",
        getDocumentTypeLabel(invoice.documentType),
        invoice.currency,
        invoice.subtotalAmount,
        invoice.vatAmount,
        invoice.totalAmount,
        invoice.balanceDue,
        invoice.issuedAt ?? ""
      ].map(escape).join(",");
    });

    const csv = [header, ...rows].join("\n");

    reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename=issued-invoices-${new Date().toISOString().slice(0, 10)}.csv`);

    return reply.send(`\uFEFF${csv}`);
  });

  app.post<{ Params: InvoiceParams }>("/v1/invoices/:id/return-note", async (request, reply) => {
    try {
      const returnNote = await createReturnNote(getUserId(request), request.params.id);
      return reply.code(201).send(returnNote);
    } catch (error) {
      if (error instanceof Error) {
        const msgs: Record<string, string> = {
          INVOICE_NOT_FOUND: "המסמך המקורי לא נמצא",
          INVOICE_ALREADY_CANCELLED: "המסמך כבר בוטל",
          CANNOT_RETURN_CREDIT_NOTE: "לא ניתן ליצור תעודת החזרה לתעודת זיכוי",
          CANNOT_RETURN_RETURN_NOTE: "לא ניתן ליצור תעודת החזרה לתעודת החזרה",
          CANNOT_RETURN_PROFORMA: "לא ניתן ליצור תעודת החזרה לחשבון עסקה"
        };
        if (msgs[error.message]) return reply.code(400).send({ message: msgs[error.message] });
      }
      throw error;
    }
  });

  app.post<{ Params: InvoiceParams }>("/v1/invoices/:id/credit-note", async (request, reply) => {
    try {
      const creditNote = await createCreditNote(getUserId(request), request.params.id);
      return reply.code(201).send(creditNote);
    } catch (error) {
      if (error instanceof Error) {
        const msgs: Record<string, string> = {
          INVOICE_NOT_FOUND: "המסמך המקורי לא נמצא",
          INVOICE_ALREADY_CANCELLED: "המסמך כבר בוטל",
          CANNOT_CREDIT_CREDIT_NOTE: "לא ניתן לזכות תעודת זיכוי",
          CANNOT_CREDIT_RECEIPT: "לא ניתן לזכות קבלה — צור מסמך ידנית"
        };
        if (msgs[error.message]) return reply.code(400).send({ message: msgs[error.message] });
      }
      throw error;
    }
  });

  app.post<{ Params: InvoiceParams }>("/v1/invoices/:id/issue", async (request, reply) => {
    try {
      const invoice = await issueDraftInvoice(getUserId(request), request.params.id);
      return reply.send(invoice);
    } catch (error) {
      if (error instanceof Error && error.message === "INVOICE_NOT_FOUND") {
        return reply.code(404).send({ message: "המסמך לא נמצא" });
      }
      throw error;
    }
  });

  app.get<{ Params: InvoiceParams }>("/v1/invoices/:id/export-html", async (request, reply) => {
    const invoice = await getInvoiceForExport(getUserId(request), request.params.id);

    if (!invoice) {
      return reply.code(404).send({ message: "המסמך לא נמצא" });
    }

    reply.type("text/html; charset=utf-8");
    return reply.send(buildInvoiceHtml(invoice));
  });

  app.get<{ Params: InvoiceParams }>("/v1/invoices/:id/export-pdf", async (request, reply) => {
    const invoice = await getInvoiceForExport(getUserId(request), request.params.id);

    if (!invoice) {
      return reply.code(404).send({ message: "המסמך לא נמצא" });
    }

    const html = buildInvoiceHtml(invoice);

    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: "load" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      reply
        .type("application/pdf")
        .header("Content-Disposition", `attachment; filename="invoice-${invoice.sequenceNumber ?? invoice.id}.pdf"`)
        .send(Buffer.from(pdfBuffer));
    } finally {
      await page.close();
    }
  });

  app.post<{ Body: CreateDraftInvoiceBody }>("/v1/invoices/drafts", async (request, reply) => {
    const body = request.body ?? {};
    const userId = getUserId(request);

    if (!body.customerId) {
      return reply.code(400).send({ message: "יש לבחור לקוח" });
    }

    const customerExists = (await listCustomers(userId)).some((customer: { id: string }) => customer.id === body.customerId);

    if (!customerExists) {
      return reply.code(404).send({ message: "הלקוח לא נמצא" });
    }

    if (!body.issueDate) {
      return reply.code(400).send({ message: "תאריך מסמך הוא שדה חובה" });
    }

    if (body.documentType && !Object.values(DocumentType).includes(body.documentType)) {
      return reply.code(400).send({ message: "סוג מסמך לא תקין" });
    }

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return reply.code(400).send({ message: "יש להזין לפחות שורת חיוב אחת" });
    }

    const payment = body.payment;

    if (payment?.method && !Object.values(PaymentMethod).includes(payment.method)) {
      return reply.code(400).send({ message: "אמצעי תשלום לא תקין" });
    }

    const receiptLikeDocument =
      body.documentType === DocumentType.RECEIPT || body.documentType === DocumentType.INVOICE_RECEIPT;

    if (receiptLikeDocument) {
      if (!payment?.method) {
        return reply.code(400).send({ message: "בקבלה חובה לבחור אמצעי תשלום" });
      }

      if (!validatePaymentDetails(payment.method, payment.details)) {
        return reply.code(400).send({ message: "יש להשלים פרטי תשלום מתאימים עבור הקבלה" });
      }
    }

    const invalidLine = body.lines.find((line) => {
      return (
        !line.descriptionHe?.trim() ||
        !line.quantity ||
        line.quantity <= 0 ||
        line.unitPrice === undefined ||
        line.unitPrice < 0 ||
        line.vatRate === undefined ||
        line.vatRate < 0
      );
    });

    if (invalidLine) {
      return reply.code(400).send({ message: "אחת משורות המסמך אינה תקינה" });
    }

    try {
      const invoice = await createDraftInvoice(userId, {
        customerId: body.customerId,
        documentType: body.documentType,
        issueDate: body.issueDate,
        dueDate: body.dueDate,
        notesHe: body.notesHe,
        payment: payment?.method
          ? {
              method: payment.method,
              details: normalizePaymentDetails(payment.details)
            }
          : undefined,
        lines: body.lines.map((line) => ({
          descriptionHe: line.descriptionHe!.trim(),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          vatRate: Number(line.vatRate)
        }))
      });

      return reply.code(201).send(invoice);
    } catch (error) {
      if (error instanceof Error && error.message === "DOCUMENT_TYPE_NOT_ALLOWED") {
        return reply.code(400).send({ message: "סוג המסמך אינו מותר עבור סוג העוסק" });
      }

      throw error;
    }
  });
}
