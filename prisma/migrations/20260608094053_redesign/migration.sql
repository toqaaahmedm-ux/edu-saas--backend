/*
  Warnings:

  - A unique constraint covering the columns `[studentId,courseId]` on the table `Certificate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[courseId,order]` on the table `Lesson` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN     "examName" TEXT NOT NULL DEFAULT 'General Exam',
ADD COLUMN     "facultyName" TEXT NOT NULL DEFAULT 'Online Learning',
ADD COLUMN     "institutionName" TEXT NOT NULL DEFAULT 'EduSaaS';

-- CreateIndex
CREATE INDEX "Certificate_studentId_idx" ON "Certificate"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_studentId_courseId_key" ON "Certificate"("studentId", "courseId");

-- CreateIndex
CREATE INDEX "Course_status_idx" ON "Course"("status");

-- CreateIndex
CREATE INDEX "Course_instructorId_idx" ON "Course"("instructorId");

-- CreateIndex
CREATE INDEX "Enrollment_studentId_idx" ON "Enrollment"("studentId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Lesson_courseId_order_key" ON "Lesson"("courseId", "order");

-- CreateIndex
CREATE INDEX "QuizAttempt_studentId_quizId_idx" ON "QuizAttempt"("studentId", "quizId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
