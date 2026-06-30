-- =====================================================
-- RLS: Row Level Security على كل الجداول المرتبطة بالمستأجر
-- =====================================================

-- Course
ALTER TABLE "Course" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Course" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Course"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Enrollment
ALTER TABLE "Enrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Enrollment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Enrollment"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Certificate
ALTER TABLE "Certificate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Certificate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Certificate"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- QuizAttempt
ALTER TABLE "QuizAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QuizAttempt" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "QuizAttempt"
  USING ("tenantId" = current_setting('app.tenant_id', true));

-- Notification
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING ("tenantId" = current_setting('app.tenant_id', true));