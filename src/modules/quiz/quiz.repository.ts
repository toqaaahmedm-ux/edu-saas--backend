import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuizRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  async findByIdWithQuestions(quizId: string, tenantId: string) {
    return this.prisma.quiz.findFirst({
      where: { id: quizId, tenantId },
      include: {
        questions: {
          select: {
            id: true,
            text: true,
            options: true,
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

  async findLatestCompletedAttempt(studentId: string, quizId: string) {
    return this.prisma.quizAttempt.findFirst({
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

  async updateAttemptResult(attemptId: string, score: number, answers: unknown) {
    return this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { score, submittedAt: new Date(), answers: answers as any },
    });
  }
}
