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

@Injectable()
export class QuizService {
  constructor(
    private readonly quizRepository: QuizRepository,
    private readonly certificatesService: CertificatesService,
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService, // Bug #4 FIX: needed for maxQuizzes enforcement
  ) { }

  // ─── Student Methods ────────────────────────────────────────────────────

  // Students only see quizzes from courses they're enrolled in.
  // If a courseId filter is passed, we still verify it's one of their
  // enrolled courses before returning anything — no peeking at other courses.
  async getAllQuizzes(tenantId: string, studentId: string, courseId?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      select: { courseId: true },
    });
    const enrolledCourseIds = enrollments.map((e) => e.courseId);

    if (courseId && !enrolledCourseIds.includes(courseId)) {
      throw new ForbiddenException('You are not enrolled in this course');
    }

    return this.quizRepository.findAllWithCourse(tenantId, enrolledCourseIds, courseId);
  }

  // Quiz lookup is scoped to tenantId so a student from tenant A can never
  // pull a quiz from tenant B, even if they somehow know the ID.
  // We also check enrollment before returning any question data.
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
    return { ...quiz, questions: shuffled };
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

    const completedAttempts = await this.quizRepository.findAllCompletedAttempts(studentId, quizId);
    if (completedAttempts.length >= MAX_ATTEMPTS) {
      const bestScore = Math.max(...completedAttempts.map((a) => a.score));
      throw new ForbiddenException(
        `Maximum attempts reached (${MAX_ATTEMPTS}). Your best score: ${bestScore}%`,
      );
    }

    // clean up any abandoned attempt before starting a fresh one
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

    const quiz = await this.quizRepository.findById(quizId, tenantId);
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

    // give a 5-second grace period for network lag before rejecting a late submission
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
      // mark the enrollment complete before trying to issue a certificate,
      // otherwise the certificate service might see an incomplete enrollment
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

  // ─── Teacher Methods ────────────────────────────────────────────────────

  async createQuizWithQuestions(
    tenantId: string,
    instructorId: string,
    data: {
      courseId: string;
      title: string;
      timeLimit?: number;
      passScore?: number;
      questions: {
        text: string;
        options: string[];
        correctIndex: number;
      }[];
    },
  ) {
    // make sure the course exists in this tenant and belongs to this teacher
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

    // Bug #4 FIX (Admin Report §4.1/§2): maxQuizzes existed as a schema
    // field but nothing ever checked it — a tenant on any plan, including
    // the cheapest one, could create unlimited quizzes. This mirrors the
    // exact pattern already used for maxCourses in courses.service.ts:
    // look up the active subscription, and if the tenant has one, count
    // existing quizzes and reject before creating a new one over the limit.
    const subscription = await this.billingService.getTenantSubscription(tenantId);

    // wrap quiz + questions in a transaction so we never end up with a
    // quiz row that has no questions if createMany fails halfway through
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
          passScore: data.passScore ?? 70, // was missing before — frontend value was silently dropped
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