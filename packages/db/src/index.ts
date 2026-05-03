import prismaClientModule from "@prisma/client";

const PrismaClientCtor = (prismaClientModule as any).PrismaClient;

const globalForPrisma = globalThis as typeof globalThis & {
	prisma?: any;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClientCtor();

if (process.env.NODE_ENV !== "production") {
	globalForPrisma.prisma = prisma;
}
