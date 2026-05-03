import type { FastifyInstance } from "fastify";
import { Resend } from "resend";
import { getInvoiceForExport } from "../data/prisma-store.js";
import { buildEmailHtml } from "../lib/invoice-html.js";
import { getDocumentTypeLabel } from "@invoice/shared";
import { DocumentType } from "@invoice/shared";

function getUserId(request: { user: unknown }): string {
  return (request.user as { sub: string }).sub;
}

type SendEmailParams = { id: string };
type SendEmailBody = { to?: string };

export async function registerSendEmailRoutes(app: FastifyInstance) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

  if (!apiKey) {
    app.log.warn("RESEND_API_KEY not set — email sending disabled");
    return;
  }

  const resend = new Resend(apiKey);

  app.post<{ Params: SendEmailParams; Body: SendEmailBody }>(
    "/v1/invoices/:id/send-email",
    async (request, reply) => {
      const userId = getUserId(request);
      const invoice = await getInvoiceForExport(userId, request.params.id);

      if (!invoice) {
        return reply.code(404).send({ message: "המסמך לא נמצא" });
      }

      const to = request.body?.to?.trim() || invoice.customer.email;

      if (!to) {
        return reply
          .code(400)
          .send({ message: "לא הוגדרה כתובת מייל ללקוח — יש לציין כתובת" });
      }

      const docLabel = getDocumentTypeLabel(invoice.documentType as DocumentType);
      const prefix = invoice.seriesPrefix ?? "";
      const numberPart = invoice.sequenceNumber ? `${prefix}#${invoice.sequenceNumber}` : "טיוטה";
      const subject = `${docLabel} ${numberPart} מ${invoice.business.nameHe}`;
      const html = buildEmailHtml(invoice);

      const { error } = await resend.emails.send({
        from,
        to,
        subject,
        html
      });

      if (error) {
        app.log.error({ error }, "Resend error");
        return reply.code(502).send({ message: "שליחת המייל נכשלה — נסה שוב" });
      }

      return reply.send({ ok: true, to });
    }
  );
}
