-- FEAT: إضافة tenantId للـ Lesson (nullable فقط — NOT NULL هيتضاف في migration لاحق)
ALTER TABLE "Lesson" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

CREATE INDEX IF NOT EXISTS "Lesson_tenantId_idx" ON "Lesson"("tenantId");
CREATE INDEX IF NOT EXISTS "Lesson_courseId_idx" ON "Lesson"("courseId");