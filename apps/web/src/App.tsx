import { useEffect, Fragment, useMemo, useState, useCallback } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, ChevronDown, FileX, FilePlus2, Mail, Moon, Printer, ReceiptText, RotateCcw, Search, Share2, Sun, X, Users } from "lucide-react";
import {
  calculateDraftInvoice,
  getDocumentTypeLabel,
  getPaymentMethodLabel,
  BusinessTaxProfile,
  DocumentType,
  DocumentStatus,
  PaymentMethod,
  PRINT_COLOR_PRESETS,
  PRINT_FONT_OPTIONS,
  type BusinessSettings,
  type CreateCustomerInput,
  type CreateDraftInvoiceInput,
  type Customer,
  type DocumentSeriesConfig,
  type DraftInvoice,
  type DraftInvoiceLineInput,
  type UpdateBusinessSettingsInput
} from "@invoice/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "";
const currencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS"
});

const today = new Date().toISOString().slice(0, 10);

function formatDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const emptyCustomerForm: CreateCustomerInput = {
  displayNameHe: "",
  type: "PRIVATE",
  taxId: "",
  email: "",
  phone: "",
  addressHe: "",
  cityHe: "",
  paymentTermsDays: 0
};

const emptyInvoiceLine: DraftInvoiceLineInput = {
  descriptionHe: "",
  quantity: 1,
  unitPrice: 0,
  vatRate: 17
};

const defaultBusinessSettings: BusinessSettings = {
  nameHe: "",
  taxId: "",
  taxProfile: BusinessTaxProfile.MURSHE
};

type ExpenseItem = {
  id: string;
  date: string;
  category: string;
  amount: number;
  notes?: string;
};

type ServiceItem = {
  name: string;
  defaultPrice: number;
};

type QuoteFormState = {
  customerId: string;
  issueDate: string;
  dueDate: string;
  descriptionHe: string;
  amount: string;
  vatRate: string;
  notesHe: string;
};

const emptyQuoteForm = (customerId = ""): QuoteFormState => ({
  customerId,
  issueDate: today,
  dueDate: today,
  descriptionHe: "",
  amount: "",
  vatRate: "17",
  notesHe: ""
});

type ReturnNoteLine = {
  descriptionHe: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
  selected: boolean;
};

type ReturnNoteFormState = {
  customerId: string;
  sourceInvoiceId: string;
  issueDate: string;
  notesHe: string;
  lines: ReturnNoteLine[];
};

const emptyReturnNoteForm = (): ReturnNoteFormState => ({
  customerId: "",
  sourceInvoiceId: "",
  issueDate: today,
  notesHe: "",
  lines: [{ descriptionHe: "", quantity: "1", unitPrice: "0", vatRate: "17", selected: true }]
});

type WorkspaceTab = DocumentType | "QUOTE" | "REPORTS";

type ReceiptPaymentFormState = {
  method: PaymentMethod;
  cardNumber: string;
  cardType: string;
  installments: string;
  approvalCode: string;
  creditDate: string;
  checkNumber: string;
  checkAccountNumber: string;
  bankName: string;
  branchNumber: string;
  checkDueDate: string;
  transferReference: string;
  transferDate: string;
  transferAccountNumber: string;
  transferBranchNumber: string;
  paymentAppName: string;
  paymentAppTransactionId: string;
  paymentAppPayerPhone: string;
  otherDescription: string;
};

const emptyReceiptPaymentForm: ReceiptPaymentFormState = {
  method: PaymentMethod.CASH,
  cardNumber: "",
  cardType: "",
  installments: "",
  approvalCode: "",
  creditDate: "",
  checkNumber: "",
  checkAccountNumber: "",
  bankName: "",
  branchNumber: "",
  checkDueDate: "",
  transferReference: "",
  transferDate: "",
  transferAccountNumber: "",
  transferBranchNumber: "",
  paymentAppName: "",
  paymentAppTransactionId: "",
  paymentAppPayerPhone: "",
  otherDescription: ""
};

type ReportEntry = {
  id: string;
  date: string;
  amount: number;
};

const monthOptions = [
  { value: "ALL", label: "כל השנה" },
  { value: "01", label: "ינואר" },
  { value: "02", label: "פברואר" },
  { value: "03", label: "מרץ" },
  { value: "04", label: "אפריל" },
  { value: "05", label: "מאי" },
  { value: "06", label: "יוני" },
  { value: "07", label: "יולי" },
  { value: "08", label: "אוגוסט" },
  { value: "09", label: "ספטמבר" },
  { value: "10", label: "אוקטובר" },
  { value: "11", label: "נובמבר" },
  { value: "12", label: "דצמבר" }
];

function getTabDocumentType(tab: WorkspaceTab): DocumentType {
  if (tab === "QUOTE" || tab === "REPORTS") return DocumentType.PROFORMA;
  return tab;
}

function getTabLabel(tab: WorkspaceTab) {
  if (tab === "QUOTE") return "הצעת מחיר";
  if (tab === "REPORTS") return 'דו"חות';
  return getDocumentTypeLabel(tab);
}

function normalizePaymentDetails(details: Record<string, string | number | boolean | undefined>) {
  const entries = Object.entries(details).filter(([, value]) => {
    if (value === undefined) {
      return false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    return true;
  });

  return Object.fromEntries(entries) as Record<string, string | number | boolean>;
}

function buildReceiptPaymentPayload(form: ReceiptPaymentFormState) {
  switch (form.method) {
    case PaymentMethod.CREDIT:
      return {
        method: PaymentMethod.CREDIT,
        details: normalizePaymentDetails({
          cardNumber: form.cardNumber.trim(),
          cardType: form.cardType.trim(),
          installments: Number(form.installments) || 1,
          approvalCode: form.approvalCode.trim(),
          date: form.creditDate
        })
      };
    case PaymentMethod.CHECK:
      return {
        method: PaymentMethod.CHECK,
        details: normalizePaymentDetails({
          checkNumber: form.checkNumber.trim(),
          bankName: form.bankName.trim(),
          branchNumber: form.branchNumber.trim(),
          accountNumber: form.checkAccountNumber.trim(),
          dueDate: form.checkDueDate
        })
      };
    case PaymentMethod.BANK_TRANSFER:
      return {
        method: PaymentMethod.BANK_TRANSFER,
        details: normalizePaymentDetails({
          reference: form.transferReference.trim(),
          transferDate: form.transferDate,
          bankName: form.bankName.trim(),
          branchNumber: form.transferBranchNumber.trim(),
          accountNumber: form.transferAccountNumber.trim()
        })
      };
    case PaymentMethod.PAYMENT_APP:
      return {
        method: PaymentMethod.PAYMENT_APP,
        details: normalizePaymentDetails({
          appName: form.paymentAppName.trim(),
          transactionId: form.paymentAppTransactionId.trim(),
          payerPhone: form.paymentAppPayerPhone.trim()
        })
      };
    case PaymentMethod.OTHER:
      return {
        method: PaymentMethod.OTHER,
        details: normalizePaymentDetails({
          description: form.otherDescription.trim()
        })
      };
    case PaymentMethod.CASH:
    default:
      return {
        method: PaymentMethod.CASH,
        details: normalizePaymentDetails({})
      };
  }
}

function validateReceiptPayment(form: ReceiptPaymentFormState) {
  switch (form.method) {
    case PaymentMethod.CREDIT:
      return form.cardNumber.trim().length > 0;
    case PaymentMethod.CHECK:
      return form.checkNumber.trim().length > 0;
    case PaymentMethod.BANK_TRANSFER:
      return form.transferReference.trim().length > 0;
    case PaymentMethod.PAYMENT_APP:
      return form.paymentAppName.trim().length > 0;
    case PaymentMethod.OTHER:
      return form.otherDescription.trim().length > 0;
    case PaymentMethod.CASH:
    default:
      return true;
  }
}

function App({ user, onLogout }: { user: { displayName: string; email: string }; onLogout: () => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [draftInvoices, setDraftInvoices] = useState<DraftInvoice[]>([]);
  const [issuedInvoices, setIssuedInvoices] = useState<DraftInvoice[]>([]);
  const [customerForm, setCustomerForm] = useState<CreateCustomerInput>(emptyCustomerForm);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(defaultBusinessSettings);

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTab = (searchParams.get("tab") as WorkspaceTab) ?? DocumentType.TAX_INVOICE;
  const setSelectedTab = useCallback((tab: WorkspaceTab) => {
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set("tab", tab); return next; }, { replace: false });
  }, [setSearchParams]);

  const [activeDrawer, setActiveDrawer] = useState<"business" | "user" | null>(null);

  const [invoiceForm, setInvoiceForm] = useState<CreateDraftInvoiceInput>({
    customerId: "",
    documentType: DocumentType.TAX_INVOICE,
    issueDate: today,
    dueDate: today,
    notesHe: "",
    lines: [{ ...emptyInvoiceLine }]
  });
  const [loading, setLoading] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingQuote, setSavingQuote] = useState(false);
  const [savingExpense, setSavingExpense] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());
  const [issuedSearch, setIssuedSearch] = useState("");
  const [issuedCustomerFilter, setIssuedCustomerFilter] = useState("");
  const [issuedFromDate, setIssuedFromDate] = useState("");
  const [issuedToDate, setIssuedToDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [showAllExpenses, setShowAllExpenses] = useState(false);
  const [issuedPage, setIssuedPage] = useState(1);
  const ISSUED_PAGE_SIZE = 10;
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [expenseDate, setExpenseDate] = useState(today);
  const [expenseCategory, setExpenseCategory] = useState("הוצאות משרד");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(emptyQuoteForm());
  const [returnNoteForm, setReturnNoteForm] = useState<ReturnNoteFormState>(emptyReturnNoteForm());
  const [savingReturnNote, setSavingReturnNote] = useState(false);
  const [receiptPaymentForm, setReceiptPaymentForm] = useState<ReceiptPaymentFormState>(emptyReceiptPaymentForm);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState("ALL");
  const [demoDocs, setDemoDocs] = useState<DraftInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [newServiceItemName, setNewServiceItemName] = useState("");
  const [newServiceItemPrice, setNewServiceItemPrice] = useState("");

  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // ── Toasts + dialogs ─────────────────────────────────────────
  type Toast = { id: number; message: string; type: "info" | "success" | "error" };
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = (message: string, type: Toast["type"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };
  type ConfirmState = { message: string; resolve: (ok: boolean) => void } | null;
  const [confirmDialog, setConfirmDialog] = useState<ConfirmState>(null);
  const confirmAction = (message: string) =>
    new Promise<boolean>((resolve) => setConfirmDialog({ message, resolve }));
  type PromptState = { label: string; defaultValue: string; resolve: (val: string | null) => void } | null;
  const [promptDialog, setPromptDialog] = useState<PromptState>(null);
  const [promptValue, setPromptValue] = useState("");
  const promptInput = (label: string, defaultValue = "") =>
    new Promise<string | null>((resolve) => {
      setPromptValue(defaultValue);
      setPromptDialog({ label, defaultValue, resolve });
    });

  const selectedDocumentType = getTabDocumentType(selectedTab);
  const isPtur = businessSettings.taxProfile === BusinessTaxProfile.PTUR;
  const isReceiptLikeTab =
    selectedDocumentType === DocumentType.RECEIPT ||
    selectedDocumentType === DocumentType.INVOICE_RECEIPT;
  const totals = useMemo(() => calculateDraftInvoice(invoiceForm.lines), [invoiceForm.lines]);
  const selectedDocumentLabel = getTabLabel(selectedTab);

  const filteredDraftInvoices = useMemo(
    () => draftInvoices.filter((inv) => inv.documentType === selectedDocumentType),
    [draftInvoices, selectedDocumentType]
  );

  const filteredCustomers = useMemo(
    () =>
      customerSearch.trim()
        ? customers.filter(
            (c) =>
              c.displayNameHe.toLowerCase().includes(customerSearch.toLowerCase()) ||
              (c.taxId ?? "").includes(customerSearch)
          )
        : customers,
    [customers, customerSearch]
  );

  const filteredIssuedByType = useMemo(
    () => issuedInvoices.filter((inv) => inv.documentType === selectedDocumentType),
    [issuedInvoices, selectedDocumentType]
  );

  const filteredIssuedInvoices = useMemo(() => {
    const search = issuedSearch.trim().toLowerCase();

    return filteredIssuedByType.filter((invoice) => {
      if (issuedCustomerFilter && invoice.customerId !== issuedCustomerFilter) {
        return false;
      }

      if (issuedFromDate && invoice.issueDate < issuedFromDate) {
        return false;
      }

      if (issuedToDate && invoice.issueDate > issuedToDate) {
        return false;
      }

      if (!search) {
        return true;
      }

      const customer = customers.find((item) => item.id === invoice.customerId);
      const customerName = customer?.displayNameHe.toLowerCase() ?? "";
      const sequence = String(invoice.sequenceNumber ?? "");

      return customerName.includes(search) || sequence.includes(search);
    });
  }, [filteredIssuedByType, issuedSearch, issuedCustomerFilter, issuedFromDate, issuedToDate, customers]);

  // Reset to page 1 whenever the filter set changes
  useEffect(() => {
    setIssuedPage(1);
  }, [issuedSearch, issuedCustomerFilter, issuedFromDate, issuedToDate, selectedTab]);

  const issuedTotalPages = Math.max(1, Math.ceil(filteredIssuedInvoices.length / ISSUED_PAGE_SIZE));
  const issuedCurrentPage = Math.min(issuedPage, issuedTotalPages);
  const pagedIssuedInvoices = useMemo(
    () => filteredIssuedInvoices.slice((issuedCurrentPage - 1) * ISSUED_PAGE_SIZE, issuedCurrentPage * ISSUED_PAGE_SIZE),
    [filteredIssuedInvoices, issuedCurrentPage]
  );

  const reportIncomeEntries = useMemo(
    () =>
      [...issuedInvoices, ...demoDocs]
        .filter((invoice) => invoice.documentType === DocumentType.RECEIPT || invoice.documentType === DocumentType.INVOICE_RECEIPT)
        .map((invoice) => ({ id: invoice.id, date: invoice.issueDate, amount: invoice.totalAmount })),
    [issuedInvoices, demoDocs]
  );

  const reportExpenseEntries = useMemo(
    () => expenses.map((expense) => ({ id: expense.id, date: expense.date, amount: expense.amount })),
    [expenses]
  );

  const reportYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);

    for (const item of [...reportIncomeEntries, ...reportExpenseEntries]) {
      const year = Number(item.date.slice(0, 4));

      if (Number.isFinite(year)) {
        years.add(year);
      }
    }

    return Array.from(years).sort((a, b) => b - a);
  }, [reportIncomeEntries, reportExpenseEntries]);

  const reportStats = useMemo(() => {
    const isMonthMatch = (date: string) => {
      const year = Number(date.slice(0, 4));
      const month = date.slice(5, 7);
      return year === reportYear && (reportMonth === "ALL" || month === reportMonth);
    };

    const totalIncome = reportIncomeEntries
      .filter((item) => isMonthMatch(item.date))
      .reduce((sum, item) => sum + item.amount, 0);

    const totalExpenses = reportExpenseEntries
      .filter((item) => isMonthMatch(item.date))
      .reduce((sum, item) => sum + item.amount, 0);

    const netProfit = totalIncome - totalExpenses;

    return {
      totalIncome,
      totalExpenses,
      netProfit
    };
  }, [reportIncomeEntries, reportExpenseEntries, reportMonth, reportYear]);

  const monthlySeries = useMemo(() => {
    const selectedMonths =
      reportMonth === "ALL"
        ? Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"))
        : [reportMonth];

    const months = selectedMonths.map((month) => {
      const date = new Date(reportYear, Number(month) - 1, 1);
      return {
        key: `${reportYear}-${month}`,
        label: date.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }),
        income: 0,
        expense: 0
      };
    });

    const monthIndex = new Map(months.map((month, index) => [month.key, index]));

    for (const item of reportIncomeEntries) {
      const key = item.date.slice(0, 7);
      const index = monthIndex.get(key);

      if (index !== undefined) {
        const targetMonth = months[index];

        if (targetMonth) {
          targetMonth.income += item.amount;
        }
      }
    }

    for (const item of reportExpenseEntries) {
      const key = item.date.slice(0, 7);
      const index = monthIndex.get(key);

      if (index !== undefined) {
        const targetMonth = months[index];

        if (targetMonth) {
          targetMonth.expense += item.amount;
        }
      }
    }

    return months.map((month) => ({
      ...month,
      income: Math.round(month.income * 100) / 100,
      expense: Math.round(month.expense * 100) / 100
    }));
  }, [reportExpenseEntries, reportIncomeEntries, reportMonth, reportYear]);

  const chartSeries = useMemo(() => {
    const now = new Date();
    // Always show 24 months ending at current month
    const totalMonths = 24;
    const months = Array.from({ length: totalMonths }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (totalMonths - 1 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }), income: 0, expense: 0 };
    });

    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    for (const item of reportIncomeEntries) {
      const idx = monthIndex.get(item.date.slice(0, 7));
      if (idx !== undefined) months[idx]!.income += item.amount;
    }
    for (const item of reportExpenseEntries) {
      const idx = monthIndex.get(item.date.slice(0, 7));
      if (idx !== undefined) months[idx]!.expense += item.amount;
    }

    return months.map((m) => ({ ...m, income: Math.round(m.income * 100) / 100, expense: Math.round(m.expense * 100) / 100 }));
  }, [reportIncomeEntries, reportExpenseEntries]);

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("invoice-service-items");
      if (!raw) return;
      const parsed = JSON.parse(raw) as ServiceItem[];
      if (Array.isArray(parsed)) setServiceItems(parsed);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("invoice-service-items", JSON.stringify(serviceItems));
  }, [serviceItems]);

  useEffect(() => {
    if (isPtur) {
      setInvoiceForm((current) => ({
        ...current,
        lines: current.lines.map((line) => ({ ...line, vatRate: 0 }))
      }));
      // Reset to a valid tab for ptur if currently on a murshe-only tab
      const pturInvalidTabs: WorkspaceTab[] = [DocumentType.TAX_INVOICE, DocumentType.INVOICE_RECEIPT, "QUOTE"];
      if (pturInvalidTabs.includes(selectedTab)) {
        setSelectedTab(DocumentType.RECEIPT);
      }
    }
  }, [isPtur]);

  useEffect(() => {
    if (reportYears.length === 0) {
      return;
    }

    const firstYear = reportYears[0];

    if (firstYear !== undefined && !reportYears.includes(reportYear)) {
      setReportYear(firstYear);
    }
  }, [reportYear, reportYears]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const checkJson = (res: Response, name: string) => {
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          throw new Error(`כתובת ה-API שגויה — ${name} החזיר HTML במקום JSON. בדקו ש-VITE_API_URL מצביע על שירות ה-API ולא על האתר.`);
        }
      };

      const [customersResponse, draftsResponse, issuedResponse, businessSettingsResponse, expensesResponse] = await Promise.all([
        fetch(`${API_URL}/v1/customers`, { credentials: "include" }),
        fetch(`${API_URL}/v1/invoices/drafts`, { credentials: "include" }),
        fetch(`${API_URL}/v1/invoices/issued`, { credentials: "include" }),
        fetch(`${API_URL}/v1/business/settings`, { credentials: "include" }),
        fetch(`${API_URL}/v1/expenses`, { credentials: "include" }),
      ]);

      checkJson(customersResponse, "customers");
      checkJson(draftsResponse, "drafts");
      checkJson(issuedResponse, "issued");
      checkJson(businessSettingsResponse, "business/settings");

      if (!customersResponse.ok || !draftsResponse.ok || !issuedResponse.ok || !businessSettingsResponse.ok) {
        // If HTML is returned it means CORS is blocking or the API URL is wrong
        const ct = customersResponse.headers.get("content-type") ?? "";
        if (!ct.includes("application/json")) {
          throw new Error(`שגיאת CORS או כתובת API שגויה (${customersResponse.status})`);
        }
        throw new Error("טעינת הנתונים נכשלה");
      }

      const customersJson = (await customersResponse.json()) as { items: Customer[] };
      const draftsJson = (await draftsResponse.json()) as { items: DraftInvoice[] };
      const issuedJson = (await issuedResponse.json()) as { items: DraftInvoice[] };
      const businessSettingsJson = (await businessSettingsResponse.json()) as BusinessSettings;
      const expensesJson = expensesResponse.ok ? (await expensesResponse.json()) as { items: ExpenseItem[] } : { items: [] };

      setCustomers(customersJson.items);
      setDraftInvoices(draftsJson.items);
      setIssuedInvoices(issuedJson.items);
      setBusinessSettings(businessSettingsJson);
      setExpenses(expensesJson.items);
      setInvoiceForm((current) => ({
        ...current,
        customerId: current.customerId || customersJson.items[0]?.id || ""
      }));
      setQuoteForm((current) => ({
        ...current,
        customerId: current.customerId || customersJson.items[0]?.id || ""
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "שגיאה לא צפויה");
    } finally {
      setLoading(false);
    }
  }

  function updateCustomerField<Key extends keyof CreateCustomerInput>(key: Key, value: CreateCustomerInput[Key]) {
    setCustomerForm((current) => ({ ...current, [key]: value }));
  }

  function updateInvoiceField<Key extends keyof CreateDraftInvoiceInput>(key: Key, value: CreateDraftInvoiceInput[Key]) {
    setInvoiceForm((current) => ({ ...current, [key]: value }));
  }

  function updateInvoiceLine(index: number, key: keyof DraftInvoiceLineInput, value: string) {
    setInvoiceForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) {
          return line;
        }

        if (key === "quantity" || key === "unitPrice" || key === "vatRate") {
          return {
            ...line,
            [key]: Number(value)
          };
        }

        return {
          ...line,
          [key]: value
        };
      })
    }));
  }

  function addInvoiceLine() {
    setInvoiceForm((current) => ({
      ...current,
      lines: [...current.lines, { ...emptyInvoiceLine, vatRate: isPtur ? 0 : 17 }]
    }));
  }

  function removeInvoiceLine(index: number) {
    setInvoiceForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index)
    }));
  }

  async function handleCustomerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCustomer(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/customers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "שמירת הלקוח נכשלה");
      }

      const createdCustomer = (await response.json()) as Customer;
      setCustomerForm(emptyCustomerForm);
      setInvoiceForm((current) => ({
        ...current,
        customerId: current.customerId || createdCustomer.id
      }));
      setQuoteForm((current) => ({
        ...current,
        customerId: current.customerId || createdCustomer.id
      }));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "שמירת הלקוח נכשלה");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleCustomerUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCustomerId) return;
    setSavingCustomer(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/v1/customers/${editingCustomerId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(customerForm)
      });
      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "עדכון הלקוח נכשל");
      }
      setEditingCustomerId(null);
      setCustomerForm(emptyCustomerForm);
      await loadData();
      toast("הלקוח עודכן בהצלחה", "success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "עדכון הלקוח נכשל");
    } finally {
      setSavingCustomer(false);
    }
  }

  async function handleInvoiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingInvoice(true);
    setError(null);

    try {
      const isReceiptLike =
        selectedDocumentType === DocumentType.RECEIPT ||
        selectedDocumentType === DocumentType.INVOICE_RECEIPT;

      if (isReceiptLike && !validateReceiptPayment(receiptPaymentForm)) {
        throw new Error("יש להשלים פרטי תשלום תקינים עבור קבלה");
      }

      const payload: CreateDraftInvoiceInput = {
        ...invoiceForm,
        documentType: selectedDocumentType,
        payment: isReceiptLike ? buildReceiptPaymentPayload(receiptPaymentForm) : undefined
      };

      const response = await fetch(`${API_URL}/v1/invoices/drafts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "שמירת הטיוטה נכשלה");
      }

      await response.json();
      setInvoiceForm((current) => ({
        ...current,
        documentType: selectedDocumentType,
        notesHe: "",
        lines: [{ ...emptyInvoiceLine, vatRate: isPtur ? 0 : 17 }]
      }));
      setReceiptPaymentForm(emptyReceiptPaymentForm);
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "שמירת הטיוטה נכשלה");
    } finally {
      setSavingInvoice(false);
    }
  }

  async function handleQuoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingQuote(true);
    setError(null);

    try {
      const amount = Number(quoteForm.amount);
      const vatRate = Number(quoteForm.vatRate);

      if (!quoteForm.customerId) {
        throw new Error("יש לבחור לקוח להצעת המחיר");
      }

      if (!quoteForm.descriptionHe.trim()) {
        throw new Error("יש להזין תיאור להצעת המחיר");
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("סכום הצעת המחיר חייב להיות גדול מאפס");
      }

      const payload: CreateDraftInvoiceInput = {
        customerId: quoteForm.customerId,
        documentType: DocumentType.PROFORMA,
        issueDate: quoteForm.issueDate,
        dueDate: quoteForm.dueDate,
        notesHe: quoteForm.notesHe,
        lines: [
          {
            descriptionHe: quoteForm.descriptionHe,
            quantity: 1,
            unitPrice: amount,
            vatRate: isPtur ? 0 : (Number.isFinite(vatRate) ? vatRate : 17)
          }
        ]
      };

      const response = await fetch(`${API_URL}/v1/invoices/drafts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "שמירת הצעת המחיר נכשלה");
      }

      await response.json();
      setSelectedTab("QUOTE");
      setQuoteForm(emptyQuoteForm(quoteForm.customerId));
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "שמירת הצעת המחיר נכשלה");
    } finally {
      setSavingQuote(false);
    }
  }

  async function handleReturnNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingReturnNote(true);
    setError(null);

    try {
      if (!returnNoteForm.customerId) throw new Error("יש לבחור לקוח");
      const selectedLines = returnNoteForm.lines.filter((l) => l.selected);
      if (selectedLines.length === 0) throw new Error("יש לבחור לפחות פריט אחד להחזרה");

      const payload: CreateDraftInvoiceInput = {
        customerId: returnNoteForm.customerId,
        documentType: DocumentType.RETURN_NOTE,
        issueDate: returnNoteForm.issueDate,
        notesHe: returnNoteForm.notesHe || undefined,
        lines: selectedLines.map((l) => ({
          descriptionHe: l.descriptionHe,
          quantity: -(Math.abs(Number(l.quantity)) || 1),
          unitPrice: Math.abs(Number(l.unitPrice)),
          vatRate: Number(l.vatRate)
        }))
      };

      const draftRes = await fetch(`${API_URL}/v1/invoices/drafts`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!draftRes.ok) {
        const data = (await draftRes.json()) as { message?: string };
        throw new Error(data.message ?? "יצירת הטיוטה נכשלה");
      }

      const draft = (await draftRes.json()) as { id: string };

      const issueRes = await fetch(`${API_URL}/v1/invoices/${draft.id}/issue`, {
        method: "POST",
        credentials: "include"
      });

      if (!issueRes.ok) {
        const data = (await issueRes.json()) as { message?: string };
        throw new Error(data.message ?? "הנפקת תעודת ההחזרה נכשלה");
      }

      setReturnNoteForm(emptyReturnNoteForm());
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "יצירת תעודת ההחזרה נכשלה");
    } finally {
      setSavingReturnNote(false);
    }
  }

  async function removeExpense(id: string) {
    try {
      const res = await fetch(`${API_URL}/v1/expenses/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        setExpenses((current) => current.filter((item) => item.id !== id));
      } else {
        toast("מחיקת ההוצאה נכשלה", "error");
      }
    } catch {
      toast("שגיאת רשת — נסה שוב", "error");
    }
  }

  function resetExpenseForm() {
    setExpenseDate(today);
    setExpenseCategory("הוצאות משרד");
    setExpenseAmount("");
    setExpenseNotes("");
  }

  async function handleAddExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingExpense(true);
    setError(null);

    try {
      const amount = Number(expenseAmount);

      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("סכום ההוצאה חייב להיות גדול מאפס");
      }

      const res = await fetch(`${API_URL}/v1/expenses`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: expenseDate,
          category: expenseCategory.trim() || "הוצאה",
          amount,
          notes: expenseNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? "שמירת ההוצאה נכשלה");
      }

      const created = (await res.json()) as ExpenseItem;
      setExpenses((current) => [created, ...current]);
      resetExpenseForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "שמירת ההוצאה נכשלה");
    } finally {
      setSavingExpense(false);
    }
  }

  function loadTempDemoData() {
    const now = new Date();
    const firstCustomerId = customers[0]?.id || "demo-customer-1";

    const demoDocs: DraftInvoice[] = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 14);
      const monthShift = 5 - index;
      const amount = 4500 + monthShift * 780;

      return {
        id: `demo-doc-${date.toISOString().slice(0, 7)}`,
        customerId: firstCustomerId,
        issueDate: date.toISOString().slice(0, 10),
        dueDate: date.toISOString().slice(0, 10),
        currency: "ILS",
        status: "ISSUED" as DocumentStatus,
        documentType: DocumentType.RECEIPT,
        sequenceNumber: 100 + index,
        notesHe: "דוגמה זמנית",
        payment: {
          method: PaymentMethod.CASH,
          details: {}
        },
        subtotalAmount: amount / 1.17,
        vatAmount: amount - amount / 1.17,
        totalAmount: amount,
        balanceDue: 0,
        issuedAt: date.toISOString(),
        createdAt: date.toISOString(),
        lines: [
          {
            descriptionHe: "שירותים דוגמה",
            quantity: 1,
            unitPrice: amount / 1.17,
            vatRate: 17,
            lineSubtotal: amount / 1.17,
            lineVatAmount: amount - amount / 1.17,
            lineTotal: amount
          }
        ]
      } satisfies DraftInvoice;
    });

    setDemoDocs(demoDocs);
    setReportYear(now.getFullYear());
    setReportMonth("ALL");
  }

  function clearTempDemoData() {
    setDemoDocs([]);
  }

  async function handleIssueInvoice(invoiceId: string) {
    setIssuingInvoiceId(invoiceId);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/invoices/${invoiceId}/issue`, {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "הנפקת המסמך נכשלה");
      }

      await loadData();
    } catch (issueError) {
      setError(issueError instanceof Error ? issueError.message : "הנפקת המסמך נכשלה");
    } finally {
      setIssuingInvoiceId(null);
    }
  }

  function openPrintableInvoice(invoiceId: string) {
    window.open(`${API_URL}/v1/invoices/${invoiceId}/export-html`, "_blank", "noopener,noreferrer");
  }

  async function shareViaWhatsApp(invoiceId: string) {
    let blob: Blob | null = null;
    let filename = `invoice-${invoiceId}.pdf`;
    try {
      const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/export-pdf`, { credentials: "include" });
      if (!res.ok) { toast("שגיאה בייצוא PDF", "error"); return; }
      blob = await res.blob();
      filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? filename;
    } catch {
      toast("שגיאת רשת — לא ניתן לייצא PDF", "error");
      return;
    }

    const file = new File([blob], filename, { type: "application/pdf" });
    let shared = false;

    // Mobile: use native share sheet
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "חשבונית", text: "הינה החשבונית שלך" });
        shared = true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return; // user cancelled
        // share failed — fall through to desktop fallback
      }
    }

    // Desktop fallback: download PDF + open WhatsApp Web
    if (!shared) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      window.open("https://web.whatsapp.com", "_blank", "noopener,noreferrer");
    }
  }

  async function issueReturnNote(invoiceId: string) {
    if (!await confirmAction("האם ליצור תעודת החזרה עבור מסמך זה?")) return;
    try {
      const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/return-note`, {
        method: "POST",
        credentials: "include"
      });
      const data = (await res.json()) as { id?: string; message?: string };
      if (res.ok) {
        setIssuedInvoices((prev) => [...prev, data as any]);
        toast("תעודת ההחזרה נוצרה בהצלחה", "success");
      } else {
        toast(data.message ?? "יצירת תעודת ההחזרה נכשלה", "error");
      }
    } catch {
      toast("שגיאת רשת — נסה שוב", "error");
    }
  }

  async function issueCreditNote(invoiceId: string) {
    if (!await confirmAction("האם ליצור תעודת זיכוי עבור מסמך זה?\nהמסמך המקורי יסומן כמבוטל.")) return;
    try {
      const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/credit-note`, {
        method: "POST",
        credentials: "include"
      });
      const data = (await res.json()) as { id?: string; message?: string };
      if (res.ok) {
        setIssuedInvoices((prev) => [...prev, data as any]);
        setIssuedInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoiceId ? { ...inv, status: DocumentStatus.CANCELLED } : inv
          )
        );
        toast("תעודת הזיכוי נוצרה בהצלחה", "success");
      } else {
        toast(data.message ?? "יצירת תעודת הזיכוי נכשלה", "error");
      }
    } catch {
      toast("שגיאת רשת — נסה שוב", "error");
    }
  }

  async function sendInvoiceEmail(invoiceId: string, toEmail?: string) {
    try {
      const to = await promptInput("כתובת מייל לשליחה:", toEmail ?? "");
      if (!to?.trim()) return;
      const res = await fetch(`${API_URL}/v1/invoices/${invoiceId}/send-email`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() })
      });
      const data = (await res.json()) as { ok?: boolean; to?: string; message?: string };
      if (res.ok) {
        toast(`המייל נשלח בהצלחה אל ${data.to}`, "success");
      } else {
        toast(data.message ?? "שליחת המייל נכשלה", "error");
      }
    } catch {
      toast("שגיאת רשת — נסה שוב", "error");
    }
  }

  function updateBusinessSettingsField<Key extends keyof UpdateBusinessSettingsInput>(
    key: Key,
    value: UpdateBusinessSettingsInput[Key]
  ) {
    setBusinessSettings((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function downloadFullExport() {
    try {
      const res = await fetch(`${API_URL}/v1/export/full`, { credentials: "include" });
      if (!res.ok) throw new Error("ייצוא נכשל");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "invoice-export.zip";
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast("ייצוא הנתונים נכשל — נסה שוב", "error");
    }
  }

  async function handleImportZip(file: File) {
    if (!await confirmAction(`ייבוא הנתונים מ"${file.name}"?\nלקוחות וחשבוניות קיימים עם אותו מזהה יוחלפו. הפעולה בלתי הפיכה.`)) return;
    try {
      const res = await fetch(`${API_URL}/v1/import/full`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/octet-stream" },
        body: file
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; importedCustomers?: number; importedInvoices?: number; skippedInvoices?: number };
      if (!res.ok) {
        toast(data.message ?? "ייבוא נכשל", "error");
        return;
      }
      toast(`ייבוא הושלם! לקוחות: ${data.importedCustomers}, חשבוניות: ${data.importedInvoices}`, "success");
      await loadData();
    } catch {
      toast("ייבוא הנתונים נכשל — נסה שוב", "error");
    }
  }

  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (pwNew.length < 8) { setPwError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים"); return; }
    if (pwNew !== pwConfirm) { setPwError("הסיסמאות החדשות אינן תואמות"); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew })
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok) { setPwError(data.message ?? "שינוי הסיסמה נכשל"); return; }
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setPwSuccess(true);
    } catch {
      setPwError("שגיאת רשת — נסה שוב");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleBusinessSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSettings(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/v1/business/settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameHe: businessSettings.nameHe,
          taxId: businessSettings.taxId,
          taxProfile: businessSettings.taxProfile,
          detailsHe: businessSettings.detailsHe,
          addressHe: businessSettings.addressHe,
          phone: businessSettings.phone,
          email: businessSettings.email,
          logoUrl: businessSettings.logoUrl,
          seriesConfig: businessSettings.seriesConfig,
          printTemplate: businessSettings.printTemplate
        } satisfies UpdateBusinessSettingsInput)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "שמירת הגדרות העסק נכשלה");
      }

      const updatedSettings = (await response.json()) as BusinessSettings;
      setBusinessSettings(updatedSettings);
      setActiveDrawer(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "שמירת הגדרות העסק נכשלה");
    } finally {
      setSavingSettings(false);
    }
  }

  function exportIssuedInvoicesCsv() {
    const params = new URLSearchParams();

    params.set("documentType", selectedDocumentType);

    if (issuedSearch.trim()) {
      params.set("search", issuedSearch.trim());
    }

    if (issuedCustomerFilter) {
      params.set("customerId", issuedCustomerFilter);
    }

    if (issuedFromDate) {
      params.set("fromDate", issuedFromDate);
    }

    if (issuedToDate) {
      params.set("toDate", issuedToDate);
    }

    const query = params.toString();
    const url = `${API_URL}/v1/invoices/issued/export-csv${query ? `?${query}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto max-w-7xl overflow-x-hidden px-3 py-4 sm:px-6 md:px-10 md:py-8" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <header className="mb-4 rounded-[20px] bg-slate-900 p-4 text-white shadow-lg shadow-slate-200 sm:rounded-[28px] sm:p-5 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1.5">
              <p className="text-xs text-slate-400 sm:text-sm sm:text-slate-300">מערכת הנהלת חשבונות ישראלית</p>
              <h1 className="text-xl font-semibold leading-snug sm:text-2xl md:text-3xl">פאנל תפעול מהיר לעוסק פטור ולעוסק מורשה</h1>
            </div>

            <div className="grid grid-cols-3 gap-2 md:gap-3">
              <StatCard icon={<Users className="h-5 w-5" />} label="לקוחות פעילים" value={String(customers.length)} />
              <StatCard icon={<FilePlus2 className="h-5 w-5" />} label="סה״כ טיוטות" value={String(draftInvoices.length)} />
              <StatCard icon={<ReceiptText className="h-5 w-5" />} label="סה״כ מסמכים שהונפקו" value={String(issuedInvoices.length)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <span className="me-auto text-sm text-slate-400">{user.displayName}</span>
            <button
              className={`flex items-center gap-1.5 rounded-xl p-2 text-white transition sm:px-3 sm:py-1.5 ${activeDrawer === "business" ? "bg-white/25 ring-1 ring-white/40" : "bg-white/10 hover:bg-white/20"}`}
              onClick={() => setActiveDrawer((d) => d === "business" ? null : "business")}
              aria-label="הגדרות עסק"
            >
              <Building2 className="h-4 w-4" />
              <span className="hidden text-sm font-medium sm:inline">הגדרות עסק</span>
            </button>
            <button
              className={`flex items-center gap-1.5 rounded-xl p-2 text-white transition sm:px-3 sm:py-1.5 ${activeDrawer === "user" ? "bg-white/25 ring-1 ring-white/40" : "bg-white/10 hover:bg-white/20"}`}
              onClick={() => setActiveDrawer((d) => d === "user" ? null : "user")}
              aria-label="הגדרות משתמש"
            >
              <Users className="h-4 w-4" />
              <span className="hidden text-sm font-medium sm:inline">הגדרות משתמש</span>
            </button>
            <button
              className="flex items-center gap-1.5 rounded-xl border border-rose-400/50 bg-rose-500/20 p-2 text-rose-200 hover:bg-rose-500/30 sm:px-3 sm:py-1.5"
              onClick={onLogout}
              aria-label="יציאה"
            >
              <X className="h-4 w-4" />
              <span className="hidden text-sm font-medium sm:inline">יציאה</span>
            </button>
            <button
              className="rounded-xl border border-white/20 p-2 text-white hover:bg-white/10"
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? "עבור למצב בהיר" : "עבור למצב כהה"}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {/* Document Type Tabs */}
        <nav className="mb-6 flex gap-0 overflow-x-auto border-b border-slate-200 bg-white px-4 py-0 dark:border-slate-700 dark:bg-slate-900 sm:px-6">
          {(isPtur
            ? [DocumentType.RECEIPT, DocumentType.PROFORMA, DocumentType.RETURN_NOTE, "REPORTS"] as WorkspaceTab[]
            : [DocumentType.TAX_INVOICE, DocumentType.RECEIPT, DocumentType.INVOICE_RECEIPT, DocumentType.PROFORMA, DocumentType.RETURN_NOTE, "QUOTE", "REPORTS"] as WorkspaceTab[]
          ).map((tab) => (
            <Fragment key={tab}>
              {tab === "REPORTS" ? (
                <div className="my-auto mx-2 h-5 w-px shrink-0 bg-slate-200 dark:bg-slate-700" />
              ) : null}
              <button
                onClick={() => {
                  setSelectedTab(tab);

                  if (tab !== "QUOTE" && tab !== "REPORTS" && tab !== DocumentType.RETURN_NOTE) {
                    setInvoiceForm((current) => ({ ...current, documentType: tab as DocumentType }));
                  }
                }}
                className={`px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap sm:py-2 sm:text-sm ${
                  selectedTab === tab
                    ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {getTabLabel(tab)}
              </button>
            </Fragment>
          ))}
        </nav>

        {activeDrawer !== null ? (
          <div className="fixed inset-0 z-40 bg-slate-900/50" onClick={() => setActiveDrawer(null)} />
        ) : null}

        {activeDrawer === "business" ? (
          <aside className="drawer-slide-in fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <h2 className="text-base font-semibold">הגדרות עסק</h2>
                <p className="text-xs text-slate-500">שם, פרטי עסק ולוגו שיופיעו במסמכי הדפסה.</p>
              </div>
              <button type="button" onClick={() => setActiveDrawer(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="סגירה">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <form className="grid gap-4" onSubmit={handleBusinessSettingsSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="שם עסק">
                  <input
                    className="input"
                    value={businessSettings.nameHe}
                    onChange={(event) => updateBusinessSettingsField("nameHe", event.target.value)}
                    autoComplete="organization"
                  />
                </Field>
                <Field label={businessSettings.taxProfile === BusinessTaxProfile.PTUR ? "ע.פ" : "ע.מ"}>
                  <input
                    className="input ltr-text"
                    placeholder="מספר עוסק / חברה"
                    value={businessSettings.taxId ?? ""}
                    onChange={(event) => updateBusinessSettingsField("taxId", event.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="סוג עוסק">
                  <select
                    className="input"
                    value={businessSettings.taxProfile}
                    onChange={(event) => updateBusinessSettingsField("taxProfile", event.target.value as BusinessTaxProfile)}
                  >
                    <option value={BusinessTaxProfile.MURSHE}>עוסק מורשה (עם מע״מ)</option>
                    <option value={BusinessTaxProfile.PTUR}>עוסק פטור (ללא מע״מ)</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="כתובת">
                  <input
                    className="input"
                    value={businessSettings.addressHe ?? ""}
                    onChange={(event) => updateBusinessSettingsField("addressHe", event.target.value)}
                    autoComplete="street-address"
                  />
                </Field>
                <Field label="טלפון">
                  <input
                    className="input"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={businessSettings.phone ?? ""}
                    onChange={(event) => updateBusinessSettingsField("phone", event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Field label="תיאור קצר">
                  <input
                    className="input"
                    value={businessSettings.detailsHe ?? ""}
                    onChange={(event) => updateBusinessSettingsField("detailsHe", event.target.value)}
                    placeholder="למשל: שירותי הנהלת חשבונות לעסקים"
                  />
                </Field>
                <Field label="אימייל">
                  <input
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={businessSettings.email ?? ""}
                    onChange={(event) => updateBusinessSettingsField("email", event.target.value)}
                  />
                </Field>
                <div className="grid gap-2 text-sm font-medium text-slate-700">
                  <span>לוגו עסק</span>
                  <div className="flex items-center gap-3">
                    {businessSettings.logoUrl ? (
                      <img
                        src={businessSettings.logoUrl}
                        alt="לוגו"
                        style={{ maxHeight: "56px", maxWidth: "240px", width: "auto", height: "auto", display: "block", flexShrink: 0, border: "1px solid #e2e8f0", borderRadius: 0 }}
                      />
                    ) : (
                      <div className="flex h-12 w-16 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400 text-xs">
                        לוגו
                      </div>
                    )}
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => document.getElementById("logo-upload-input")?.click()}
                    >
                      {businessSettings.logoUrl ? "החלפת תמונה" : "העלאת תמונה"}
                    </button>
                    <input
                      id="logo-upload-input"
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => updateBusinessSettingsField("logoUrl", reader.result as string);
                        reader.readAsDataURL(file);
                        event.target.value = "";
                      }}
                    />
                    {businessSettings.logoUrl ? (
                      <button
                        type="button"
                        className="text-sm text-rose-600 hover:text-rose-800"
                        onClick={() => updateBusinessSettingsField("logoUrl", "")}
                      >
                        הסרה
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="border-t border-indigo-200 pt-4">
                <h3 className="mb-1 text-sm font-semibold">עיצוב תבנית הדפסה</h3>
                <p className="mb-3 text-xs text-slate-500">צבע ופונט שישמשו בכותרת ובטבלת הסכומים של מסמכי ה-PDF.</p>
                {(() => {
                  const defaultColor = "#0f172a";
                  const defaultFont = PRINT_FONT_OPTIONS[0]?.value ?? "Inter, Arial, sans-serif";
                  const curColor = businessSettings.printTemplate?.primaryColor ?? defaultColor;
                  const curFont = businessSettings.printTemplate?.fontFamily ?? defaultFont;
                  const setPrintTemplate = (primaryColor: string, fontFamily: string) =>
                    updateBusinessSettingsField("printTemplate", { primaryColor, fontFamily });
                  return (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-medium text-slate-600">צבע ראשי</p>
                        <div className="flex flex-wrap gap-2">
                          {PRINT_COLOR_PRESETS.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              title={preset.label}
                              onClick={() => setPrintTemplate(preset.value, curFont)}
                              className={`h-7 w-7 rounded-full border-2 transition ${
                                curColor === preset.value ? "scale-110 border-slate-900" : "border-transparent hover:scale-105"
                              }`}
                              style={{ backgroundColor: preset.value }}
                            />
                          ))}
                          <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500">
                            <input
                              type="color"
                              className="h-7 w-7 cursor-pointer rounded-full border-0 p-0"
                              value={curColor}
                              onChange={(e) => setPrintTemplate(e.target.value, curFont)}
                            />
                            מותאם אישית
                          </label>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="inline-block h-4 w-4 rounded-sm" style={{ backgroundColor: curColor }} />
                          <span className="text-xs text-slate-500">{curColor}</span>
                        </div>
                      </div>
                      <Field label="פונט">
                        <select
                          className="input"
                          value={curFont}
                          onChange={(e) => setPrintTemplate(curColor, e.target.value)}
                        >
                          {PRINT_FONT_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  );
                })()}
                {/* Live preview bar */}
                <div
                  className="mt-3 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{
                    backgroundColor: businessSettings.printTemplate?.primaryColor ?? "#0f172a",
                    fontFamily: businessSettings.printTemplate?.fontFamily ?? (PRINT_FONT_OPTIONS[0]?.value ?? "Inter, Arial, sans-serif")
                  }}
                >
                  {businessSettings.nameHe || "שם העסק"} — תצוגה מקדימה של כותרת המסמך
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  onClick={() => setActiveDrawer(null)}
                >
                  סגירה
                </button>
                <button
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                  disabled={savingSettings}
                >
                  {savingSettings ? "שומר..." : "שמירת הגדרות"}
                </button>
              </div>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="mb-1 text-base font-semibold">מספור מסמכים — סדרות</h3>
              <p className="mb-4 text-sm text-slate-500">הגדר קידומת (למשל INV-) ומספר התחלה לכל סוג מסמך. שינוי מספר ההתחלה ייכנס לתוקף רק אם טרם הונפק מסמך מאותו סוג בשנה הנוכחית.</p>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">סוג מסמך</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">קידומת</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-600">מספר התחלה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(DocumentType).map((dt) => {
                      const cfg = businessSettings.seriesConfig?.find((c) => c.documentType === dt);
                      return (
                        <tr key={dt} className="border-t border-slate-200">
                          <td className="px-4 py-2 font-medium">{getDocumentTypeLabel(dt)}</td>
                          <td className="px-4 py-2">
                            <input
                              className="input w-28 py-1 text-sm"
                              placeholder="למשל: INV-"
                              value={cfg?.prefix ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setBusinessSettings((prev) => {
                                  const existing = prev.seriesConfig ?? [];
                                  const idx = existing.findIndex((c) => c.documentType === dt);
                                  const entry: DocumentSeriesConfig = { documentType: dt, prefix: val, startingNumber: cfg?.startingNumber ?? 1 };
                                  const next = idx >= 0 ? existing.map((c, i) => i === idx ? entry : c) : [...existing, entry];
                                  return { ...prev, seriesConfig: next };
                                });
                              }}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              className="input w-24 py-1 text-sm"
                              type="number"
                              min="1"
                              step="1"
                              value={cfg?.startingNumber ?? 1}
                              onChange={(e) => {
                                const val = Math.max(1, Number(e.target.value) || 1);
                                setBusinessSettings((prev) => {
                                  const existing = prev.seriesConfig ?? [];
                                  const idx = existing.findIndex((c) => c.documentType === dt);
                                  const entry: DocumentSeriesConfig = { documentType: dt, prefix: cfg?.prefix ?? "", startingNumber: val };
                                  const next = idx >= 0 ? existing.map((c, i) => i === idx ? entry : c) : [...existing, entry];
                                  return { ...prev, seriesConfig: next };
                                });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">השינויים יישמרו בלחיצה על "שמירת הגדרות" בטופס למעלה.</p>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-6">
              <h3 className="mb-1 text-base font-semibold">רשימת שירותים ומוצרים</h3>
              <p className="mb-4 text-sm text-slate-500">פריטים לבחירה מהירה בשורות חיוב, כולל מחיר ברירת מחדל הניתן לעריכה בכל שורה.</p>
              <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
                <input
                  className="input flex-1"
                  value={newServiceItemName}
                  onChange={(e) => setNewServiceItemName(e.target.value)}
                  placeholder="שם שירות / מוצר"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const name = newServiceItemName.trim();
                      if (name && !serviceItems.find((s) => s.name === name)) {
                        setServiceItems((prev) => [...prev, { name, defaultPrice: Number(newServiceItemPrice) || 0 }]);
                        setNewServiceItemName("");
                        setNewServiceItemPrice("");
                      }
                    }
                  }}
                />
                <input
                  className="input w-32"
                  type="number"
                  min="0"
                  step="1"
                  value={newServiceItemPrice}
                  onChange={(e) => setNewServiceItemPrice(e.target.value)}
                  placeholder="מחיר ברירת מחדל"
                />
                <button
                  type="button"
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  onClick={() => {
                    const name = newServiceItemName.trim();
                    if (name && !serviceItems.find((s) => s.name === name)) {
                      setServiceItems((prev) => [...prev, { name, defaultPrice: Number(newServiceItemPrice) || 0 }]);
                      setNewServiceItemName("");
                      setNewServiceItemPrice("");
                    }
                  }}
                >
                  הוספה
                </button>
              </div>
              {serviceItems.length === 0 ? (
                <p className="text-sm text-slate-400">עדיין לא נוספו שירותים.</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-right font-medium text-slate-600">שם</th>
                        <th className="px-4 py-2 text-right font-medium text-slate-600">מחיר ברירת מחדל</th>
                        <th className="w-12" />
                      </tr>
                    </thead>
                    <tbody>
                      {serviceItems.map((item) => (
                        <tr key={item.name} className="border-t border-slate-200">
                          <td className="px-4 py-2">{item.name}</td>
                          <td className="px-4 py-2">
                            <input
                              className="input w-28 py-1 text-sm"
                              type="number"
                              min="0"
                              step="1"
                              value={item.defaultPrice}
                              onChange={(e) =>
                                setServiceItems((prev) =>
                                  prev.map((s) => s.name === item.name ? { ...s, defaultPrice: Number(e.target.value) || 0 } : s)
                                )
                              }
                            />
                          </td>
                          <td className="px-4 py-2 text-center">
                            <button
                              type="button"
                              className="rounded p-1 text-slate-400 hover:text-rose-600"
                              onClick={() => setServiceItems((prev) => prev.filter((s) => s.name !== item.name))}
                              aria-label="הסר שירות"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            </div>
          </aside>
        ) : null}

        {activeDrawer === "user" ? (
          <aside className="drawer-slide-in fixed inset-0 z-50 flex flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900">
              <div>
                <h2 className="text-base font-semibold">הגדרות משתמש</h2>
                <p className="text-xs text-slate-500">פרטי חשבון אישי — סיסמה, ייצוא וייבוא נתונים.</p>
              </div>
              <button type="button" onClick={() => setActiveDrawer(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="סגירה">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
            <div className="border-t border-violet-200 pt-6">
              <h3 className="mb-1 text-base font-semibold">שינוי סיסמה</h3>
              <p className="mb-4 text-sm text-slate-500">יש להזין את הסיסמה הנוכחית לאישור זהות.</p>
              <form className="grid max-w-sm gap-3" onSubmit={handleChangePassword}>
                <Field label="סיסמה נוכחית">
                  <input
                    className="input"
                    type="password"
                    autoComplete="current-password"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    required
                  />
                </Field>
                <Field label="סיסמה חדשה (מינימום 8 תווים)">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={pwNew}
                    onChange={(e) => { setPwNew(e.target.value); setPwSuccess(false); }}
                    required
                    minLength={8}
                  />
                </Field>
                <Field label="אימות סיסמה חדשה">
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    value={pwConfirm}
                    onChange={(e) => { setPwConfirm(e.target.value); setPwSuccess(false); }}
                    required
                    minLength={8}
                  />
                </Field>
                {pwError ? (
                  <p className="text-sm text-rose-600">{pwError}</p>
                ) : null}
                {pwSuccess ? (
                  <p className="text-sm text-emerald-700">הסיסמה שונתה בהצלחה</p>
                ) : null}
                <div className="flex justify-end">
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                    disabled={pwSaving}
                  >
                    {pwSaving ? "שומר..." : "שינוי סיסמה"}
                  </button>
                </div>
              </form>
            </div>

            <div className="mt-6 border-t border-violet-200 pt-6">
              <h3 className="mb-1 text-base font-semibold">גיבוי ושחזור נתונים</h3>
              <p className="mb-4 text-sm text-slate-500">ייצא את כל הנתונים כ-ZIP לגיבוי, או יבא מייצוא קודם.</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                  onClick={downloadFullExport}
                >
                  ⬇ ייצוא כל הנתונים (ZIP)
                </button>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                  ⬆ ייבוא מ-ZIP
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportZip(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            </div>
          </aside>
        ) : null}

        {error ? (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        ) : null}

        <section className="grid min-w-0 gap-5 xl:grid-cols-[1.1fr_1.4fr]">
          <div className="order-last min-w-0 space-y-6 xl:order-first">
            <Panel title={editingCustomerId ? "עריכת לקוח" : "פתיחת לקוח חדש"} description={editingCustomerId ? "עדכן פרטי לקוח קיים." : "הזנה מהירה בעברית, עם שדות מינימליים להתחלה מהירה."} collapsible>
              <form className="grid gap-4" onSubmit={editingCustomerId ? handleCustomerUpdate : handleCustomerSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="שם תצוגה">
                    <input className="input" value={customerForm.displayNameHe} onChange={(event) => updateCustomerField("displayNameHe", event.target.value)} placeholder="למשל: יעל לוי" autoComplete="name" />
                  </Field>
                  <Field label="סוג לקוח">
                    <select className="input" value={customerForm.type} onChange={(event) => updateCustomerField("type", event.target.value as CreateCustomerInput["type"])}>
                      <option value="PRIVATE">פרטי</option>
                      <option value="COMPANY">חברה</option>
                    </select>
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="ח.פ / ת.ז">
                    <input className="input" value={customerForm.taxId ?? ""} onChange={(event) => updateCustomerField("taxId", event.target.value)} inputMode="numeric" />
                  </Field>
                  <Field label="ימי אשראי">
                    <input className="input" type="number" min="0" step="1" value={customerForm.paymentTermsDays ?? 0} onChange={(event) => updateCustomerField("paymentTermsDays", Number(event.target.value))} inputMode="numeric" />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="אימייל">
                    <input className="input" type="email" autoComplete="email" value={customerForm.email ?? ""} onChange={(event) => updateCustomerField("email", event.target.value)} />
                  </Field>
                  <Field label="טלפון">
                    <input className="input" type="tel" autoComplete="tel" inputMode="tel" value={customerForm.phone ?? ""} onChange={(event) => updateCustomerField("phone", event.target.value)} />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="כתובת">
                    <input className="input" value={customerForm.addressHe ?? ""} onChange={(event) => updateCustomerField("addressHe", event.target.value)} autoComplete="street-address" />
                  </Field>
                  <Field label="עיר">
                    <input className="input" value={customerForm.cityHe ?? ""} onChange={(event) => updateCustomerField("cityHe", event.target.value)} autoComplete="address-level2" />
                  </Field>
                </div>

                <div className="flex justify-end gap-2">
                  {editingCustomerId ? (
                    <button
                      type="button"
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      onClick={() => { setEditingCustomerId(null); setCustomerForm(emptyCustomerForm); }}
                    >
                      ביטול
                    </button>
                  ) : null}
                  <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60" disabled={savingCustomer}>
                    {savingCustomer ? "שומר..." : editingCustomerId ? "עדכון לקוח" : "שמירת לקוח"}
                  </button>
                </div>
              </form>
            </Panel>

            <Panel title="רשימת לקוחות" description="גישה מהירה ללקוחות שנפתחו לאחרונה.">
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                  placeholder="חיפוש לקוח..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  inputMode="search"
                  enterKeyHint="search"
                />
              </div>
              <div className="max-h-[28rem] space-y-3 overflow-y-auto">
                {loading ? <EmptyState text="טוען לקוחות..." /> : null}
                {!loading && customers.length === 0 ? <EmptyState text="עדיין אין לקוחות. צרו את הלקוח הראשון." /> : null}
                {!loading && customers.length > 0 && filteredCustomers.length === 0 ? <EmptyState text="לא נמצאו לקוחות." /> : null}
                {filteredCustomers.map((customer) => {
                  const isExpanded = expandedCustomerIds.has(customer.id);
                  const toggleExpand = () => setExpandedCustomerIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(customer.id)) { next.delete(customer.id); } else { next.add(customer.id); }
                    return next;
                  });
                  return (
                  <article key={customer.id} className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 p-3 text-start"
                      onClick={toggleExpand}
                    >
                      <div>
                        <h3 className="font-medium">{customer.displayNameHe}</h3>
                        <p className="mt-0.5 text-xs text-slate-500">{customer.type === "COMPANY" ? "חברה" : "לקוח פרטי"} • {customer.paymentTermsDays} ימי אשראי</p>
                      </div>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                    {isExpanded ? (
                      <div className="border-t border-slate-200 px-3 pb-3 pt-2 dark:border-slate-700">
                        <div className="grid gap-1 text-sm text-slate-600 dark:text-slate-400">
                          {customer.taxId ? <span>מספר מזהה: {customer.taxId}</span> : null}
                          {customer.email ? <span>אימייל: {customer.email}</span> : null}
                          {customer.phone ? <span>טלפון: {customer.phone}</span> : null}
                          {customer.addressHe || customer.cityHe ? <span>כתובת: {[customer.addressHe, customer.cityHe].filter(Boolean).join(", ")}</span> : null}
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              setEditingCustomerId(customer.id);
                              setCustomerForm({
                                displayNameHe: customer.displayNameHe,
                                legalNameHe: customer.legalNameHe ?? "",
                                type: customer.type as "PRIVATE" | "COMPANY",
                                taxId: customer.taxId ?? "",
                                email: customer.email ?? "",
                                phone: customer.phone ?? "",
                                addressHe: customer.addressHe ?? "",
                                cityHe: customer.cityHe ?? "",
                                paymentTermsDays: customer.paymentTermsDays ?? 0,
                              });
                              // scroll the form into view
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            עריכה
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="min-w-0 space-y-6">
            {selectedTab === "REPORTS" ? (
              <Panel title='דו"חות' description="ניתוח פיננסי מפורט של פעילות העסק.">
                <ReportsPanel
                  issuedInvoices={issuedInvoices}
                  expenses={expenses}
                  customers={customers}
                  isPtur={isPtur}
                  currencyFormatter={currencyFormatter}
                />
              </Panel>
            ) : (<>
            {selectedTab === DocumentType.RETURN_NOTE ? (
              <Panel title="יצירת תעודת החזרה" description="בחר מסמך מקור, סמן פריטים וכמות להחזרה.">
                <form className="grid gap-4" onSubmit={handleReturnNoteSubmit}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="לקוח">
                      <select
                        className="input"
                        value={returnNoteForm.customerId}
                        onChange={(e) => setReturnNoteForm((f) => ({ ...f, customerId: e.target.value, sourceInvoiceId: "", lines: [{ descriptionHe: "", quantity: "1", unitPrice: "0", vatRate: isPtur ? "0" : "17", selected: true }] }))}
                      >
                        <option value="">בחרו לקוח</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.displayNameHe}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="מסמך מקור (אופציונלי)">
                      <select
                        className="input"
                        value={returnNoteForm.sourceInvoiceId}
                        onChange={(e) => {
                          const srcId = e.target.value;
                          const src = issuedInvoices.find((inv) => inv.id === srcId);
                          if (src) {
                            setReturnNoteForm((f) => ({
                              ...f,
                              sourceInvoiceId: srcId,
                              lines: src.lines.map((l) => ({
                                descriptionHe: l.descriptionHe,
                                quantity: String(Math.abs(l.quantity)),
                                unitPrice: String(Math.abs(l.unitPrice)),
                                vatRate: String(l.vatRate),
                                selected: true
                              }))
                            }));
                          } else {
                            setReturnNoteForm((f) => ({
                              ...f,
                              sourceInvoiceId: "",
                              lines: [{ descriptionHe: "", quantity: "1", unitPrice: "0", vatRate: isPtur ? "0" : "17", selected: true }]
                            }));
                          }
                        }}
                      >
                        <option value="">ללא — הזנה ידנית</option>
                        {issuedInvoices
                          .filter((inv) =>
                            (!returnNoteForm.customerId || inv.customerId === returnNoteForm.customerId) &&
                            inv.status !== "CANCELLED" &&
                            inv.documentType !== DocumentType.RETURN_NOTE &&
                            inv.documentType !== DocumentType.CREDIT_NOTE
                          )
                          .map((inv) => {
                            const label = `${getDocumentTypeLabel(inv.documentType ?? DocumentType.TAX_INVOICE)} #${inv.sequenceNumber ?? inv.id.slice(0, 8)} — ${currencyFormatter.format(inv.totalAmount)}`;
                            return <option key={inv.id} value={inv.id}>{label}</option>;
                          })}
                      </select>
                    </Field>
                  </div>

                  <Field label="תאריך החזרה">
                    <input
                      className="input"
                      type="date"
                      value={returnNoteForm.issueDate}
                      onChange={(e) => setReturnNoteForm((f) => ({ ...f, issueDate: e.target.value }))}
                    />
                  </Field>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">פריטים להחזרה</span>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        onClick={() => setReturnNoteForm((f) => ({
                          ...f,
                          lines: [...f.lines, { descriptionHe: "", quantity: "1", unitPrice: "0", vatRate: isPtur ? "0" : "17", selected: true }]
                        }))}
                      >
                        + הוסף שורה
                      </button>
                    </div>
                    <div className="space-y-2">
                      {returnNoteForm.lines.map((line, idx) => (
                        <div key={idx} className={`grid gap-2 rounded-xl border p-3 transition-colors ${line.selected ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-60"} sm:grid-cols-[auto_1fr_6rem_6rem_6rem_auto]`}>
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 accent-amber-600"
                            checked={line.selected}
                            onChange={(e) => setReturnNoteForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, selected: e.target.checked } : l) }))}
                          />
                          <input
                            className="input text-sm"
                            placeholder="תיאור פריט"
                            value={line.descriptionHe}
                            onChange={(e) => setReturnNoteForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, descriptionHe: e.target.value } : l) }))}
                          />
                          <input
                            className="input text-sm"
                            type="number"
                            min="0.001"
                            step="0.001"
                            placeholder="כמות"
                            value={line.quantity}
                            onChange={(e) => setReturnNoteForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l) }))}
                          />
                          <input
                            className="input text-sm"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="מחיר"
                            value={line.unitPrice}
                            onChange={(e) => setReturnNoteForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, unitPrice: e.target.value } : l) }))}
                          />
                          {!isPtur ? (
                            <input
                              className="input text-sm"
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="מע״מ%"
                              value={line.vatRate}
                              onChange={(e) => setReturnNoteForm((f) => ({ ...f, lines: f.lines.map((l, i) => i === idx ? { ...l, vatRate: e.target.value } : l) }))}
                            />
                          ) : <div />}
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:text-rose-600"
                            onClick={() => setReturnNoteForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                            aria-label="הסר שורה"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Field label="הערות">
                    <textarea
                      className="input min-h-16"
                      value={returnNoteForm.notesHe}
                      onChange={(e) => setReturnNoteForm((f) => ({ ...f, notesHe: e.target.value }))}
                      placeholder="סיבת ההחזרה (אופציונלי)"
                    />
                  </Field>

                  <div className="flex justify-end">
                    <button
                      className="rounded-xl bg-amber-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800 disabled:opacity-60"
                      disabled={savingReturnNote || customers.length === 0}
                    >
                      {savingReturnNote ? "מנפיק..." : "הנפקת תעודת החזרה"}
                    </button>
                  </div>
                </form>
              </Panel>
            ) : selectedTab === "QUOTE" ? (
              <Panel title="יצירת הצעת מחיר" description="טופס קצר להצעת מחיר מהירה (נשמר כחשבונית עסקה).">
                <form className="grid gap-4" onSubmit={handleQuoteSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="לקוח">
                    <select
                      className="input"
                      value={quoteForm.customerId}
                      onChange={(event) => setQuoteForm((current) => ({ ...current, customerId: event.target.value }))}
                    >
                      <option value="">בחרו לקוח</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.displayNameHe}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="תיאור ההצעה">
                    <input
                      className="input"
                      value={quoteForm.descriptionHe}
                      onChange={(event) => setQuoteForm((current) => ({ ...current, descriptionHe: event.target.value }))}
                      placeholder="למשל: פרויקט מיתוג מלא"
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                  <Field label="סכום לפני מע״מ">
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={quoteForm.amount}
                      onChange={(event) => setQuoteForm((current) => ({ ...current, amount: event.target.value }))}
                    />
                  </Field>
                  {!isPtur ? (
                    <Field label="מע״מ %">
                      <input
                        className="input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={quoteForm.vatRate}
                        onChange={(event) => setQuoteForm((current) => ({ ...current, vatRate: event.target.value }))}
                      />
                    </Field>
                  ) : null}
                  <Field label="תאריך הצעה">
                    <input
                      className="input"
                      type="date"
                      value={quoteForm.issueDate}
                      onChange={(event) => setQuoteForm((current) => ({ ...current, issueDate: event.target.value }))}
                    />
                  </Field>
                  <Field label="תוקף עד">
                    <input
                      className="input"
                      type="date"
                      value={quoteForm.dueDate}
                      onChange={(event) => setQuoteForm((current) => ({ ...current, dueDate: event.target.value }))}
                    />
                  </Field>
                </div>

                <Field label="הערות להצעה">
                  <textarea
                    className="input min-h-20"
                    value={quoteForm.notesHe}
                    onChange={(event) => setQuoteForm((current) => ({ ...current, notesHe: event.target.value }))}
                    placeholder="תנאי תשלום, לוחות זמנים ועוד"
                  />
                </Field>

                <div className="flex justify-end">
                  <button
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60"
                    disabled={savingQuote || customers.length === 0}
                  >
                    {savingQuote ? "שומר הצעה..." : "שמירת הצעת מחיר"}
                  </button>
                </div>
                </form>
              </Panel>
            ) : (
              <Panel title={`יצירת טיוטת ${selectedDocumentLabel}`} description="מילוי זריז עם חישוב סכומים בזמן אמת.">
              <form className="grid gap-5" onSubmit={handleInvoiceSubmit}>
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                  <Field label="לקוח">
                    <select className="input" value={invoiceForm.customerId} onChange={(event) => updateInvoiceField("customerId", event.target.value)}>
                      <option value="">בחרו לקוח</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.displayNameHe}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="סוג מסמך">
                    <div className="flex items-center rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-700 dark:border-slate-600 dark:text-slate-200">
                      {selectedDocumentLabel}
                    </div>
                  </Field>
                  <Field label="תאריך מסמך">
                    <input className="input" type="date" value={invoiceForm.issueDate} onChange={(event) => updateInvoiceField("issueDate", event.target.value)} />
                  </Field>
                  <Field label="תאריך פירעון">
                    <input className="input" type="date" value={invoiceForm.dueDate ?? ""} onChange={(event) => updateInvoiceField("dueDate", event.target.value)} />
                  </Field>
                </div>

                {isReceiptLikeTab ? (
                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <h3 className="font-medium">פרטי תשלום בקבלה</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="אמצעי תשלום">
                        <select
                          className="input bg-white"
                          value={receiptPaymentForm.method}
                          onChange={(event) =>
                            setReceiptPaymentForm((current) => ({
                              ...current,
                              method: event.target.value as PaymentMethod
                            }))
                          }
                        >
                          {Object.values(PaymentMethod).map((method) => (
                            <option key={method} value={method}>{getPaymentMethodLabel(method)}</option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    {receiptPaymentForm.method === PaymentMethod.CREDIT ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="מספר כרטיס">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.cardNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, cardNumber: event.target.value }))
                            }
                            placeholder="1234 5678 9012 3456"
                          />
                        </Field>
                        <Field label="סוג כרטיס">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.cardType}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, cardType: event.target.value }))
                            }
                            placeholder="ויזה / מאסטרקארד / אמקס"
                          />
                        </Field>
                        <Field label="מספר תשלומים">
                          <input
                            className="input bg-white"
                            type="number"
                            min="1"
                            value={receiptPaymentForm.installments}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, installments: event.target.value }))
                            }
                            placeholder="1"
                          />
                        </Field>
                        <Field label="אסמכתא">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.approvalCode}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, approvalCode: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="תאריך">
                          <input
                            className="input bg-white"
                            type="date"
                            value={receiptPaymentForm.creditDate}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, creditDate: event.target.value }))
                            }
                          />
                        </Field>
                      </div>
                    ) : null}

                    {receiptPaymentForm.method === PaymentMethod.CHECK ? (
                      <div className="grid gap-4 md:grid-cols-5">
                        <Field label="מספר צ'ק">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.checkNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, checkNumber: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="מספר חשבון">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.checkAccountNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, checkAccountNumber: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="בנק">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.bankName}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, bankName: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="סניף">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.branchNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, branchNumber: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="תאריך פירעון הצ'ק">
                          <input
                            className="input bg-white"
                            type="date"
                            value={receiptPaymentForm.checkDueDate}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, checkDueDate: event.target.value }))
                            }
                          />
                        </Field>
                      </div>
                    ) : null}

                    {receiptPaymentForm.method === PaymentMethod.BANK_TRANSFER ? (
                      <div className="grid gap-4 md:grid-cols-5">
                        <Field label="אסמכתא להעברה">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.transferReference}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, transferReference: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="תאריך העברה">
                          <input
                            className="input bg-white"
                            type="date"
                            value={receiptPaymentForm.transferDate}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, transferDate: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="בנק">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.bankName}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, bankName: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="מספר סניף">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.transferBranchNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, transferBranchNumber: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="מספר חשבון">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.transferAccountNumber}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, transferAccountNumber: event.target.value }))
                            }
                          />
                        </Field>
                      </div>
                    ) : null}

                    {receiptPaymentForm.method === PaymentMethod.PAYMENT_APP ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <Field label="שם אפליקציה">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.paymentAppName}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, paymentAppName: event.target.value }))
                            }
                            placeholder="Bit / PayBox / Pepper"
                          />
                        </Field>
                        <Field label="מזהה עסקה">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.paymentAppTransactionId}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, paymentAppTransactionId: event.target.value }))
                            }
                          />
                        </Field>
                        <Field label="טלפון משלם">
                          <input
                            className="input bg-white"
                            value={receiptPaymentForm.paymentAppPayerPhone}
                            onChange={(event) =>
                              setReceiptPaymentForm((current) => ({ ...current, paymentAppPayerPhone: event.target.value }))
                            }
                          />
                        </Field>
                      </div>
                    ) : null}

                    {receiptPaymentForm.method === PaymentMethod.OTHER ? (
                      <Field label="פירוט אמצעי התשלום">
                        <input
                          className="input bg-white"
                          value={receiptPaymentForm.otherDescription}
                          onChange={(event) =>
                            setReceiptPaymentForm((current) => ({ ...current, otherDescription: event.target.value }))
                          }
                          placeholder="למשל: שובר מתנה / קיזוז"
                        />
                      </Field>
                    ) : null}
                  </div>
                ) : null}

                <div className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium">שורות חיוב</h3>
                      <p className="text-sm text-slate-500">הוסיפו שירותים, כמות ומחיר לכל שורה.</p>
                    </div>
                    <button className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" type="button" onClick={addInvoiceLine}>
                      הוספת שורה
                    </button>
                  </div>

                  <datalist id="service-items-list">
                    {serviceItems.map((item) => (
                      <option key={item.name} value={item.name} />
                    ))}
                  </datalist>

                  {invoiceForm.lines.map((line, index) => (
                    <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 md:grid-cols-[2fr_0.8fr_0.9fr_0.8fr_auto]">
                      <Field label="תיאור שירות / מוצר">
                        <input
                          className="input bg-white"
                          list="service-items-list"
                          value={line.descriptionHe}
                          placeholder="למשל: בניית דף נחיתה"
                          onChange={(event) => {
                            const val = event.target.value;
                            const match = serviceItems.find((s) => s.name === val);
                            setInvoiceForm((current) => ({
                              ...current,
                              lines: current.lines.map((l, li) =>
                                li !== index ? l : {
                                  ...l,
                                  descriptionHe: val,
                                  unitPrice: match && l.unitPrice === 0 ? match.defaultPrice : l.unitPrice
                                }
                              )
                            }));
                          }}
                        />
                      </Field>
                      <Field label="כמות">
                        <input className="input bg-white" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateInvoiceLine(index, "quantity", event.target.value)} />
                      </Field>
                      <Field label="מחיר יחידה">
                        <input className="input bg-white" type="number" min="0" step="1" value={line.unitPrice} onChange={(event) => updateInvoiceLine(index, "unitPrice", event.target.value)} />
                      </Field>
                      {!isPtur ? (
                        <Field label="מע״מ %">
                          <input className="input bg-white" type="number" min="0" step="1" value={line.vatRate} onChange={(event) => updateInvoiceLine(index, "vatRate", event.target.value)} />
                        </Field>
                      ) : null}
                      <button className="self-end rounded-xl px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-40" type="button" onClick={() => removeInvoiceLine(index)} disabled={invoiceForm.lines.length === 1}>
                        הסר
                      </button>
                    </div>
                  ))}
                </div>

                <Field label="הערות למסמך">
                  <textarea className="input min-h-24" value={invoiceForm.notesHe ?? ""} onChange={(event) => updateInvoiceField("notesHe", event.target.value)} placeholder="הערה פנימית או הערת שירות ללקוח" />
                </Field>

                <div className="grid gap-3 rounded-xl bg-slate-900 p-4 text-white sm:grid-cols-2 md:grid-cols-4">
                  <AmountTile label="סכום לפני מע״מ" value={currencyFormatter.format(totals.subtotalAmount)} />
                  {!isPtur ? <AmountTile label="מע״מ" value={currencyFormatter.format(totals.vatAmount)} /> : null}
                  <AmountTile label="סה״כ לתשלום" value={currencyFormatter.format(totals.totalAmount)} />
                  <div className="flex items-end justify-end">
                    <button className="w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300 disabled:opacity-60" disabled={savingInvoice || customers.length === 0}>
                      {savingInvoice ? "שומר טיוטה..." : `שמירת טיוטת ${selectedDocumentLabel}`}
                    </button>
                  </div>
                </div>
                </form>
              </Panel>
            )}

            <Panel title="טיוטות אחרונות" description="תצוגה תפעולית מהירה של המסמכים שטרם הונפקו.">
              <div className="space-y-3">
                {loading ? <EmptyState text="טוען טיוטות..." /> : null}
                {!loading && filteredDraftInvoices.length === 0 ? <EmptyState text={`עדיין אין טיוטות ${selectedDocumentLabel}. צרו את הטיוטה הראשונה.`} /> : null}
                {filteredDraftInvoices.map((invoice) => {
                  const customer = customers.find((item) => item.id === invoice.customerId);
                  const isIssuing = issuingInvoiceId === invoice.id;

                  return (
                    <article key={invoice.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{customer?.displayNameHe ?? "לקוח לא ידוע"}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatDate(invoice.issueDate)} • {invoice.lines.length} שורות • {getDocumentTypeLabel(invoice.documentType)}
                          </p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">טיוטה</span>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                        <span>יתרה לתשלום</span>
                        <strong className="text-base text-slate-900">{currencyFormatter.format(invoice.balanceDue)}</strong>
                      </div>
                      <div className="mt-4 flex gap-2">
                        <button
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60"
                          onClick={() => handleIssueInvoice(invoice.id)}
                          disabled={isIssuing}
                        >
                          {isIssuing ? "מנפיק..." : "הנפקה"}
                        </button>
                        <button
                          className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => openPrintableInvoice(invoice.id)}
                        >
                          תצוגת הדפסה
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </Panel>

            <Panel title={`מסמכי ${selectedDocumentLabel} שהונפקו`} description="מסמכים סופיים עם מספר רץ ותצוגת הדפסה.">
              <div className="space-y-3">
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Field label="חיפוש חופשי">
                    <input
                      className="input bg-white"
                      value={issuedSearch}
                      onChange={(event) => setIssuedSearch(event.target.value)}
                      placeholder="לקוח או מספר מסמך"
                      inputMode="search"
                      enterKeyHint="search"
                    />
                  </Field>

                  <Field label="לקוח">
                    <select
                      className="input bg-white"
                      value={issuedCustomerFilter}
                      onChange={(event) => setIssuedCustomerFilter(event.target.value)}
                    >
                      <option value="">כל הלקוחות</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.displayNameHe}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="מתאריך">
                    <input
                      className="input bg-white"
                      type="date"
                      value={issuedFromDate}
                      onChange={(event) => setIssuedFromDate(event.target.value)}
                    />
                  </Field>

                  <Field label="עד תאריך">
                    <input
                      className="input bg-white"
                      type="date"
                      value={issuedToDate}
                      onChange={(event) => setIssuedToDate(event.target.value)}
                    />
                  </Field>

                  <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
                    <button
                      className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                      onClick={() => {
                        setIssuedSearch("");
                        setIssuedCustomerFilter("");
                        setIssuedFromDate("");
                        setIssuedToDate("");
                      }}
                    >
                      ניקוי סינון
                    </button>
                    <button
                      className="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                      onClick={exportIssuedInvoicesCsv}
                    >
                      ייצוא CSV
                    </button>
                  </div>
                </div>

                {loading ? <EmptyState text="טוען מסמכים שהונפקו..." /> : null}
                {!loading && filteredIssuedByType.length === 0 ? (
                  <EmptyState text={`עדיין לא הונפקו ${selectedDocumentLabel}.`} />
                ) : null}
                {!loading && filteredIssuedByType.length > 0 && filteredIssuedInvoices.length === 0 ? (
                  <EmptyState text="לא נמצאו מסמכים לפי הסינון שנבחר." />
                ) : null}
                {pagedIssuedInvoices.map((invoice) => {
                  const customer = customers.find((item) => item.id === invoice.customerId);

                  return (
                    <article key={invoice.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-medium">{customer?.displayNameHe ?? "לקוח לא ידוע"}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {invoice.status === "ISSUED" ? `מס׳ ${invoice.sequenceNumber ?? "-"} • ` : ""}
                            {formatDate(invoice.issueDate)} • {getDocumentTypeLabel(invoice.documentType)}
                          </p>
                          {invoice.payment?.method ? (
                            <p className="mt-1 text-xs text-slate-500">אמצעי תשלום: {getPaymentMethodLabel(invoice.payment.method)}</p>
                          ) : null}
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                          invoice.status === DocumentStatus.CANCELLED
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {invoice.status === DocumentStatus.CANCELLED ? "בוטל" : "הונפק"}
                        </span>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                        <span>סה״כ</span>
                        <strong className="text-base text-slate-900">{currencyFormatter.format(invoice.totalAmount)}</strong>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          className="flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() => openPrintableInvoice(invoice.id)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                          הדפסה
                        </button>
                        <button
                          className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100"
                          onClick={() => sendInvoiceEmail(invoice.id, customer?.email || undefined)}
                        >
                          <Mail className="h-3.5 w-3.5" />
                          שלח במייל
                        </button>
                        <button
                          className="flex items-center gap-1.5 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100"
                          title="מייצא PDF ושולח דרך WhatsApp (במחשב — הקובץ יורד, ולאחר מכן יפתח WhatsApp Web לצירוף ידני)"
                          onClick={() => shareViaWhatsApp(invoice.id)}
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          WhatsApp
                        </button>
                        {invoice.status !== DocumentStatus.CANCELLED &&
                          invoice.documentType !== DocumentType.CREDIT_NOTE &&
                          invoice.documentType !== DocumentType.RETURN_NOTE ? (
                          <button
                            className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100"
                            onClick={() => issueReturnNote(invoice.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            החזרה
                          </button>
                        ) : null}
                        {invoice.status !== DocumentStatus.CANCELLED &&
                          invoice.documentType !== DocumentType.CREDIT_NOTE &&
                          invoice.documentType !== DocumentType.RETURN_NOTE &&
                          invoice.documentType !== DocumentType.RECEIPT ? (
                          <button
                            className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                            onClick={() => issueCreditNote(invoice.id)}
                          >
                            <FileX className="h-3.5 w-3.5" />
                            זיכוי
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}

                {filteredIssuedInvoices.length > ISSUED_PAGE_SIZE ? (
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                      onClick={() => setIssuedPage((p) => Math.max(1, p - 1))}
                      disabled={issuedCurrentPage <= 1}
                    >
                      הקודם
                    </button>
                    <span className="text-xs text-slate-500">
                      עמוד {issuedCurrentPage} מתוך {issuedTotalPages} ({filteredIssuedInvoices.length} מסמכים)
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-600 dark:text-slate-200"
                      onClick={() => setIssuedPage((p) => Math.min(issuedTotalPages, p + 1))}
                      disabled={issuedCurrentPage >= issuedTotalPages}
                    >
                      הבא
                    </button>
                  </div>
                ) : null}
              </div>
            </Panel>

            <Panel title="דוחות" description="תמונת מצב פיננסית מהירה + גרף הכנסות והוצאות חודשי.">
              <div className="space-y-5">
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="שנה">
                    <select className="input bg-white" value={reportYear} onChange={(event) => setReportYear(Number(event.target.value))}>
                      {reportYears.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="חודש">
                    <select className="input bg-white" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)}>
                      {monthOptions.map((month) => (
                        <option key={month.value} value={month.value}>{month.label}</option>
                      ))}
                    </select>
                  </Field>

                </div>


                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-emerald-50 p-4">
                    <div className="text-sm text-emerald-700">סה״כ הכנסות</div>
                    <div className="mt-1 text-xl font-semibold text-emerald-900">{currencyFormatter.format(reportStats.totalIncome)}</div>
                  </div>
                  <div className="rounded-2xl bg-rose-50 p-4">
                    <div className="text-sm text-rose-700">סה״כ הוצאות</div>
                    <div className="mt-1 text-xl font-semibold text-rose-900">{currencyFormatter.format(reportStats.totalExpenses)}</div>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-4">
                    <div className="text-sm text-slate-700">רווח נקי</div>
                    <div className={`mt-1 text-xl font-semibold ${reportStats.netProfit >= 0 ? "text-emerald-800" : "text-rose-700"}`}>
                      {currencyFormatter.format(reportStats.netProfit)}
                    </div>
                  </div>
                </div>

                <MonthlyIncomeExpenseChart data={chartSeries} currencyFormatter={currencyFormatter} />

                <div className="rounded-xl border border-slate-200 p-3">
                  <h3 className="text-base font-semibold">הוספת הוצאה</h3>
                  <form className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-5" onSubmit={handleAddExpense}>
                    <Field label="תאריך">
                      <input className="input" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
                    </Field>
                    <Field label="קטגוריה">
                      <input className="input" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)} />
                    </Field>
                    <Field label="סכום">
                      <input className="input" type="number" min="0" step="0.01" inputMode="decimal" value={expenseAmount} onChange={(event) => setExpenseAmount(event.target.value)} />
                    </Field>
                    <Field label="הערות">
                      <input className="input" value={expenseNotes} onChange={(event) => setExpenseNotes(event.target.value)} />
                    </Field>
                    <div className="flex items-end">
                      <button className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60" disabled={savingExpense}>
                        {savingExpense ? "שומר..." : "הוספה"}
                      </button>
                    </div>
                  </form>

                  <div className="mt-4 space-y-2">
                    {expenses.length === 0 ? <EmptyState text="עדיין לא נוספו הוצאות ידניות." /> : null}
                    {(showAllExpenses ? expenses : expenses.slice(0, 8)).map((expense) => (
                      <div key={expense.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium">{expense.category}</span>
                          <span className="text-slate-500">{formatDate(expense.date)} • {expense.notes || "ללא הערות"}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <strong>{currencyFormatter.format(expense.amount)}</strong>
                          <button type="button" className="rounded px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-800" onClick={() => removeExpense(expense.id)}>
                            מחיקה
                          </button>
                        </div>
                      </div>
                    ))}
                    {expenses.length > 8 ? (
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-200 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                        onClick={() => setShowAllExpenses((s) => !s)}
                      >
                        {showAllExpenses ? "הצג פחות" : `הצג את כל ההוצאות (${expenses.length})`}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </Panel>
            </>
            )}
          </div>
        </section>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none fixed left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-3 text-sm shadow-lg transition ${
              t.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                : t.type === "error"
                ? "border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
                : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            }`}
            role="status"
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800">
            <p className="whitespace-pre-line text-sm text-slate-800 dark:text-slate-100">{confirmDialog.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => { confirmDialog.resolve(false); setConfirmDialog(null); }}
              >
                ביטול
              </button>
              <button
                type="button"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
                onClick={() => { confirmDialog.resolve(true); setConfirmDialog(null); }}
                autoFocus
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Prompt dialog */}
      {promptDialog ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 px-4">
          <form
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-800"
            onSubmit={(e) => { e.preventDefault(); promptDialog.resolve(promptValue.trim() || null); setPromptDialog(null); }}
          >
            <label className="block text-sm font-medium text-slate-800 dark:text-slate-100">{promptDialog.label}</label>
            <input
              autoFocus
              className="input mt-2 w-full"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                onClick={() => { promptDialog.resolve(null); setPromptDialog(null); }}
              >
                ביטול
              </button>
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900"
              >
                אישור
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between text-slate-200">
        <span className="text-xs">{label}</span>
        {icon}
      </div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}

function Panel({ title, description, children, collapsible }: { title: string; description: string; children: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <section className="rounded-[16px] bg-white p-3 shadow-sm shadow-slate-200 dark:bg-slate-800 dark:shadow-slate-950 sm:rounded-[24px] sm:p-5">
      <div className={`flex items-start gap-2 ${open ? "mb-4" : ""}`}>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
          <Building2 className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
        </div>
        {collapsible !== undefined ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700"
            aria-expanded={open}
          >
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </button>
        ) : null}
      </div>
      {open ? children : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-2 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

function AmountTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <div className="text-xs text-slate-300">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function MonthlyIncomeExpenseChart({
  data,
  currencyFormatter
}: {
  data: Array<{ label: string; income: number; expense: number }>;
  currencyFormatter: Intl.NumberFormat;
}) {
  const visibleCount = 6;
  const [offset, setOffset] = useState(() => Math.max(0, data.length - visibleCount));
  const visible = data.slice(offset, offset + visibleCount);
  const maxValue = Math.max(1, ...data.flatMap((item) => [item.income, item.expense]));
  const canPrev = offset > 0;
  const canNext = offset + visibleCount < data.length;

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">גרף הכנסות והוצאות</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={!canPrev}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(data.length - visibleCount, o + 1))}
            disabled={!canNext}
            className="rounded-lg border border-slate-200 px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
      <div className="flex gap-3">
        {visible.map((item) => {
          const incomeHeight = Math.max(8, Math.round((item.income / maxValue) * 140));
          const expenseHeight = Math.max(8, Math.round((item.expense / maxValue) * 140));
          return (
            <div key={item.label} className="flex-1 rounded-xl bg-slate-50 p-3 min-w-0">
              <div className="mb-3 text-center text-xs text-slate-500 truncate">{item.label}</div>
              <div className="mx-auto flex h-36 items-end justify-center gap-2">
                <div className="w-4 rounded-t bg-emerald-500" style={{ height: `${incomeHeight}px` }} title={`הכנסה: ${currencyFormatter.format(item.income)}`} />
                <div className="w-4 rounded-t bg-rose-400" style={{ height: `${expenseHeight}px` }} title={`הוצאה: ${currencyFormatter.format(item.expense)}`} />
              </div>
              <div className="mt-2 space-y-1 text-center text-[10px] text-slate-600">
                <div>{currencyFormatter.format(item.income)}</div>
                <div>{currencyFormatter.format(item.expense)}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> הכנסות</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-400" /> הוצאות</span>
      </div>
    </div>
  );
}

type ReportView = "cash-book" | "ledger" | "pl" | "pl-monthly" | "customers-monthly" | "tax-diff";

function ReportsPanel({
  issuedInvoices,
  expenses,
  customers,
  isPtur,
  currencyFormatter,
}: {
  issuedInvoices: DraftInvoice[];
  expenses: ExpenseItem[];
  customers: Customer[];
  isPtur: boolean;
  currencyFormatter: Intl.NumberFormat;
}) {
  const [activeReport, setActiveReport] = useState<ReportView>("cash-book");
  const [ledgerCustomerId, setLedgerCustomerId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const receipts = useMemo(
    () => issuedInvoices.filter((inv) => inv.documentType === DocumentType.RECEIPT || inv.documentType === DocumentType.INVOICE_RECEIPT),
    [issuedInvoices]
  );

  const cashBookEntries = useMemo(
    () => receipts
      .filter((inv) => (!fromDate || inv.issueDate >= fromDate) && (!toDate || inv.issueDate <= toDate))
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate)),
    [receipts, fromDate, toDate]
  );

  const ledgerEntries = useMemo(
    () => issuedInvoices
      .filter((inv) => inv.customerId === ledgerCustomerId)
      .filter((inv) => (!fromDate || inv.issueDate >= fromDate) && (!toDate || inv.issueDate <= toDate))
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate)),
    [issuedInvoices, ledgerCustomerId, fromDate, toDate]
  );

  const monthlyPL = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: d.toLocaleDateString("he-IL", { month: "short", year: "numeric" }), income: 0, expenses: 0 };
    });
    const idx = new Map(months.map((m, i) => [m.key, i]));
    for (const inv of receipts) { const i = idx.get(inv.issueDate.slice(0, 7)); if (i !== undefined) months[i]!.income += inv.totalAmount; }
    for (const exp of expenses) { const i = idx.get(exp.date.slice(0, 7)); if (i !== undefined) months[i]!.expenses += exp.amount; }
    return months.map((m) => ({ ...m, profit: m.income - m.expenses }));
  }, [receipts, expenses]);

  const customerMonthly = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return { key, label: d.toLocaleDateString("he-IL", { month: "short", year: "2-digit" }) };
    });
    const monthKeys = new Set(months.map((m) => m.key));
    const data: Record<string, Record<string, number>> = {};
    for (const inv of receipts) {
      const m = inv.issueDate.slice(0, 7);
      if (!monthKeys.has(m)) continue;
      if (!data[inv.customerId]) data[inv.customerId] = {};
      data[inv.customerId]![m] = (data[inv.customerId]![m] ?? 0) + inv.totalAmount;
    }
    return { months, data };
  }, [receipts]);

  const taxDiffEntries = useMemo(
    () => issuedInvoices
      .filter((inv) => inv.documentType === DocumentType.TAX_INVOICE || inv.documentType === DocumentType.INVOICE_RECEIPT)
      .filter((inv) => (!fromDate || inv.issueDate >= fromDate) && (!toDate || inv.issueDate <= toDate))
      .map((inv) => ({ inv, expected: inv.subtotalAmount * 0.17, diff: inv.vatAmount - inv.subtotalAmount * 0.17 }))
      .filter(({ diff }) => Math.abs(diff) > 0.01),
    [issuedInvoices, fromDate, toDate]
  );

  const totalIncome = receipts.reduce((s, i) => s + i.totalAmount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  const reportButtons: Array<{ id: ReportView; label: string }> = [
    { id: "cash-book", label: "ספר תקבולים ותשלומים" },
    { id: "ledger", label: "כרטסת חשבונות" },
    { id: "pl", label: 'דו"ח רווח והפסד' },
    { id: "pl-monthly", label: "רווח והפסד לפי חודש" },
    { id: "customers-monthly", label: "לקוחות לפי חודש" },
    { id: "tax-diff", label: "הפרשי שומה" },
  ];

  const thCls = "px-3 py-3 text-right font-medium text-slate-600";
  const tdCls = "px-3 py-2";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {reportButtons.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setActiveReport(r.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
              activeReport === r.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {activeReport !== "customers-monthly" && activeReport !== "pl" && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Field label="מתאריך"><input className="input bg-white" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></Field>
          <Field label="עד תאריך"><input className="input bg-white" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></Field>
          {(fromDate || toDate) ? (
            <button type="button" className="self-end rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50" onClick={() => { setFromDate(""); setToDate(""); }}>ניקוי</button>
          ) : null}
        </div>
      )}

      {/* ספר תקבולים */}
      {activeReport === "cash-book" && (
        <div className="overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={thCls}>מספר</th><th className={thCls}>תאריך</th><th className={thCls}>לקוח</th><th className={thCls}>אמצעי תשלום</th>
                {!isPtur && <><th className={thCls}>לפני מע"מ</th><th className={thCls}>מע"מ</th></>}
                <th className={thCls}>סה"כ</th>
              </tr>
            </thead>
            <tbody>
              {cashBookEntries.length === 0 && <tr><td colSpan={isPtur ? 5 : 7} className="px-4 py-8 text-center text-slate-400">אין תקבולים בתקופה זו</td></tr>}
              {cashBookEntries.map((inv) => {
                const cust = customers.find((c) => c.id === inv.customerId);
                return (
                  <tr key={inv.id} className="border-t border-slate-200">
                    <td className={`${tdCls} text-slate-500`}>מס׳ {inv.sequenceNumber ?? "—"}</td>
                    <td className={tdCls}>{formatDate(inv.issueDate)}</td>
                    <td className={`${tdCls} font-medium`}>{cust?.displayNameHe ?? "—"}</td>
                    <td className={tdCls}>{inv.payment?.method ? getPaymentMethodLabel(inv.payment.method) : "—"}</td>
                    {!isPtur && <><td className={tdCls}>{currencyFormatter.format(inv.subtotalAmount)}</td><td className={tdCls}>{currencyFormatter.format(inv.vatAmount)}</td></>}
                    <td className={`${tdCls} font-semibold`}>{currencyFormatter.format(inv.totalAmount)}</td>
                  </tr>
                );
              })}
              {cashBookEntries.length > 0 && (
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className={tdCls} colSpan={isPtur ? 3 : 4}>סה"כ</td>
                  {!isPtur && <><td className={tdCls}>{currencyFormatter.format(cashBookEntries.reduce((s, i) => s + i.subtotalAmount, 0))}</td><td className={tdCls}>{currencyFormatter.format(cashBookEntries.reduce((s, i) => s + i.vatAmount, 0))}</td></>}
                  <td className={tdCls}>{currencyFormatter.format(cashBookEntries.reduce((s, i) => s + i.totalAmount, 0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* כרטסת */}
      {activeReport === "ledger" && (
        <div className="space-y-4">
          <Field label="לקוח">
            <select className="input" value={ledgerCustomerId} onChange={(e) => setLedgerCustomerId(e.target.value)}>
              <option value="">בחרו לקוח</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.displayNameHe}</option>)}
            </select>
          </Field>
          {ledgerCustomerId && (
            <div className="overflow-auto rounded-2xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thCls}>מספר</th><th className={thCls}>סוג</th><th className={thCls}>תאריך</th>
                    {!isPtur && <><th className={thCls}>לפני מע"מ</th><th className={thCls}>מע"מ</th></>}
                    <th className={thCls}>סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerEntries.length === 0 && <tr><td colSpan={isPtur ? 4 : 6} className="px-4 py-8 text-center text-slate-400">אין מסמכים</td></tr>}
                  {ledgerEntries.map((inv) => (
                    <tr key={inv.id} className="border-t border-slate-200">
                      <td className={`${tdCls} text-slate-500`}>מס׳ {inv.sequenceNumber ?? "—"}</td>
                      <td className={tdCls}>{getDocumentTypeLabel(inv.documentType)}</td>
                      <td className={tdCls}>{formatDate(inv.issueDate)}</td>
                      {!isPtur && <><td className={tdCls}>{currencyFormatter.format(inv.subtotalAmount)}</td><td className={tdCls}>{currencyFormatter.format(inv.vatAmount)}</td></>}
                      <td className={`${tdCls} font-semibold`}>{currencyFormatter.format(inv.totalAmount)}</td>
                    </tr>
                  ))}
                  {ledgerEntries.length > 0 && (
                    <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                      <td className={tdCls} colSpan={isPtur ? 3 : 4}>סה"כ</td>
                      {!isPtur && <><td className={tdCls}>{currencyFormatter.format(ledgerEntries.reduce((s, i) => s + i.subtotalAmount, 0))}</td><td className={tdCls}>{currencyFormatter.format(ledgerEntries.reduce((s, i) => s + i.vatAmount, 0))}</td></>}
                      <td className={tdCls}>{currencyFormatter.format(ledgerEntries.reduce((s, i) => s + i.totalAmount, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* רווח והפסד */}
      {activeReport === "pl" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-200"><td className="px-4 py-3 text-slate-600">סה"כ הכנסות (קבלות)</td><td className="px-4 py-3 text-right font-semibold text-emerald-700">{currencyFormatter.format(totalIncome)}</td></tr>
              <tr className="border-b border-slate-200"><td className="px-4 py-3 text-slate-600">סה"כ הוצאות</td><td className="px-4 py-3 text-right font-semibold text-rose-600">{currencyFormatter.format(totalExpenses)}</td></tr>
              <tr className="bg-slate-900"><td className="px-4 py-3 font-bold text-white">רווח נקי</td><td className={`px-4 py-3 text-right font-bold text-lg ${totalIncome - totalExpenses >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{currencyFormatter.format(totalIncome - totalExpenses)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* רווח והפסד לפי חודש */}
      {activeReport === "pl-monthly" && (
        <div className="overflow-auto rounded-2xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr><th className={thCls}>חודש</th><th className={thCls}>הכנסות</th><th className={thCls}>הוצאות</th><th className={thCls}>רווח</th></tr>
            </thead>
            <tbody>
              {monthlyPL.map((m) => (
                <tr key={m.key} className="border-t border-slate-200">
                  <td className={tdCls}>{m.label}</td>
                  <td className={`${tdCls} text-emerald-700`}>{currencyFormatter.format(m.income)}</td>
                  <td className={`${tdCls} text-rose-600`}>{currencyFormatter.format(m.expenses)}</td>
                  <td className={`${tdCls} font-medium ${m.profit >= 0 ? "text-emerald-800" : "text-rose-700"}`}>{currencyFormatter.format(m.profit)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className={tdCls}>סה"כ</td>
                <td className={`${tdCls} text-emerald-700`}>{currencyFormatter.format(monthlyPL.reduce((s, m) => s + m.income, 0))}</td>
                <td className={`${tdCls} text-rose-600`}>{currencyFormatter.format(monthlyPL.reduce((s, m) => s + m.expenses, 0))}</td>
                <td className={`${tdCls} font-bold ${monthlyPL.reduce((s, m) => s + m.profit, 0) >= 0 ? "text-emerald-800" : "text-rose-700"}`}>{currencyFormatter.format(monthlyPL.reduce((s, m) => s + m.profit, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* לקוחות לפי חודש */}
      {activeReport === "customers-monthly" && (() => {
        const { months, data } = customerMonthly;
        const activeCustomers = customers.filter((c) => !!data[c.id]);
        return (
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={`${thCls} sticky right-0 bg-slate-50`}>לקוח</th>
                  {months.map((m) => <th key={m.key} className={`${thCls} whitespace-nowrap`}>{m.label}</th>)}
                  <th className={thCls}>סה"כ</th>
                </tr>
              </thead>
              <tbody>
                {activeCustomers.length === 0 && <tr><td colSpan={months.length + 2} className="px-4 py-8 text-center text-slate-400">אין נתונים</td></tr>}
                {activeCustomers.map((c) => {
                  const row = data[c.id] ?? {};
                  const total = Object.values(row).reduce((s, v) => s + v, 0);
                  return (
                    <tr key={c.id} className="border-t border-slate-200">
                      <td className={`${tdCls} font-medium sticky right-0 bg-white`}>{c.displayNameHe}</td>
                      {months.map((m) => <td key={m.key} className={tdCls}>{row[m.key] ? currencyFormatter.format(row[m.key]!) : "—"}</td>)}
                      <td className={`${tdCls} font-semibold`}>{currencyFormatter.format(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* הפרשי שומה */}
      {activeReport === "tax-diff" && (
        isPtur ? (
          <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
            עוסק פטור פטור ממע"מ — דוח זה אינו רלוונטי עבורך.
          </div>
        ) : (
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr><th className={thCls}>מספר</th><th className={thCls}>תאריך</th><th className={thCls}>מע"מ בפועל</th><th className={thCls}>מע"מ צפוי (17%)</th><th className={thCls}>הפרש</th></tr>
              </thead>
              <tbody>
                {taxDiffEntries.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-emerald-600">✓ אין הפרשים — כל המסמכים תואמים</td></tr>}
                {taxDiffEntries.map(({ inv, expected, diff }) => (
                  <tr key={inv.id} className="border-t border-slate-200">
                    <td className={`${tdCls} text-slate-500`}>מס׳ {inv.sequenceNumber ?? "—"}</td>
                    <td className={tdCls}>{formatDate(inv.issueDate)}</td>
                    <td className={tdCls}>{currencyFormatter.format(inv.vatAmount)}</td>
                    <td className={tdCls}>{currencyFormatter.format(expected)}</td>
                    <td className={`${tdCls} font-medium text-rose-600`}>{currencyFormatter.format(diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-500">{text}</div>;
}

export default App;
