export enum BusinessTaxProfile {
  PTUR = "PTUR",
  MURSHE = "MURSHE"
}

export enum DocumentType {
  TAX_INVOICE = "TAX_INVOICE",
  INVOICE_RECEIPT = "INVOICE_RECEIPT",
  RECEIPT = "RECEIPT",
  CREDIT_NOTE = "CREDIT_NOTE",
  RETURN_NOTE = "RETURN_NOTE",
  PROFORMA = "PROFORMA"
}

export enum DocumentStatus {
  DRAFT = "DRAFT",
  ISSUED = "ISSUED",
  PARTIALLY_PAID = "PARTIALLY_PAID",
  PAID = "PAID",
  CANCELLED = "CANCELLED"
}

export enum PaymentMethod {
  CREDIT = "CREDIT",
  CHECK = "CHECK",
  CASH = "CASH",
  BANK_TRANSFER = "BANK_TRANSFER",
  PAYMENT_APP = "PAYMENT_APP",
  OTHER = "OTHER"
}

export const DOCUMENT_TYPE_HEBREW_LABELS: Record<DocumentType, string> = {
  [DocumentType.TAX_INVOICE]: "חשבונית מס",
  [DocumentType.INVOICE_RECEIPT]: "חשבונית מס קבלה",
  [DocumentType.RECEIPT]: "קבלה",
  [DocumentType.CREDIT_NOTE]: "תעודת זיכוי",
  [DocumentType.RETURN_NOTE]: "תעודת החזרה",
  [DocumentType.PROFORMA]: "חשבונית עסקה"
};

export const PAYMENT_METHOD_HEBREW_LABELS: Record<PaymentMethod, string> = {
  [PaymentMethod.CREDIT]: "אשראי",
  [PaymentMethod.CHECK]: "צ'ק",
  [PaymentMethod.CASH]: "מזומן",
  [PaymentMethod.BANK_TRANSFER]: "העברה בנקאית",
  [PaymentMethod.PAYMENT_APP]: "אפליקציית תשלום",
  [PaymentMethod.OTHER]: "אחר"
};

export function getDocumentTypeLabel(type?: DocumentType) {
  if (!type) {
    return "מסמך";
  }

  return DOCUMENT_TYPE_HEBREW_LABELS[type] ?? "מסמך";
}

export function getPaymentMethodLabel(method?: PaymentMethod) {
  if (!method) {
    return "אמצעי תשלום";
  }

  return PAYMENT_METHOD_HEBREW_LABELS[method] ?? "אמצעי תשלום";
}

export type Money = string;

export type CustomerType = "PRIVATE" | "COMPANY";

export type Customer = {
  id: string;
  displayNameHe: string;
  legalNameHe?: string;
  type: CustomerType;
  taxId?: string;
  email?: string;
  phone?: string;
  addressHe?: string;
  cityHe?: string;
  paymentTermsDays: number;
  isActive: boolean;
  createdAt: string;
};

export type CreateCustomerInput = {
  displayNameHe: string;
  legalNameHe?: string;
  type: CustomerType;
  taxId?: string;
  email?: string;
  phone?: string;
  addressHe?: string;
  cityHe?: string;
  paymentTermsDays?: number;
};

export type DraftInvoiceLineInput = {
  descriptionHe: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
};

export type DraftInvoiceLine = DraftInvoiceLineInput & {
  lineSubtotal: number;
  lineVatAmount: number;
  lineTotal: number;
};

export type ReceiptPayment = {
  method: PaymentMethod;
  details?: Record<string, string | number | boolean>;
};

export type DraftInvoice = {
  id: string;
  customerId: string;
  issueDate: string;
  dueDate?: string;
  currency: string;
  status: DocumentStatus;
  documentType?: DocumentType;
  sequenceNumber?: number;
  notesHe?: string;
  payment?: ReceiptPayment;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  balanceDue: number;
  lines: DraftInvoiceLine[];
  issuedAt?: string;
  createdAt: string;
};

export type CreateDraftInvoiceInput = {
  customerId: string;
  documentType?: DocumentType;
  issueDate: string;
  dueDate?: string;
  notesHe?: string;
  payment?: ReceiptPayment;
  lines: DraftInvoiceLineInput[];
};

export type DocumentSeriesConfig = {
  documentType: DocumentType;
  prefix: string;
  startingNumber: number;
};

export type PrintTemplateConfig = {
  /** Hex color for the document header and totals bar (e.g. "#0f172a") */
  primaryColor: string;
  /** CSS font-family string to use in the PDF */
  fontFamily: string;
};

export const PRINT_FONT_OPTIONS: { label: string; value: string; googleFont?: string }[] = [
  { label: "Inter (ברירת מחדל)", value: "Inter, Arial, sans-serif" },
  { label: "Heebo (עברי מומלץ)", value: "Heebo, Arial, sans-serif", googleFont: "Heebo" },
  { label: "Rubik", value: "Rubik, Arial, sans-serif", googleFont: "Rubik" },
  { label: "Frank Ruhl Libre (סריף)", value: "'Frank Ruhl Libre', serif", googleFont: "Frank+Ruhl+Libre" },
  { label: "David Libre (קלאסי)", value: "'David Libre', serif", googleFont: "David+Libre" },
];

export const PRINT_COLOR_PRESETS = [
  { label: "כחול כהה (ברירת מחדל)", value: "#0f172a" },
  { label: "כחול נייבי", value: "#1e3a8a" },
  { label: "ירוק יער", value: "#14532d" },
  { label: "סגול כהה", value: "#4c1d95" },
  { label: "אדום כהה", value: "#7f1d1d" },
  { label: "טיל", value: "#134e4a" },
  { label: "חום כהה", value: "#431407" },
];

export type BusinessSettings = {
  nameHe: string;
  detailsHe?: string;
  taxId: string;
  taxProfile: BusinessTaxProfile;
  addressHe?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  seriesConfig?: DocumentSeriesConfig[];
  printTemplate?: PrintTemplateConfig;
};

export type UpdateBusinessSettingsInput = {
  nameHe: string;
  taxId?: string;
  taxProfile?: BusinessTaxProfile;
  detailsHe?: string;
  addressHe?: string;
  phone?: string;
  email?: string;
  logoUrl?: string;
  seriesConfig?: DocumentSeriesConfig[];
  printTemplate?: PrintTemplateConfig;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateDraftInvoice(lines: DraftInvoiceLineInput[]) {
  const normalizedLines = lines.map((line) => {
    const lineSubtotal = roundMoney(line.quantity * line.unitPrice);
    const lineVatAmount = roundMoney(lineSubtotal * (line.vatRate / 100));
    const lineTotal = roundMoney(lineSubtotal + lineVatAmount);

    return {
      ...line,
      lineSubtotal,
      lineVatAmount,
      lineTotal
    };
  });

  const subtotalAmount = roundMoney(
    normalizedLines.reduce((sum, line) => sum + line.lineSubtotal, 0)
  );
  const vatAmount = roundMoney(
    normalizedLines.reduce((sum, line) => sum + line.lineVatAmount, 0)
  );
  const totalAmount = roundMoney(subtotalAmount + vatAmount);

  return {
    lines: normalizedLines,
    subtotalAmount,
    vatAmount,
    totalAmount,
    balanceDue: totalAmount
  };
}

