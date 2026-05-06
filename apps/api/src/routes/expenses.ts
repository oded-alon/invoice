import type { FastifyInstance } from "fastify";
import { prisma } from "@invoice/db";

function getUserId(request: { user: unknown }): string {
  return (request.user as { sub: string }).sub;
}

async function getBusinessId(userId: string): Promise<string | null> {
  const business = await prisma.business.findFirst({ where: { ownerUserId: userId }, select: { id: true } });
  return business?.id ?? null;
}

export async function registerExpenseRoutes(app: FastifyInstance) {
  app.get("/v1/expenses", async (request, reply) => {
    const businessId = await getBusinessId(getUserId(request));
    if (!businessId) return reply.code(404).send({ message: "עסק לא נמצא" });

    const expenses = await prisma.expense.findMany({
      where: { businessId },
      orderBy: { date: "desc" },
    });

    return reply.send({
      items: expenses.map((e: (typeof expenses)[number]) => ({
        id: e.id,
        date: e.date,
        category: e.category,
        amount: Number(e.amount),
        notes: e.notes ?? undefined,
      })),
    });
  });

  app.post("/v1/expenses", async (request, reply) => {
    const businessId = await getBusinessId(getUserId(request));
    if (!businessId) return reply.code(404).send({ message: "עסק לא נמצא" });

    const body = request.body as { date?: string; category?: string; amount?: number; notes?: string };

    if (!body.date || !body.category || typeof body.amount !== "number" || body.amount <= 0) {
      return reply.code(400).send({ message: "פרטי הוצאה לא תקינים" });
    }

    const expense = await prisma.expense.create({
      data: {
        businessId,
        date: body.date,
        category: body.category.trim(),
        amount: body.amount,
        notes: body.notes?.trim() || null,
      },
    });

    return reply.code(201).send({
      id: expense.id,
      date: expense.date,
      category: expense.category,
      amount: Number(expense.amount),
      notes: expense.notes ?? undefined,
    });
  });

  app.delete<{ Params: { id: string } }>("/v1/expenses/:id", async (request, reply) => {
    const businessId = await getBusinessId(getUserId(request));
    if (!businessId) return reply.code(404).send({ message: "עסק לא נמצא" });

    const expense = await prisma.expense.findFirst({
      where: { id: request.params.id, businessId },
    });

    if (!expense) return reply.code(404).send({ message: "הוצאה לא נמצאה" });

    await prisma.expense.delete({ where: { id: expense.id } });
    return reply.send({ ok: true });
  });
}
