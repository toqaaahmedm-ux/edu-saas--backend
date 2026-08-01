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
import { BillingService } from '../billing/billing.service';

const MAX_ATTEMPTS = 3;

export interface AnswerSnapshot {
  questionId: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  selectedAnswer: number | null;
  isCorrect: boolean;
}

// QUIZ-WINDOW-NEW: نوع مشترك لحالة إتاحة الكويز، بيستخدمه الفرونت لعرض
// الشارة/العد التنازلي الصحيح.
type QuizAvailability = 'upcoming' | 'open' | 'closed';

@Injectable()
export class QuizService {
  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly certificatesService: CertificatesService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) { }

  // QUIZ-WINDOW-NEW: helper مشترك لحساب حالة الإتاحة بناءً على openAt/closeAt
  private getAvailability(quiz: { openAt?: Date | null; closeAt?: Date | null }): QuizAvailability {
    const now = new Date();
    if (quiz.openAt && now < new Date(quiz.openAt)) return 'upcoming';
    if (quiz.closeAt && now > new Date(quiz.closeAt)) return 'closed';
    return 'open';
  }

  async getAllQuizzes(tenantId: string, studentId: string, courseId?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { courseId: true },
    });
    const enrolledCourseIds = enrollments.map((e) => e.courseId);

    if (courseId && !enrolledCourseIds.includes(courseId)) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    const quizzes = await this.quizRepository.findAllWithCourse(tenantId, enrolledCourseIds, courseId);

    // QUIZ-WINDOW-NEW: نضيف حالة الإتاحة الجاهزة لكل كويز عشان الفرونت
    // يعرض الشارة الصح من غير ما يحتاج يحسب بنفسه (وده أدق لأنه محسوب
    // بوقت السيرفر مش وقت جهاز الطالب).
    return quizzes.map((q) => ({
      ...q,
      availability: this.getAvailability(q),
    }));
  }

  async getQuizWithQuestions(quizId: string, tenantId: string, studentId: string) {
    const quiz = await this.quizRepository.findByIdWithQuestions(quizId, tenantId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to view this quiz');
    }

    const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5);
    return { ...quiz, questions: shuffled, availability: this.getAvailability(quiz) };
  }

  async startQuiz(tenantId: string, studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId, tenantId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to take this quiz');
    }

    // QUIZ-WINDOW-NEW: منع بدء الكويز قبل معاده أو بعد قفله. بنحسب وقت
    // السيرفر مش وقت الطالب عشان محدش يقدر يلف الساعة عنده ويفتح كويز
    // قافل.
    const now = new Date();
    if (quiz.openAt && now < new Date(quiz.openAt)) {
      throw new ForbiddenException(
        `This quiz is not open yet. It opens at ${new Date(quiz.openAt).toISOString()}`,
      );
    }
    if (quiz.closeAt && now > new Date(quiz.closeAt)) {
      throw new ForbiddenException('This quiz is closed and no longer accepts new attempts.');
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
      throw new BadRequestException('No answers submitted - request rejected');
    }

    const quiz = await this.quizRepository.findById(quizId, tenantId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to submit this quiz');
    }

    // QUIZ-WINDOW-NEW: هنا بنسمح بالتسليم حتى لو closeAt عدّى — لأن
    // الطالب يكون بدأ المحاولة أصلاً قبل القفل (ده اتحقق منه في
    // startQuiz)، ومنعه من التسليم دلوقتي معناه ضياع إجاباته ظلمًا.
    // القفل الحقيقي هو منع أي محاولة *جديدة* تبدأ بعد closeAt، مش منع
    // تسليم محاولة شغالة أصلاً.

    const attempt = await this.quizRepository.findAttempt(studentId, quizId);
    if (!attempt) throw new BadRequestException('You must start the quiz first');
    if (attempt.submittedAt) throw new BadRequestException('Quiz already submitted');

    if (quiz.timeLimit) {
      const elapsed = (Date.now() - attempt.startedAt.getTime()) / 1000;
      if (elapsed > quiz.timeLimit + 5) {
        await this.quizRepository.updateAttemptResult(attempt.id, 0, []);
        throw new BadRequestException('Quiz time limit exceeded');
      }
    }

    const questions = await this.quizRepository.findQuestionsByQuizId(quizId);

    let correct = 0;
    const answerSnapshots: AnswerSnapshot[] = [];
    for (const question of questions) {
      const submitted = answers.find((a) => a.questionId === question.id);
      const selectedAnswer = submitted ? Number(submitted.answer) : null;
      const isCorrect = selectedAnswer !== null && selectedAnswer === question.correctIndex;
      if (isCorrect) correct++;

      answerSnapshots.push({
        questionId: question.id,
        questionText: question.text,
        options: question.options,
        correctIndex: question.correctIndex,
        selectedAnswer,
        isCorrect,
      });
    }

    const score = questions.length > 0 ? Math.round((correct / questions.length) * 100) : 0;
    await this.quizRepository.updateAttemptResult(attempt.id, score, answerSnapshots);

    const allAttempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    const bestScore = Math.max(...allAttempts.map((a) => a.score));
    const attemptsUsed = allAttempts.length;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

    await this.notificationsService.createNotification({
      userId: studentId,
      tenantId,
      title: score >= 70 ? 'Passed the quiz' : 'Quiz result',
      message: `You scored ${score}% on the quiz`,
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
          title: 'Certificate issued',
          message: 'Your certificate has been issued successfully',
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

  async getMyAttempts(tenantId: string, studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId, tenantId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to view this quiz');
    }

    const attempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    return attempts.map((a) => ({
      attemptId: a.id,
      score: a.score,
      passed: a.score >= 70,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
    }));
  }

  async getMyLatestAttempt(tenantId: string, studentId: string, quizId: string) {
    const quiz = await this.quizRepository.findById(quizId, tenantId);
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to view this quiz');
    }

    const attempt = await this.quizRepository.findLatestCompletedAttempt(studentId, quizId);
    if (!attempt) throw new NotFoundException('No completed attempt found for this quiz');

    const allAttempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    const bestScore = Math.max(...allAttempts.map((a) => a.score));
    const attemptsUsed = allAttempts.length;
    const attemptsRemaining = Math.max(0, MAX_ATTEMPTS - attemptsUsed);

    let certificate = null;
    if (quiz.courseId) {
      certificate = await this.prisma.certificate.findUnique({
        where: { studentId_courseId: { studentId, courseId: quiz.courseId } },
      });
    }

    const answers = ((attempt.answers as unknown) as AnswerSnapshot[]) ?? [];
    const correct = answers.filter((a) => a.isCorrect).length;

    return {
      attemptId: attempt.id,
      courseId: quiz.courseId,
      score: attempt.score,
      correct,
      total: answers.length,
      passed: attempt.score >= 70,
      bestScore,
      attemptsUsed,
      attemptsRemaining,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      certificate: certificate ?? null,
      answers,
    };
  }

  async createQuizWithQuestions(
    tenantId: string,
    instructorId: string,
    data: {
      courseId: string;
      title: string;
      timeLimit?: number;
      passScore?: number;
      // QUIZ-WINDOW-NEW: اختياريين — لو المعلم سابهم فاضيين، الكويز
      // يفضل متاح على طول زي ما كان قبل كده (سلوك افتراضي غير كاسر).
      openAt?: string;
      closeAt?: string;
      questions: {
        text: string;
        options: string[];
        correctIndex: number;
      }[];
    },
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: data.courseId },
      select: { tenantId: true, instructorId: true },
    });

    if (!course || course.tenantId !== tenantId) {
      throw new NotFoundException('Course not found');
    }

    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('You can only add quizzes to your own courses');
    }

    if (!data.questions || data.questions.length === 0) {
      throw new BadRequestException('Quiz must have at least one question');
    }

    // QUIZ-WINDOW-NEW: تحقق منطقي بسيط — لو الاتنين محددين، لازم القفل
    // يكون بعد الفتح.
    const openAtDate = data.openAt ? new Date(data.openAt) : null;
    const closeAtDate = data.closeAt ? new Date(data.closeAt) : null;
    if (openAtDate && closeAtDate && closeAtDate <= openAtDate) {
      throw new BadRequestException('closeAt must be after openAt');
    }

    const subscription = await this.billingService.getTenantSubscription(tenantId);

    const quiz = await this.prisma.$transaction(async (tx) => {
      if (subscription) {
        const maxQuizzes = subscription.plan.maxQuizzes;
        const currentQuizzes = await tx.quiz.count({
          where: { tenantId },
        });
        if (currentQuizzes >= maxQuizzes) {
          throw new BadRequestException(
            `Quiz limit reached (${maxQuizzes}). Please upgrade your plan.`,
          );
        }
      }

      const newQuiz = await tx.quiz.create({
        data: {
          tenantId,
          title: data.title,
          courseId: data.courseId,
          timeLimit: data.timeLimit ?? 600,
          passScore: data.passScore ?? 70,
          openAt: openAtDate,
          closeAt: closeAtDate,
        },
      });

      await tx.question.createMany({
        data: data.questions.map((q) => ({
          quizId: newQuiz.id,
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
        })),
      });

      return newQuiz;
    });

    return { success: true, data: quiz };
  }

  async getQuizzesByCourse(courseId: string, tenantId: string, instructorId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { tenantId: true, instructorId: true },
    });

    if (!course || course.tenantId !== tenantId) {
      throw new NotFoundException('Course not found');
    }

    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('Access denied');
    }

    const quizzes = await this.prisma.quiz.findMany({
      where: { courseId, tenantId },
      include: { _count: { select: { questions: true, attempts: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return { success: true, data: quizzes };
  }

  async deleteQuiz(quizId: string, tenantId: string, instructorId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { id: quizId, tenantId },
      include: { course: { select: { instructorId: true } } },
    });

    if (!quiz) throw new NotFoundException('Quiz not found');

    if (quiz.course.instructorId !== instructorId) {
      throw new ForbiddenException('You can only delete your own quizzes');
    }

    await this.prisma.quiz.delete({ where: { id: quizId } });
    return { success: true };
  }
}