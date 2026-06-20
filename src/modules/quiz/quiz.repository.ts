import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuizRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllWithCourse(tenantId: string) {
    return this.prisma.quiz.findMany({
      where: { course: { tenantId } },
      include: {
        course: { select: { id: true, title: true } },
        questions: { select: { id: true } },
      },
    });
  }

  async findByIdWithQuestions(quizId: string) {
    return this.prisma.quiz.findUnique({
      where: { id: quizId },
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

  async findById(quizId: string) {
    return this.prisma.quiz.findUnique({ where: { id: quizId } });
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

  // FEAT-07: جيب كل المحاولات المكتملة
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