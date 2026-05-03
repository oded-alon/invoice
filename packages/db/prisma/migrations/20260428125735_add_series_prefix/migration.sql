-- AlterTable
ALTER TABLE "DocumentSequence" ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "startingNumber" INTEGER NOT NULL DEFAULT 1;
