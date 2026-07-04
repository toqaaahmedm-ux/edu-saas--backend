import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuizRepository {
  constructor(private readonly prisma: PrismaService) {}

  // S-SEC02 fix: scoped by tenantId directly now, and optionally narrowed to
  // a specific course or a list of the student's enrolled courses.
  async findAllWithCourse(tenantId: string, enrolledCourseIds: string[], courseId?: string) {
    return this.prisma.quiz.findMany({
      where: {
        tenantId,
        courseId: courseId ?? { in: enrolledCourseIds },
      },
      include: {
        course: { select: { id: true, title: true } },
        questions: { select: { id: true } },
      },
    });
  }

  // security fix (ب): tenantId is now part of the lookup itself, not a
  // separate check done after the fact in the service.
  async findByIdWithQuestions(quizId: string, tenantId: string) {
    return this.prisma.quiz.findFirst({
      where: { id: quizId, tenantId },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            options: true,
            // correctIndex محذوف — لا يُرسل للعميل أبداً
          },
        },
      },
    });
  }

  async findById(quizId: string, tenantId: string) {
    return this.prisma.quiz.findFirst({ where: { id: quizId, tenantId } });
  }

  async findQuestionsByQuizId(quizId: string) {
    return this.prisma.question.findMany({ where: { quizId } });
  }

  async findAttempt(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findCompletedAttempt(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findFirst({
      where: { studentId, quizId, submittedAt: { not: null } },
    });
  }

  async findAllCompletedAttempts(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findMany({
      where: { studentId, quizId, submittedAt: { not: null } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async createAttempt(tenantId: string, studentId: string, quizId: string) {
    return this.prisma.quizAttempt.create({
      data: { tenantId, studentId, quizId, score: 0, startedAt: new Date() },
    });
  }

  async deleteIncompleteAttempt(studentId: string, quizId: string) {
    await this.prisma.quizAttempt.deleteMany({
      where: { studentId, quizId, submittedAt: null },
    });
  }

  async updateAttemptScore(attemptId: string, score: number) {
    return this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { score, submittedAt: new Date() },
    });
  }
}