import { createHmac } from "node:crypto";
import { DocumentType, PaymentMethod, getDocumentTypeLabel, getPaymentMethodLabel } from "@invoice/shared";

type InvoiceLine = {
  descriptionHe: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
};

type InvoiceForExport = {
  id: string;
  sequenceNumber: number | null;
  seriesPrefix?: string;
  documentType: string;
  issueDate: Date;
  dueDate: Date | null;
  currency: string;
  subtotalAmount: unknown;
  vatAmount: unknown;
  totalAmount: unknown;
  paymentMethod: string | null;
  paymentDetails: unknown;
  customerId: string;
  lines: InvoiceLine[];
  customer: { displayNameHe: string; email?: string | null };
  business: {
    nameHe: string;
    taxId: string;
    taxProfile: string;
    detailsHe?: string | null;
    addressHe?: string | null;
    phone?: string | null;
    email?: string | null;
    logoUrl?: string | null;
    printTemplate?: { primaryColor?: string; fontFamily?: string } | null;
  };
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB").format(date);
}

function maskCardNumber(num: string) {
  const digits = num.replace(/\s/g, "");
  if (digits.length <= 4) return num;
  return "x".repeat(digits.length - 4).replace(/(.{4})/g, "$1 ").trim() + " " + digits.slice(-4);
}

function getPaymentItems(invoice: InvoiceForExport): string[] {
  if (!invoice.paymentMethod) return [];
  const method = invoice.paymentMethod as PaymentMethod;
  const methodLabel = getPaymentMethodLabel(method);
  const pd =
    invoice.paymentDetails && typeof invoice.paymentDetails === "object" && !Array.isArray(invoice.paymentDetails)
      ? (invoice.paymentDetails as Record<string, unknown>)
      : {};

  const items: string[] = [`אמצעי תשלום: ${methodLabel}`];

  if (method === PaymentMethod.CREDIT) {
    const cardNumber = String(pd.cardNumber ?? "");
    if (cardNumber) items.push(`מספר כרטיס: ${maskCardNumber(cardNumber)}`);
    if (pd.cardType) items.push(`סוג כרטיס: ${pd.cardType}`);
    if (pd.installments) items.push(`תשלומים: ${pd.installments}`);
    if (pd.approvalCode) items.push(`אסמכתא: ${pd.approvalCode}`);
    if (pd.date) items.push(`תאריך: ${pd.date}`);
  } else if (method === PaymentMethod.CHECK) {
    if (pd.checkNumber) items.push(`מספר צ'ק: ${pd.checkNumber}`);
    if (pd.accountNumber) items.push(`מספר חשבון: ${pd.accountNumber}`);
    if (pd.bankName) items.push(`בנק: ${pd.bankName}`);
    if (pd.branchNumber) items.push(`סניף: ${pd.branchNumber}`);
    if (pd.dueDate) items.push(`תאריך פירעון: ${pd.dueDate}`);
  } else if (method === PaymentMethod.BANK_TRANSFER) {
    if (pd.reference) items.push(`אסמכתא: ${pd.reference}`);
    if (pd.bankName) items.push(`בנק: ${pd.bankName}`);
    if (pd.branchNumber) items.push(`מספר סניף: ${pd.branchNumber}`);
    if (pd.accountNumber) items.push(`מספר חשבון: ${pd.accountNumber}`);
    if (pd.transferDate) items.push(`תאריך העברה: ${pd.transferDate}`);
  }

  return items;
}

function buildStampSvg(businessName: string, verificationHash: string): string {
  const safe = businessName
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<svg width="150" height="150" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="transform:rotate(-12deg);opacity:0.88">
    <circle cx="100" cy="100" r="93" fill="none" stroke="#1a4fa0" stroke-width="5"/>
    <circle cx="100" cy="100" r="84" fill="none" stroke="#1a4fa0" stroke-width="1.5"/>
    <defs>
      <path id="sta" d="M 41,78 A 63,63 0 0,1 159,78" fill="none"/>
      <path id="stb" d="M 161,128 A 68,68 0 0,1 39,128" fill="none"/>
    </defs>
    <text font-size="13" fill="#1a4fa0" font-weight="bold" font-family="Arial,sans-serif">
      <textPath href="#sta" startOffset="50%" text-anchor="middle">${safe}</textPath>
    </text>
    <text font-size="20" fill="#1a4fa0" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif" x="100" y="97">מסמך חתום</text>
    <text font-size="20" fill="#1a4fa0" font-weight="800" text-anchor="middle" font-family="Arial,sans-serif" x="100" y="122">דיגיטלית</text>
    <text font-size="9" fill="#1a4fa0" font-family="monospace" letter-spacing="1.5">
      <textPath href="#stb" startOffset="50%" text-anchor="middle">${verificationHash}</textPath>
    </text>
  </svg>`;
}

function buildVerificationHash(invoice: InvoiceForExport): string {
  const sigData = [invoice.id, invoice.sequenceNumber ?? "draft", String(invoice.totalAmount), invoice.customerId].join("|");
  return createHmac("sha256", `invoice-sig-${invoice.business.taxId}`)
    .update(sigData).digest("hex").slice(0, 20).toUpperCase().match(/.{1,4}/g)!.join("-");
}

// ─── Print / browser view ────────────────────────────────────────────────────

export function buildInvoiceHtml(invoice: InvoiceForExport): string {
  const tpl = invoice.business.printTemplate;
  const primaryColor = tpl?.primaryColor ?? "#0f172a";
  const primaryDark = tpl?.primaryColor ?? "#1e293b";
  const fontFamily = tpl?.fontFamily ?? "Inter, Arial, sans-serif";
  const googleFontName = fontFamily.split(",")[0].replace(/['"/]/g, "").trim().replace(/\s+/g, "+");
  const googleFontLink = googleFontName && googleFontName !== "Inter" && googleFontName !== "Arial"
    ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${googleFontName}:wght@400;600;700&display=swap" />`
    : "";

  const prefix = invoice.seriesPrefix ?? "";
  const numberPart = invoice.sequenceNumber ? `${prefix}#${invoice.sequenceNumber}` : "טיוטה";
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : "-";
  const customerName = invoice.customer.displayNameHe;
  const businessDetails = invoice.business.detailsHe ?? "";
  const businessAddress = invoice.business.addressHe ?? "";
  const businessPhone = invoice.business.phone ?? "";
  const businessEmail = invoice.business.email ?? "";
  const businessLogo = invoice.business.logoUrl ?? "";
  const subtotal = Number(invoice.subtotalAmount).toFixed(2);
  const vat = Number(invoice.vatAmount).toFixed(2);
  const total = Number(invoice.totalAmount).toFixed(2);
  const documentTitle = getDocumentTypeLabel(invoice.documentType as DocumentType);
  const isPtur = invoice.business.taxProfile === "PTUR";
  const isReceiptDocument =
    invoice.documentType === DocumentType.RECEIPT || invoice.documentType === DocumentType.INVOICE_RECEIPT;

  const verificationHash = buildVerificationHash(invoice);
  const stampSection = isReceiptDocument
    ? `<div class="stamp-wrap">${buildStampSvg(invoice.business.nameHe, verificationHash)}</div>`
    : "";

  const paymentItems = getPaymentItems(invoice);
  const paymentSection = paymentItems.length
    ? `<section class="payment-section">
        <div class="pay-label-title">פרטי תשלום</div>
        <div class="pay-grid">${paymentItems.map((t) => `<div class="pay-item">${t}</div>`).join("")}</div>
      </section>`
    : "";

  const rows = invoice.lines
    .map((line) => `<tr><td>${line.descriptionHe}</td><td>${line.quantity}</td><td>${line.unitPrice}</td><td>${line.lineTotal}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${documentTitle} ${numberPart}</title>
  ${googleFontLink}
  <style>
    *{box-sizing:border-box}
    body{margin:0;direction:rtl;font-family:${fontFamily};color:#0f172a;background:#f8fafc}
    .page{max-width:980px;margin:0 auto;padding:28px}
    .toolbar{display:flex;gap:10px;justify-content:flex-end;margin-bottom:16px}
    .btn{border:1px solid #e2e8f0;border-radius:12px;background:#fff;color:#0f172a;font-weight:600;padding:10px 14px;cursor:pointer}
    .btn.primary{background:${primaryColor};color:#fff;border-color:${primaryColor}}
    .invoice{background:#fff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(15,23,42,.06)}
    .header{padding:24px;background:linear-gradient(135deg,${primaryColor},${primaryDark});color:#fff;display:flex;justify-content:space-between;gap:20px}
    .title{margin:0;font-size:28px;font-weight:700}
    .subtitle{margin-top:6px;color:#cbd5e1;font-size:14px}
    .brand{display:flex;align-items:center;gap:14px}
    .logo{max-height:56px;max-width:200px;width:auto;height:auto;object-fit:contain}
    .subtitle-line{margin-top:4px;color:#cbd5e1;font-size:12px}
    .ltr-date{direction:ltr;unicode-bidi:plaintext;display:inline-block;min-width:92px}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .meta-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px}
    .meta-label{color:#64748b;font-size:12px;margin-bottom:5px}
    .meta-value{font-size:14px;font-weight:600}
    .table-wrap{padding:20px 24px}
    table{width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px}
    thead{background:#f8fafc}
    th,td{border-bottom:1px solid #e2e8f0;padding:12px;text-align:right;font-size:14px}
    tbody tr:last-child td{border-bottom:none}
    .totals{margin:0 24px 24px;margin-inline-start:auto;width:min(340px,100%);border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
    .totals-row{display:flex;justify-content:space-between;padding:11px 14px;border-bottom:1px solid #e2e8f0;font-size:14px}
    .totals-row:last-child{border-bottom:none;background:${primaryColor};color:#fff;font-weight:700}
    .hint{margin-top:10px;color:#64748b;font-size:12px;text-align:left}
    .payment-section{margin:0 24px 24px;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden}
    .pay-label-title{padding:10px 14px;font-size:12px;color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0}
    .pay-grid{display:flex;flex-wrap:wrap}
    .pay-item{padding:10px 14px;border-left:1px solid #e2e8f0;font-size:13px;font-weight:600}
    .pay-item:last-child{border-left:none}
    .stamp-wrap{display:flex;justify-content:flex-end;padding:0 32px 28px}
    @media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{background:#fff}.page{padding:0;max-width:none}.toolbar,.hint{display:none!important}.invoice{box-shadow:none;border-radius:0;border:none}}
  </style>
</head>
<body>
  <div class="page">
    <div class="toolbar">
      <button class="btn" onclick="window.print()">הדפסה</button>
      <button class="btn primary" onclick="window.print()">שמירה כ-PDF</button>
    </div>
    <article class="invoice">
      <header class="header">
        <div class="brand">
          ${businessLogo ? `<img class="logo" src="${businessLogo}" alt="לוגו עסק" />` : ""}
          <div>
            <h1 class="title">${documentTitle}</h1>
            <div class="subtitle">${invoice.business.nameHe}</div>
            ${businessDetails ? `<div class="subtitle-line">${businessDetails}</div>` : ""}
            <div class="subtitle-line">${[businessAddress, businessPhone, businessEmail].filter(Boolean).join(" \u2022 ")}</div>
          </div>
        </div>
        <div>
          <div class="subtitle">מספר מסמך</div>
          <div class="title" style="font-size:22px">${numberPart}</div>
        </div>
      </header>
      <section class="meta">
        <div class="meta-card"><div class="meta-label">לקוח</div><div class="meta-value">${customerName}</div></div>
        <div class="meta-card"><div class="meta-label">תאריך מסמך</div><div class="meta-value ltr-date">${issueDate}</div></div>
        <div class="meta-card"><div class="meta-label">תאריך פירעון</div><div class="meta-value ltr-date">${dueDate}</div></div>
        <div class="meta-card"><div class="meta-label">מטבע</div><div class="meta-value">${invoice.currency}</div></div>
      </section>
      <section class="table-wrap">
        <table>
          <thead><tr><th>תיאור</th><th>כמות</th><th>מחיר יחידה</th><th>סה"כ שורה</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>
      <section class="totals">
        ${!isPtur ? `<div class="totals-row"><span>לפני מע"מ</span><span>\u20aa ${subtotal}</span></div>` : ""}
        ${!isPtur ? `<div class="totals-row"><span>מע"מ</span><span>\u20aa ${vat}</span></div>` : ""}
        <div class="totals-row"><span>סה"כ לתשלום</span><span>\u20aa ${total}</span></div>
      </section>
      ${paymentSection}
      ${stampSection}
    </article>
    <div class="hint">כדי לשמור כ-PDF: לחצו "שמירה כ-PDF" ובחלון ההדפסה בחרו יעד: "Save as PDF".</div>
  </div>
</body>
</html>`;
}

// ─── Email-safe view (inline styles, table layout) ───────────────────────────

export function buildEmailHtml(invoice: InvoiceForExport): string {
  const tpl = invoice.business.printTemplate;
  const primaryColor = tpl?.primaryColor ?? "#0f172a";
  const primaryDark = tpl?.primaryColor ?? "#1e293b";

  const prefix = invoice.seriesPrefix ?? "";
  const numberPart = invoice.sequenceNumber ? `${prefix}#${invoice.sequenceNumber}` : "טיוטה";
  const issueDate = formatDate(invoice.issueDate);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate) : "-";
  const customerName = invoice.customer.displayNameHe;
  const businessDetails = invoice.business.detailsHe ?? "";
  const businessAddress = invoice.business.addressHe ?? "";
  const businessPhone = invoice.business.phone ?? "";
  const businessEmail = invoice.business.email ?? "";
  const businessLogo = invoice.business.logoUrl ?? "";
  const subtotal = Number(invoice.subtotalAmount).toFixed(2);
  const vat = Number(invoice.vatAmount).toFixed(2);
  const total = Number(invoice.totalAmount).toFixed(2);
  const documentTitle = getDocumentTypeLabel(invoice.documentType as DocumentType);
  const isPtur = invoice.business.taxProfile === "PTUR";
  const isReceiptDocument =
    invoice.documentType === DocumentType.RECEIPT || invoice.documentType === DocumentType.INVOICE_RECEIPT;

  const verificationHash = buildVerificationHash(invoice);
  const paymentItems = getPaymentItems(invoice);

  const metaStyle = "padding:12px 14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin:4px";
  const metaLabelStyle = "font-size:11px;color:#64748b;margin:0 0 4px 0";
  const metaValueStyle = "font-size:14px;font-weight:600;color:#0f172a;margin:0;direction:ltr;text-align:right";
  const thStyle = "padding:10px 12px;text-align:right;font-size:13px;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;background:#f8fafc";
  const tdStyle = "padding:10px 12px;text-align:right;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0";

  const lineRows = invoice.lines
    .map((line) => `
      <tr>
        <td style="${tdStyle}">${line.descriptionHe}</td>
        <td style="${tdStyle}">${line.quantity}</td>
        <td style="${tdStyle}">${line.unitPrice}</td>
        <td style="${tdStyle};font-weight:600">${line.lineTotal}</td>
      </tr>`)
    .join("");

  const totalsRows = [
    ...(isPtur ? [] : [
      `<tr>
        <td style="padding:9px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right">לפני מע"מ</td>
        <td style="padding:9px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr">\u20aa ${subtotal}</td>
      </tr>`,
      `<tr>
        <td style="padding:9px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:right">מע"מ</td>
        <td style="padding:9px 14px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;text-align:left;direction:ltr">\u20aa ${vat}</td>
      </tr>`
    ]),
    `<tr>
      <td style="padding:9px 14px;font-size:14px;font-weight:700;color:#ffffff;background:${primaryColor};text-align:right">סה"כ לתשלום</td>
      <td style="padding:9px 14px;font-size:14px;font-weight:700;color:#ffffff;background:${primaryColor};text-align:left;direction:ltr">\u20aa ${total}</td>
    </tr>`
  ].join("");

  const paymentSection = paymentItems.length
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
        <tr><td style="padding:8px 14px;font-size:11px;color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0">פרטי תשלום</td></tr>
        ${paymentItems.map((t) => `<tr><td style="padding:8px 14px;font-size:13px;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9">${t}</td></tr>`).join("")}
      </table>`
    : "";

  const stampSection = isReceiptDocument
    ? `<div style="text-align:left;padding:0 24px 24px">${buildStampSvg(invoice.business.nameHe, verificationHash)}</div>`
    : "";

  const logoHtml = businessLogo
    ? `<img src="${businessLogo}" alt="לוגו עסק" style="max-height:48px;max-width:160px;width:auto;height:auto;object-fit:contain;display:block;margin-bottom:10px" />`
    : "";

  const contactLine = [businessAddress, businessPhone, businessEmail].filter(Boolean).join(" \u2022 ");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${documentTitle} ${numberPart}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;max-width:620px;width:100%">
        <tr>
          <td style="padding:28px 28px 20px;background:${primaryColor}">
            ${logoHtml}
            <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff">${documentTitle}</p>
            <p style="margin:6px 0 0;font-size:14px;color:#94a3b8">${invoice.business.nameHe}${businessDetails ? ` \u2014 ${businessDetails}` : ""}</p>
            ${contactLine ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b">${contactLine}</p>` : ""}
          </td>
        </tr>
        <tr>
          <td style="padding:12px 28px;background:${primaryDark}">
            <p style="margin:0;font-size:12px;color:#94a3b8">מספר מסמך</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#ffffff">${numberPart}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="${metaStyle}"><p style="${metaLabelStyle}">לקוח</p><p style="${metaValueStyle}">${customerName}</p></td>
                <td style="${metaStyle}"><p style="${metaLabelStyle}">תאריך מסמך</p><p style="${metaValueStyle}">${issueDate}</p></td>
                <td style="${metaStyle}"><p style="${metaLabelStyle}">תאריך פירעון</p><p style="${metaValueStyle}">${dueDate}</p></td>
                <td style="${metaStyle}"><p style="${metaLabelStyle}">מטבע</p><p style="${metaValueStyle}">${invoice.currency}</p></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 24px">
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
              <thead>
                <tr>
                  <th style="${thStyle}">תיאור</th>
                  <th style="${thStyle}">כמות</th>
                  <th style="${thStyle}">מחיר יחידה</th>
                  <th style="${thStyle};font-weight:700">סה"כ שורה</th>
                </tr>
              </thead>
              <tbody>${lineRows}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 20px">
            <table cellpadding="0" cellspacing="0" style="margin-inline-start:auto;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;min-width:260px">
              ${totalsRows}
            </table>
          </td>
        </tr>
        ${paymentSection ? `<tr><td style="padding:0 24px 4px">${paymentSection}</td></tr>` : ""}
        ${stampSection ? `<tr><td>${stampSection}</td></tr>` : ""}
        <tr>
          <td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8">
            מסמך זה נוצר אוטומטית ואינו מצריך חתימה ידנית
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
