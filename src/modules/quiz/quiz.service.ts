import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { QuizRepository } from './quiz.repository';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class QuizService {
  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly certificatesService: CertificatesService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  async getAllQuizzes() {
    return this.quizRepository.findAllWithCourse();
  }

  async getQuizWithQuestions(quizId: string) {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // التحقق من وجود الكورس
    return quiz;
  }

  async startQuiz(studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // التحقق من التسجيل في الكورس
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to take this quiz');
    }

    const completed = await this.quizRepository.findCompletedAttempt(studentId, quizId);
    if (completed) {
      throw new ForbiddenException('You have already completed this quiz');
    }

    await this.quizRepository.deleteIncompleteAttempt(studentId, quizId);
    const attempt = await this.quizRepository.createAttempt(studentId, quizId);
    return { attemptId: attempt.id, startedAt: attempt.startedAt };
  }

  async submitQuiz(
    studentId: string,
    quizId: string,
    answers: { questionId: string; answer: number }[],
  ) {
    const quiz = await this.quizRepository.findById(quizId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    // التحقق من التسجيل في الكورس
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to submit this quiz');
    }

    const attempt = await this.quizRepository.findAttempt(studentId, quizId);
    if (!attempt) throw new BadRequestException('You must start the quiz first');

    if (attempt.submittedAt) {
      throw new BadRequestException('Quiz already submitted');
    }

    if (quiz.timeLimit) {
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
      const allowedSeconds = quiz.timeLimit + 5;
      if (elapsed > allowedSeconds) {
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

    const score = questions.length > 0
      ? Math.round((correct / questions.length) * 100)
      : 0;

    await this.quizRepository.updateAttemptScore(attempt.id, score);

    await this.notificationsService.createNotification({
      userId: studentId,
      title: score >= 60 ? 'أحسنت! اجتزت الاختبار 🎉' : 'نتيجة الاختبار',
      message: `حصلت على ${score}% في الاختبار`,
      type: 'QUIZ_COMPLETED',
    });

    let certificate = null;
    if (quiz.courseId) {
      certificate = await this.certificatesService.issueIfPassed(
        studentId,
        quiz.courseId,
        score,
      );

      if (certificate) {
        await this.notificationsService.createNotification({
          userId: studentId,
          title: 'تهانينا! حصلت على شهادة 🏆',
          message: `تم إصدار شهادتك بنجاح`,
          type: 'CERTIFICATE',
        });
      }
    }

    return {
      score,
      correct,
      total: questions.length,
      passed: score >= 60,
      certificate: certificate ?? null,
    };
  }
}