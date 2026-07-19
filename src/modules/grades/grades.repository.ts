import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GradesRepository {
  constructor(private prisma: PrismaService) {}

  getTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true, gradeScale: true },
    });
  }

  // every submitted quiz attempt for this student in this course —
  // QuizAttempt.score is already stored as a 0-100 percentage
  // (same assumption CoursesService.getTeacherAnalytics makes)
  getQuizScores(courseId: string, studentId: string, tenantId: string) {
    return this.prisma.quizAttempt.findMany({
      where: {
        tenantId,
        studentId,
        submittedAt: { not: null },
        quiz: { courseId },
      },
      select: { score: true },
    });
  }

  // only graded submissions count — DRAFT/SUBMITTED-but-ungraded
  // work doesn't affect the running grade
  getAssignmentScores(courseId: string, studentId: string, tenantId: string) {
    return this.prisma.assignmentSubmission.findMany({
      where: {
        tenantId,
        studentId,
        status: 'GRADED',
        assignment: { courseId },
      },
      select: { score: true, assignment: { select: { maxScore: true } } },
    });
  }

  findByCourse(courseId: string, tenantId: string) {
    return this.prisma.grade.findMany({
      where: { tenantId, courseId },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { score: 'desc' },
    });
  }

  findByStudentAndCourse(courseId: string, studentId: string, tenantId: string) {
    return this.prisma.grade.findFirst({
      where: { tenantId, courseId, studentId },
    });
  }

  upsert(data: {
    tenantId: string;
    studentId: string;
    courseId: string;
    score: number;
    letterGrade: string | null;
    gpa: number | null;
  }) {
    return this.prisma.grade.upsert({
      where: {
        tenantId_studentId_courseId: {
          tenantId: data.tenantId,
          studentId: data.studentId,
          courseId: data.courseId,
        },
      },
      create: data,
      update: {
        score: data.score,
        letterGrade: data.letterGrade,
        gpa: data.gpa,
        computedAt: new Date(),
      },
    });
  }

  updateNotes(id: string, notes: string, tenantId: string) {
    return this.prisma.grade.update({
      where: { id, ...(tenantId && { tenantId }) },
      data: { notes },
    });
  }
}