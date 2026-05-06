import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import net from "node:net";
import { registerCustomerRoutes } from "./routes/customers.js";
import { registerDraftInvoiceRoutes } from "./routes/draft-invoices.js";
import { registerBusinessSettingsRoutes } from "./routes/business-settings.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSendEmailRoutes } from "./routes/send-email.js";
import { registerExportRoutes } from "./routes/export.js";
import { registerImportRoutes } from "./routes/import.js";
import { registerExpenseRoutes } from "./routes/expenses.js";
import { prisma } from "@invoice/db";

const app = Fastify({ logger: true, bodyLimit: 20 * 1024 * 1024 }); // 20 MB

async function isPortAvailable(port: number, host: string) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, host);
  });
}

async function resolvePort(preferredPort: number, host: string, attempts = 10) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidatePort = preferredPort + offset;

    if (await isPortAvailable(candidatePort, host)) {
      return candidatePort;
    }
  }

  throw new Error(`No open port found starting at ${preferredPort}`);
}

const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map((s) => s.trim().replace(/\/$/, ""))
  : ["http://localhost:5173", "http://localhost:5174"];

await app.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Render health checks, same-origin)
    if (!origin) return cb(null, true);
    // Allow explicitly configured origins
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // In development allow any localhost
    if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`), false);
  },
  credentials: true
});

await app.register(helmet, {
  contentSecurityPolicy: false
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute"
});

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error("JWT_SECRET env var must be set and at least 32 characters");
}

await app.register(fastifyCookie);
await app.register(fastifyJwt, {
  secret: jwtSecret,
  cookie: { cookieName: "invoice_token", signed: false }
});

// Accept raw binary bodies for ZIP import
for (const contentType of ["application/zip", "application/octet-stream", "application/x-zip-compressed"]) {
  app.addContentTypeParser(contentType, { parseAs: "buffer" }, (_req, body, done) => done(null, body));
}

// Global auth guard — skips routes with config.skipAuth = true
app.addHook("onRequest", async (request, reply) => {
  const cfg = (request.routeOptions?.config ?? {}) as unknown as Record<string, unknown>;
  if (cfg["skipAuth"]) return;
  try {
    await request.jwtVerify();
  } catch {
    reply.status(401).send({ message: "לא מחובר" });
  }
});

app.get("/health", { config: { skipAuth: true } }, async () => ({
  status: "ok",
  service: "invoice-api",
  now: new Date().toISOString()
}));

app.get("/v1/metadata", { config: { skipAuth: true } }, async () => ({
  locale: "he-IL",
  direction: "rtl",
  supportedTaxProfiles: ["PTUR", "MURSHE"]
}));

await registerAuthRoutes(app);
await registerCustomerRoutes(app);
await registerDraftInvoiceRoutes(app);
await registerBusinessSettingsRoutes(app);
await registerSendEmailRoutes(app);
await registerExportRoutes(app);
await registerImportRoutes(app);
await registerExpenseRoutes(app);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

await prisma.$connect();

const host = "0.0.0.0";
const preferredPort = Number(process.env.PORT ?? 4000);
const port = await resolvePort(preferredPort, host);

await app.listen({ port, host });
app.log.info(`API listening on http://localhost:${port}`);
