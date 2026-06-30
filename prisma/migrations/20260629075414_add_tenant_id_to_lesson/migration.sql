-- tenantId column already added in previous migration
-- Add NOT NULL constraint and foreign key only

ALTER TABLE "Lesson" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_tenantId_fkey" 
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;