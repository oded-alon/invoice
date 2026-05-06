import type { FastifyInstance } from "fastify";
import { zipSync, strToU8 } from "fflate";
import { getFullExportData } from "../data/prisma-store.js";
import { getDocumentTypeLabel } from "@invoice/shared";
import { DocumentType } from "@invoice/shared";

function getUserId(request: { user: unknown }): string {
  return (request.user as { sub: string }).sub;
}

function esc(val: unknown): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(esc).join(",")];
  for (const row of rows) lines.push(row.map(esc).join(","));
  return "\uFEFF" + lines.join("\r\n");
}

export async function registerExportRoutes(app: FastifyInstance) {
  app.get("/v1/export/full", async (request, reply) => {
    const userId = getUserId(request);
    const { business, customers, invoices, sequences } = await getFullExportData(userId);

    const exportedAt = new Date().toISOString();

    // ── JSON files ────────────────────────────────────────────────────────────
    const businessJson = JSON.stringify({ exportedAt, business }, null, 2);

    const customersJson = JSON.stringify({ exportedAt, count: customers.length, customers }, null, 2);

    const invoicesJson = JSON.stringify({ exportedAt, count: invoices.length, invoices }, null, 2);

    const sequencesJson = JSON.stringify({ exportedAt, sequences }, null, 2);

    // ── Customers CSV ─────────────────────────────────────────────────────────
    const customersCsv = toCsv(
      ["id", "displayNameHe", "legalNameHe", "type", "taxId", "email", "phone", "addressHe", "cityHe", "paymentTermsDays", "isActive", "createdAt"],
      customers.map((c: (typeof customers)[number]) => [
        c.id, c.displayNameHe, c.legalNameHe ?? "", c.type,
        c.taxId ?? "", c.email ?? "", c.phone ?? "",
        c.addressHe ?? "", c.cityHe ?? "",
        String(c.paymentTermsDays), String(c.isActive),
        c.createdAt.toISOString()
      ])
    );

    // ── Invoices CSV ──────────────────────────────────────────────────────────
    const invoicesCsv = toCsv(
      ["id", "documentType", "documentTypeLabel", "sequenceNumber", "status", "fiscalYear",
        "issueDate", "dueDate", "customerId", "currency",
        "subtotalAmount", "vatAmount", "totalAmount", "balanceDue",
        "paymentMethod", "notesHe", "linkedDocumentId", "issuedAt", "createdAt"],
      invoices.map((inv: (typeof invoices)[number]) => [
        inv.id,
        inv.documentType,
        getDocumentTypeLabel(inv.documentType as DocumentType),
        String(inv.sequenceNumber ?? ""),
        inv.status,
        String(inv.fiscalYear),
        inv.issueDate.toISOString().slice(0, 10),
        inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
        inv.customerId,
        inv.currency,
        String(inv.subtotalAmount),
        String(inv.vatAmount),
        String(inv.totalAmount),
        String(inv.balanceDue),
        inv.paymentMethod ?? "",
        inv.notesHe ?? "",
        inv.linkedDocumentId ?? "",
        inv.issuedAt ? inv.issuedAt.toISOString() : "",
        inv.createdAt.toISOString()
      ])
    );

    // ── Invoice Lines CSV ─────────────────────────────────────────────────────
    const linesCsv = toCsv(
      ["invoiceId", "lineNo", "descriptionHe", "quantity", "unitPrice", "discountPct", "lineSubtotal", "vatRate", "lineVatAmount", "lineTotal"],
      invoices.flatMap((inv: (typeof invoices)[number]) =>
        inv.lines.map((l: (typeof inv.lines)[number]) => [
          inv.id,
          String(l.lineNo),
          l.descriptionHe,
          String(l.quantity),
          String(l.unitPrice),
          String(l.discountPct),
          String(l.lineSubtotal),
          String(l.vatRate),
          String(l.lineVatAmount),
          String(l.lineTotal)
        ])
      )
    );

    // ── Series CSV ────────────────────────────────────────────────────────────
    const seriesCsv = toCsv(
      ["documentType", "fiscalYear", "prefix", "startingNumber", "nextNumber"],
      sequences.map((s: (typeof sequences)[number]) => [
        s.documentType, String(s.fiscalYear), s.prefix,
        String(s.startingNumber), String(s.nextNumber)
      ])
    );

    // ── Pack ZIP ──────────────────────────────────────────────────────────────
    const folder = `export-${exportedAt.slice(0, 10)}`;
    const zip = zipSync({
      [`${folder}/business.json`]: strToU8(businessJson),
      [`${folder}/customers.json`]: strToU8(customersJson),
      [`${folder}/invoices.json`]: strToU8(invoicesJson),
      [`${folder}/sequences.json`]: strToU8(sequencesJson),
      [`${folder}/customers.csv`]: strToU8(customersCsv),
      [`${folder}/invoices.csv`]: strToU8(invoicesCsv),
      [`${folder}/invoice-lines.csv`]: strToU8(linesCsv),
      [`${folder}/series.csv`]: strToU8(seriesCsv)
    });

    const filename = `invoice-export-${exportedAt.slice(0, 10)}.zip`;

    reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${filename}"`);

    return reply.send(Buffer.from(zip));
  });
}
