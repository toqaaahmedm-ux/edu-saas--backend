-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('TUTOR', 'SCHOOL', 'UNIVERSITY', 'CENTER');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "academicConfig" JSONB,
ADD COLUMN     "gradeScale" TEXT NOT NULL DEFAULT 'PERCENT_AF',
ADD COLUMN     "type" "TenantType" NOT NULL DEFAULT 'TUTOR';
