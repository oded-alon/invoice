import type { FastifyInstance } from "fastify";
import { getBusinessSettings, updateBusinessSettings } from "../data/prisma-store.js";
import { BusinessTaxProfile, DocumentType } from "@invoice/shared";
import type { DocumentSeriesConfig, PrintTemplateConfig } from "@invoice/shared";

function getUserId(request: { user: unknown }): string {
  return (request.user as { sub: string }).sub;
}

type UpdateBusinessSettingsBody = {
  nameHe?: string;
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

export async function registerBusinessSettingsRoutes(app: FastifyInstance) {
  app.get("/v1/business/settings", async (request) => {
    return getBusinessSettings(getUserId(request));
  });

  app.put<{ Body: UpdateBusinessSettingsBody }>("/v1/business/settings", async (request, reply) => {
    const body = request.body ?? {};
    const userId = getUserId(request);

    if (!body.nameHe?.trim()) {
      return reply.code(400).send({ message: "שם עסק הוא שדה חובה" });
    }

    // Validate series config if provided
    const validTypes = Object.values(DocumentType) as string[];
    if (body.seriesConfig) {
      for (const cfg of body.seriesConfig) {
        if (!validTypes.includes(cfg.documentType)) {
          return reply.code(400).send({ message: `סוג מסמך לא חוקי: ${cfg.documentType}` });
        }
        if (typeof cfg.startingNumber !== "number" || cfg.startingNumber < 1) {
          return reply.code(400).send({ message: "מספר התחלה חייב להיות לפחות 1" });
        }
      }
    }

    const settings = await updateBusinessSettings(userId, {
      nameHe: body.nameHe,
      taxId: body.taxId,
      taxProfile: body.taxProfile,
      detailsHe: body.detailsHe,
      addressHe: body.addressHe,
      phone: body.phone,
      email: body.email,
      logoUrl: body.logoUrl,
      seriesConfig: body.seriesConfig,
      printTemplate: body.printTemplate
    });

    return reply.send(settings);
  });
}
