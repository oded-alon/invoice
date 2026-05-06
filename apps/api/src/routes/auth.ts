import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@invoice/db";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRY = "8h";
const COOKIE_NAME = "invoice_token";

export async function registerAuthRoutes(app: FastifyInstance) {
  // ── Register ────────────────────────────────────────────────
  app.post("/auth/register", {
    config: { skipAuth: true },
    schema: {
      body: {
        type: "object",
        required: ["email", "password", "displayName"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          password: { type: "string", minLength: 8, maxLength: 128 },
          displayName: { type: "string", minLength: 1, maxLength: 100 }
        },
        additionalProperties: false
      }
    },
    handler: async (request, reply) => {
      const { email, password, displayName } = request.body as {
        email: string;
        password: string;
        displayName: string;
      };

      const existing = await prisma.user.findUnique({ where: { email } });

      if (existing) {
        return reply.status(409).send({ message: "כתובת האימייל כבר רשומה" });
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: { email, passwordHash, displayName }
      });

      const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: JWT_EXPIRY });

      reply
        .setCookie(COOKIE_NAME, token, cookieOptions())
        .status(201)
        .send({ id: user.id, email: user.email, displayName: user.displayName });
    }
  });

  // ── Login ────────────────────────────────────────────────────
  app.post("/auth/login", {
    config: { skipAuth: true },
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", maxLength: 254 },
          password: { type: "string", maxLength: 128 }
        },
        additionalProperties: false
      }
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as { email: string; password: string };

      const user = await prisma.user.findUnique({ where: { email } });

      // Constant-time comparison even on miss
      const hash = user?.passwordHash ?? "$2b$12$invalidhashplaceholdertostop.timing.attacks";
      const valid = await bcrypt.compare(password, hash);

      if (!user || !valid || !user.isActive) {
        return reply.status(401).send({ message: "אימייל או סיסמה שגויים" });
      }

      const token = app.jwt.sign({ sub: user.id, email: user.email }, { expiresIn: JWT_EXPIRY });

      reply
        .setCookie(COOKIE_NAME, token, cookieOptions())
        .send({ id: user.id, email: user.email, displayName: user.displayName });
    }
  });

  // ── Logout ───────────────────────────────────────────────────
  app.post("/auth/logout", {
    config: { skipAuth: true },
    handler: async (_request, reply) => {
      reply
        .clearCookie(COOKIE_NAME, { path: "/" })
        .send({ ok: true });
    }
  });

  // ── Me ───────────────────────────────────────────────────────
  app.get("/auth/me", {
    handler: async (request, reply) => {
      const payload = request.user as { sub: string };
      const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, displayName: true }
      });

      if (!user) return reply.status(404).send({ message: "User not found" });
      return user;
    }
  });

  // ── Change password ───────────────────────────────────────────
  app.post("/auth/change-password", {
    schema: {
      body: {
        type: "object",
        required: ["currentPassword", "newPassword"],
        properties: {
          currentPassword: { type: "string", maxLength: 128 },
          newPassword: { type: "string", minLength: 8, maxLength: 128 }
        },
        additionalProperties: false
      }
    },
    handler: async (request, reply) => {
      const { currentPassword, newPassword } = request.body as {
        currentPassword: string;
        newPassword: string;
      };
      const payload = request.user as { sub: string };

      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user) return reply.status(404).send({ message: "המשתמש לא נמצא" });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return reply.status(401).send({ message: "הסיסמה הנוכחית שגויה" });

      if (currentPassword === newPassword) {
        return reply.status(400).send({ message: "הסיסמה החדשה חייבת להיות שונה מהנוכחית" });
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash } });

      return reply.send({ ok: true });
    }
  });

  // ── Forgot password ───────────────────────────────────────────
  app.post("/auth/forgot-password", {
    config: { skipAuth: true },
    schema: {
      body: {
        type: "object",
        required: ["email"],
        properties: { email: { type: "string", format: "email", maxLength: 254 } },
        additionalProperties: false
      }
    },
    handler: async (request, reply) => {
      const { email } = request.body as { email: string };

      // Always return success to avoid email enumeration
      const user = await prisma.user.findUnique({ where: { email } });

      if (user && user.isActive) {
        // Invalidate any prior unused tokens for this user
        await prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() }
        });

        const rawToken = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await prisma.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt }
        });

        const appUrl = process.env.APP_URL ?? "http://localhost:5173";
        const resetLink = `${appUrl}?reset_token=${rawToken}`;

        const resendKey = process.env.RESEND_API_KEY;
        const from = process.env.RESEND_FROM ?? "onboarding@resend.dev";

        if (resendKey) {
          const { Resend } = await import("resend");
          const resend = new Resend(resendKey);
          await resend.emails.send({
            from,
            to: user.email,
            subject: "איפוס סיסמה — חשבונית IL",
            html: buildResetEmailHtml(user.displayName, resetLink)
          });
        } else {
          // Dev fallback — log the link
          app.log.info({ resetLink }, "Password reset link (RESEND_API_KEY not set)");
        }
      }

      return reply.send({ ok: true });
    }
  });

  // ── Reset password ────────────────────────────────────────────
  app.post("/auth/reset-password", {
    config: { skipAuth: true },
    schema: {
      body: {
        type: "object",
        required: ["token", "newPassword"],
        properties: {
          token: { type: "string", minLength: 1, maxLength: 128 },
          newPassword: { type: "string", minLength: 8, maxLength: 128 }
        },
        additionalProperties: false
      }
    },
    handler: async (request, reply) => {
      const { token, newPassword } = request.body as { token: string; newPassword: string };

      const tokenHash = createHash("sha256").update(token).digest("hex");

      const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return reply.status(400).send({ message: "קישור האיפוס אינו תקף או שפג תוקפו" });
      }

      const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { passwordHash: newHash } }),
        prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } })
      ]);

      return reply.send({ ok: true });
    }
  });
}

function buildResetEmailHtml(displayName: string, resetLink: string): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;direction:rtl">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;max-width:520px;width:100%">
        <tr><td style="padding:28px 28px 20px;background:#0f172a;text-align:center">
          <p style="margin:0;font-size:28px;color:#ffffff">₪</p>
          <p style="margin:8px 0 0;font-size:20px;font-weight:700;color:#ffffff">חשבונית IL</p>
        </td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 12px;font-size:16px;font-weight:600;color:#0f172a">שלום ${displayName},</p>
          <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6">
            קיבלנו בקשה לאיפוס הסיסמה לחשבון שלך. לחץ על הכפתור למטה לאיפוס הסיסמה.<br />
            הקישור יהיה תקף למשך שעה אחת.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
            <a href="${resetLink}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none">
              איפוס סיסמה
            </a>
          </td></tr></table>
          <p style="margin:20px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
            אם לא ביקשת לאפס את הסיסמה, ניתן להתעלם מהודעה זו — הסיסמה שלך לא תשתנה.
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8">
          חשבונית IL — מערכת הנהלת חשבונות ישראלית
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    path: "/",
    maxAge: 8 * 60 * 60 // 8 hours in seconds
  };
}
