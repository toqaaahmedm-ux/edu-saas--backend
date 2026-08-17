-- CreateEnum
CREATE TYPE "LiveSessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');
-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "status" "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "LiveSession_tenantId_scheduledAt_idx" ON "LiveSession"("tenantId", "scheduledAt");
-- CreateIndex
CREATE INDEX "LiveSession_courseId_idx" ON "LiveSession"("courseId");
-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;