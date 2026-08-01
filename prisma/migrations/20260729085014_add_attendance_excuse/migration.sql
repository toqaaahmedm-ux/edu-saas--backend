-- CreateEnum
CREATE TYPE "ExcuseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "excuseFileUrl" TEXT,
ADD COLUMN     "excuseReason" TEXT,
ADD COLUMN     "excuseRequestedAt" TIMESTAMP(3),
ADD COLUMN     "excuseReviewedAt" TIMESTAMP(3),
ADD COLUMN     "excuseReviewedBy" TEXT,
ADD COLUMN     "excuseStatus" "ExcuseStatus";

-- CreateIndex
CREATE INDEX "Attendance_excuseStatus_idx" ON "Attendance"("excuseStatus");
