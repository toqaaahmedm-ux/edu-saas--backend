import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { QuizRepository } from './quiz.repository';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ATTEMPTS = 3;

@Injectable()
export class QuizService {
  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly certificatesService: CertificatesService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) { }

  async getAllQuizzes(tenantId: string) {
    return this.quizRepository.findAllWithCourse(tenantId);
  }

  async getQuizWithQuestions(quizId: string, tenantId: string) { // ✅ BE-M03
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // ✅ BE-M03: تحقق إن الكويز تبع نفس المستأجر
    const course = await this.prisma.course.findUnique({
      where: { id: quiz.courseId },
      select: { tenantId: true },
    });
    if (!course || course.tenantId !== tenantId) {
      throw new NotFoundException('Quiz not found');
    }

    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    return { ...quiz, questions: shuffled };
  }

  async startQuiz(tenantId: string, studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to take this quiz');
    }

    const completedAttempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    if (completedAttempts.length >= MAX_ATTEMPTS) {
      const bestScore = Math.max(...completedAttempts.map((a) => a.score));
      throw new ForbiddenException(
        `Maximum attempts reached (${MAX_ATTEMPTS}). Your best score: ${bestScore}%`,
      );
    }

    await this.quizRepository.deleteIncompleteAttempt(studentId, quizId);
    const attempt = await this.quizRepository.createAttempt(tenantId, studentId, quizId);

    return {
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
      attemptsUsed: completedAttempts.length,
      attemptsRemaining: MAX_ATTEMPTS - completedAttempts.length,
    };
  }

  async submitQuiz(
    tenantId: string,
    studentId: string,
    quizId: string,
    answers: { questionId: string; answer: number }[],
  ) {
    if (!answers || answers.length === 0) {
      throw new BadRequestException('No answers submitted — request rejected');
    }

    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to submit this quiz');
    }

    const attempt = await this.quizRepository.findAttempt(studentId, quizId);
    if (!attempt) throw new BadRequestException('You must start the quiz first');
    if (attempt.submittedAt) throw new BadRequestException('Quiz already submitted');

    if (quiz.timeLimit) {
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
      if (elapsed > quiz.timeLimit + 5) {
        await this.quizRepository.updateAttemptScore(attempt.id, 0);
        throw new BadRequestException('Quiz time limit exceeded');
      }
    }

    const questions = await this.quizRepository.findQuestionsByQuizId(quizId);

    let correct = 0;
    for (const question of questions) {
      const submitted = answers.find((a) => a.questionId === question.id);
      if (submitted && Number(submitted.answer) === question.correctIndex) {
        correct++;
      }
    }

    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    await this.quizRepository.updateAttemptScore(attempt.id, score);

    const allAttempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    const bestScore = Math.max(...allAttempts.map((a) => a.score));
    const attemptsUsed = allAttempts.length;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

    await this.notificationsService.createNotification({
      userId: studentId,
      tenantId,
      title: score >= 70 ? 'أحسنت! اجتزت الاختبار 🎉' : 'نتيجة الاختبار',
      message: `حصلت على ${score}% في الاختبار`,
      type: 'QUIZ_COMPLETED',
    });

    let certificate = null;
    if (quiz.courseId && score >= 70) {
      await this.prisma.enrollment.update({
        where: {
          studentId_courseId: { studentId, courseId: quiz.courseId },
        },
        data: { progress: 100, status: 'COMPLETED' },
      });

      certificate = await this.certificatesService.issueIfPassed(
        tenantId, studentId, quiz.courseId, score,
      );

      if (certificate) {
        await this.notificationsService.createNotification({
          userId: studentId,
          tenantId,
          title: 'تهانينا! حصلت على شهادة 🏆',
          message: 'تم إصدار شهادتك بنجاح',
          type: 'CERTIFICATE',
        });
      }
    }

    return {
      score,
      correct,
      total: questions.length,
      passed: score >= 70,
      bestScore,
      attemptsUsed,
      attemptsRemaining,
      certificate: certificate ?? null,
    };
  }
}