-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "primaryColor" TEXT DEFAULT '#2563EB';
