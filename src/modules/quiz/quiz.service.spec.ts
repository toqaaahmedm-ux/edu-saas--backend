jest.mock('puppeteer', () => ({}));
import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { QuizRepository } from './quiz.repository';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const mockQuizRepository = {
  findAllWithCourse: jest.fn(),
  findByIdWithQuestions: jest.fn(),
  findById: jest.fn(),
  findQuestionsByQuizId: jest.fn(),
  findAttempt: jest.fn(),
  findCompletedAttempt: jest.fn(),
  findAllCompletedAttempts: jest.fn(),
  findLatestCompletedAttempt: jest.fn(),
  createAttempt: jest.fn(),
  updateAttemptResult: jest.fn(),
  deleteIncompleteAttempt: jest.fn(),
};

const mockCertificatesService = {
  issueIfPassed: jest.fn().mockResolvedValue(null),
};

const mockNotificationsService = {
  createNotification: jest.fn().mockResolvedValue({}),
};

const mockBillingService = {
  getTenantSubscription: jest.fn().mockResolvedValue(null),
};

const mockPrismaService = {
  course: {
    findUnique: jest.fn(),
  },
  enrollment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockQuiz = {
  id: 'quiz-123',
  title: 'JavaScript Quiz',
  timeLimit: 600,
  courseId: 'course-123',
  createdAt: new Date(),
};

const mockQuestions = [
  { id: 'q1', text: 'typeof null?', options: ['null', 'undefined', 'object', 'string'], correctIndex: 2, quizId: 'quiz-123' },
  { id: 'q2', text: 'Which keyword for constants?', options: ['var', 'let', 'const', 'static'], correctIndex: 2, quizId: 'quiz-123' },
  { id: 'q3', text: 'Result of 1 + "2"?', options: ['3', '"12"', '12', 'Error'], correctIndex: 2, quizId: 'quiz-123' },
];

const mockAttempt = {
  id: 'attempt-123',
  studentId: 'student-123',
  quizId: 'quiz-123',
  score: 0,
  startedAt: new Date(),
  submittedAt: null,
};

const mockEnrollment = {
  id: 'enrollment-123',
  studentId: 'student-123',
  courseId: 'course-123',
  progress: 100,
  status: 'ACTIVE',
};

const TENANT_ID = 'tenant-123';
const STUDENT_ID = 'student-123';

describe('QuizService', () => {
  let service: QuizService;
  let repository: typeof mockQuizRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        { provide: QuizRepository, useValue: mockQuizRepository },
        { provide: CertificatesService, useValue: mockCertificatesService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BillingService, useValue: mockBillingService },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    repository = mockQuizRepository;
    jest.clearAllMocks();

    mockPrismaService.enrollment.findUnique.mockResolvedValue(mockEnrollment);
    mockPrismaService.enrollment.findMany.mockResolvedValue([{ courseId: 'course-123' }]);
    mockPrismaService.course.findUnique.mockResolvedValue({ tenantId: TENANT_ID });
    mockQuizRepository.findAllCompletedAttempts.mockResolvedValue([]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllQuizzes', () => {
    it('يرجع كل الكويزات ضمن الكورسات اللي الطالب مسجل فيها', async () => {
      const mockList = [mockQuiz];
      repository.findAllWithCourse.mockResolvedValue(mockList);
      const result = await service.getAllQuizzes(TENANT_ID, STUDENT_ID);
      // QUIZ-WINDOW-NEW: service now attaches availability status per quiz
      expect(result).toEqual(mockList.map((q) => ({ ...q, availability: 'open' })));
      expect(repository.findAllWithCourse).toHaveBeenCalledWith(TENANT_ID, ['course-123'], undefined);
    });

    it('يرجع array فاضية لو مفيش كويزات', async () => {
      repository.findAllWithCourse.mockResolvedValue([]);
      const result = await service.getAllQuizzes(TENANT_ID, STUDENT_ID);
      expect(result).toEqual([]);
    });

    it('يرمي ForbiddenException لو courseId مش من ضمن كورسات الطالب', async () => {
      mockPrismaService.enrollment.findMany.mockResolvedValue([{ courseId: 'course-999' }]);
      await expect(service.getAllQuizzes(TENANT_ID, STUDENT_ID, 'course-123'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getQuizWithQuestions', () => {
    it('يرجع الكويز مع الأسئلة (مع الـ randomization)', async () => {
      const quizWithQuestions = { ...mockQuiz, questions: mockQuestions };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      const result = await service.getQuizWithQuestions('quiz-123', TENANT_ID, STUDENT_ID);

      expect(result.questions).toHaveLength(mockQuestions.length);
      expect(result.questions).toEqual(expect.arrayContaining(mockQuestions));
      expect(repository.findByIdWithQuestions).toHaveBeenCalledWith('quiz-123', TENANT_ID);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findByIdWithQuestions.mockResolvedValue(null);
      await expect(service.getQuizWithQuestions('wrong-id', TENANT_ID, STUDENT_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      const quizWithQuestions = { ...mockQuiz, questions: mockQuestions };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.getQuizWithQuestions('quiz-123', TENANT_ID, STUDENT_ID))
        .rejects.toThrow(ForbiddenException);
    });

    it('الأسئلة مش فيها correctIndex', async () => {
      const quizWithQuestions = {
        ...mockQuiz,
        questions: mockQuestions.map(({ correctIndex, ...q }) => q),
      };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      const result = await service.getQuizWithQuestions('quiz-123', TENANT_ID, STUDENT_ID);
      result.questions.forEach((q: any) => {
        expect(q.correctIndex).toBeUndefined();
      });
    });
  });

  describe('startQuiz', () => {
    it('ينشئ محاولة جديدة ويرجع attemptId', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findAllCompletedAttempts.mockResolvedValue([]);
      repository.deleteIncompleteAttempt.mockResolvedValue(undefined);
      repository.createAttempt.mockResolvedValue(mockAttempt);

      const result = await service.startQuiz(TENANT_ID, STUDENT_ID, 'quiz-123');

      expect(result).toHaveProperty('attemptId', 'attempt-123');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('attemptsUsed', 0);
      expect(result).toHaveProperty('attemptsRemaining', 3);
      expect(repository.createAttempt).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID, 'quiz-123');
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.startQuiz(TENANT_ID, STUDENT_ID, 'wrong-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.startQuiz(TENANT_ID, STUDENT_ID, 'quiz-123'))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي ForbiddenException لو الطالب خلص الحد الأقصى من المحاولات', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findAllCompletedAttempts.mockResolvedValue([
        { ...mockAttempt, submittedAt: new Date(), score: 50 },
        { ...mockAttempt, submittedAt: new Date(), score: 60 },
        { ...mockAttempt, submittedAt: new Date(), score: 70 },
      ]);
      await expect(service.startQuiz(TENANT_ID, STUDENT_ID, 'quiz-123'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('submitQuiz', () => {
    const answers = [
      { questionId: 'q1', answer: 2 },
      { questionId: 'q2', answer: 2 },
      { questionId: 'q3', answer: 0 },
    ];

    beforeEach(() => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findAttempt.mockResolvedValue(mockAttempt);
      repository.findQuestionsByQuizId.mockResolvedValue(mockQuestions);
      repository.updateAttemptResult.mockResolvedValue({ ...mockAttempt, score: 67 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 67, submittedAt: new Date() }]);
      mockPrismaService.enrollment.update.mockResolvedValue({});
      mockCertificatesService.issueIfPassed.mockResolvedValue(null);
      mockNotificationsService.createNotification.mockResolvedValue({});
    });

    it('يحسب النقاط صح - 2 صح من 3', async () => {
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(3);
      expect(result.score).toBe(67);
    });

    it('يرجع passed: true لو النتيجة >= 70%', async () => {
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptResult.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', allCorrect);
      expect(result.passed).toBe(true);
    });

    it('يرجع passed: false لو النتيجة < 70%', async () => {
      const wrongAnswers = [
        { questionId: 'q1', answer: 0 },
        { questionId: 'q2', answer: 0 },
        { questionId: 'q3', answer: 0 },
      ];
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 0, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', wrongAnswers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'wrong-id', answers))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي BadRequestException لو مفيش attempt', async () => {
      repository.findAttempt.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
    });

    it('يحفظ النتيجة والإجابات في قاعدة البيانات', async () => {
      await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers);
      expect(repository.updateAttemptResult).toHaveBeenCalledWith(
        'attempt-123',
        67,
        expect.arrayContaining([
          expect.objectContaining({ questionId: 'q1', isCorrect: true }),
        ]),
      );
    });

    it('يصدر شهادة تلقائياً لو النتيجة >= 70%', async () => {
      const mockCert = { id: 'cert-123', studentId: STUDENT_ID, courseId: 'course-123' };
      mockCertificatesService.issueIfPassed.mockResolvedValue(mockCert);
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptResult.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', allCorrect);
      expect(result.certificate).toEqual(mockCert);
    });

    it('يرجع score = 0 لو الإجابات كلها غلط', async () => {
      const allWrong = mockQuestions.map(q => ({ questionId: q.id, answer: 99 }));
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 0, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', allWrong);
      expect(result.score).toBe(0);
      expect(result.correct).toBe(0);
    });

    it('يرجع score = 100 لو الإجابات كلها صح', async () => {
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptResult.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', allCorrect);
      expect(result.score).toBe(100);
      expect(result.correct).toBe(3);
    });

    it('يرمي BadRequestException ويحفظ score = 0 لو عدى الـ time limit', async () => {
      const expiredAttempt = {
        ...mockAttempt,
        startedAt: new Date(Date.now() - (mockQuiz.timeLimit + 10) * 1000),
      };
      repository.findAttempt.mockResolvedValue(expiredAttempt);
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
      expect(repository.updateAttemptResult).toHaveBeenCalledWith('attempt-123', 0, []);
    });

    it('يرمي BadRequestException لو الـ answers array فاضية', async () => {
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', []))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو الـ answers مش موجودة', async () => {
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', null as any))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو الـ attempt اتبعت قبل كده', async () => {
      const submittedAttempt = { ...mockAttempt, submittedAt: new Date() };
      repository.findAttempt.mockResolvedValue(submittedAttempt);
      await expect(service.submitQuiz(TENANT_ID, STUDENT_ID, 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyAttempts', () => {
    it('يرجع قائمة محاولات الطالب المكتملة', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findAllCompletedAttempts.mockResolvedValue([
        { ...mockAttempt, score: 80, submittedAt: new Date() },
      ]);
      const result = await service.getMyAttempts(TENANT_ID, STUDENT_ID, 'quiz-123');
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('score', 80);
      expect(result[0]).toHaveProperty('passed', true);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.getMyAttempts(TENANT_ID, STUDENT_ID, 'quiz-123'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMyLatestAttempt', () => {
    it('يرمي NotFoundException لو مفيش محاولة مكتملة', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findLatestCompletedAttempt.mockResolvedValue(null);
      await expect(service.getMyLatestAttempt(TENANT_ID, STUDENT_ID, 'quiz-123'))
        .rejects.toThrow(NotFoundException);
    });
  });
});
