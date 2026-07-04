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

  // ─── Student Methods ────────────────────────────────────────────────────────

  // S-SEC02 fix: a student only ever sees quizzes from courses they're actually
  // enrolled in. Passing courseId narrows it further, but it still has to be
  // one of their enrolled courses — otherwise this throws instead of leaking
  // quiz titles/question counts for a course they never paid for.
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

  // security fix ( B) + enrollment check: quiz is now looked up scoped to
  // tenantId directly (no more separate course.tenantId cross-check), and we
  // still confirm the student is enrolled before handing back any question data.
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

  // ─── Teacher Methods (T-01 FIX) ─────────────────────────────────────────────

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

    const quiz = await this.prisma.$transaction(async (tx) => {
      const newQuiz = await tx.quiz.create({
        data: {
          tenantId, // security fix (B): stamp the quiz with its tenant at creation time
          title: data.title,
          courseId: data.courseId,
          timeLimit: data.timeLimit ?? 600,
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
      where: { courseId, tenantId }, // defense in depth — tenantId checked here too now, not just via course
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