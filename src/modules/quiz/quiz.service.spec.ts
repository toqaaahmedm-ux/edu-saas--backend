import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { QuizRepository } from './quiz.repository';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const mockQuizRepository = {
  findAllWithCourse: jest.fn(),
  findByIdWithQuestions: jest.fn(),
  findById: jest.fn(),
  findQuestionsByQuizId: jest.fn(),
  findAttempt: jest.fn(),
  findCompletedAttempt: jest.fn(),
  findAllCompletedAttempts: jest.fn(), // FEAT-07
  createAttempt: jest.fn(),
  updateAttemptScore: jest.fn(),
  deleteIncompleteAttempt: jest.fn(),
};

const mockCertificatesService = {
  issueIfPassed: jest.fn().mockResolvedValue(null),
};

const mockNotificationsService = {
  createNotification: jest.fn().mockResolvedValue({}),
};

// ✅ BE-M03: ضفنا course.findUnique للتحقق من الـ tenant
// ✅ ضفنا enrollment.update لإن submitQuiz بقى بيحدّث progress الكورس
const mockPrismaService = {
  course: {
    findUnique: jest.fn(),
  },
  enrollment: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockQuiz = {
  id: 'quiz-123',
  title: 'اختبار JavaScript',
  timeLimit: 600,
  courseId: 'course-123',
  createdAt: new Date(),
};

const mockQuestions = [
  { id: 'q1', text: 'ما هو typeof null؟', options: ['null', 'undefined', 'object', 'string'], correctIndex: 2, quizId: 'quiz-123' },
  { id: 'q2', text: 'أي keyword للثوابت؟', options: ['var', 'let', 'const', 'static'], correctIndex: 2, quizId: 'quiz-123' },
  { id: 'q3', text: 'ناتج 1 + "2"؟', options: ['3', '"12"', '12', 'Error'], correctIndex: 2, quizId: 'quiz-123' },
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
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    repository = mockQuizRepository;
    jest.clearAllMocks();

    mockPrismaService.enrollment.findUnique.mockResolvedValue(mockEnrollment);
    // ✅ BE-M03: default — الكويز تابع لنفس الـ tenant
    mockPrismaService.course.findUnique.mockResolvedValue({ tenantId: TENANT_ID });
    // FEAT-07: default — مفيش محاولات مكتملة
    mockQuizRepository.findAllCompletedAttempts.mockResolvedValue([]);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllQuizzes', () => {
    it('يرجع كل الكويزات', async () => {
      const mockList = [mockQuiz];
      repository.findAllWithCourse.mockResolvedValue(mockList);
      const result = await service.getAllQuizzes(TENANT_ID);
      expect(result).toEqual(mockList);
      expect(repository.findAllWithCourse).toHaveBeenCalledTimes(1);
    });

    it('يرجع array فاضية لو مفيش كويزات', async () => {
      repository.findAllWithCourse.mockResolvedValue([]);
      const result = await service.getAllQuizzes(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  describe('getQuizWithQuestions', () => {
    it('يرجع الكويز مع الأسئلة (مع الـ randomization)', async () => {
      const quizWithQuestions = { ...mockQuiz, questions: mockQuestions };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      mockPrismaService.course.findUnique.mockResolvedValue({ tenantId: TENANT_ID });
      const result = await service.getQuizWithQuestions('quiz-123', TENANT_ID);

      // FEAT-07: الأسئلة بتتخلط — نتحقق من المحتوى مش الترتيب
      expect(result.questions).toHaveLength(mockQuestions.length);
      expect(result.questions).toEqual(expect.arrayContaining(mockQuestions));
      expect(repository.findByIdWithQuestions).toHaveBeenCalledWith('quiz-123');
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findByIdWithQuestions.mockResolvedValue(null);
      await expect(service.getQuizWithQuestions('wrong-id', TENANT_ID))
        .rejects.toThrow(NotFoundException);
    });

    // ✅ BE-M03: حالة جديدة — الكويز موجود بس تابع لـ tenant تاني
    it('يرمي NotFoundException لو الكويز تابع لمستأجر تاني', async () => {
      const quizWithQuestions = { ...mockQuiz, questions: mockQuestions };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      mockPrismaService.course.findUnique.mockResolvedValue({ tenantId: 'other-tenant' });
      await expect(service.getQuizWithQuestions('quiz-123', TENANT_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('الأسئلة مش فيها correctIndex', async () => {
      const quizWithQuestions = {
        ...mockQuiz,
        questions: mockQuestions.map(({ correctIndex, ...q }) => q),
      };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      mockPrismaService.course.findUnique.mockResolvedValue({ tenantId: TENANT_ID });
      const result = await service.getQuizWithQuestions('quiz-123', TENANT_ID);
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

      const result = await service.startQuiz(TENANT_ID, 'student-123', 'quiz-123');

      expect(result).toHaveProperty('attemptId', 'attempt-123');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('attemptsUsed', 0);
      expect(result).toHaveProperty('attemptsRemaining', 3);
      expect(repository.createAttempt).toHaveBeenCalledWith('tenant-123', 'student-123', 'quiz-123');
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.startQuiz(TENANT_ID, 'student-123', 'wrong-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.startQuiz(TENANT_ID, 'student-123', 'quiz-123'))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي ForbiddenException لو الطالب خلص الحد الأقصى من المحاولات', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      // FEAT-07: 3 محاولات مكتملة = وصل الحد
      repository.findAllCompletedAttempts.mockResolvedValue([
        { ...mockAttempt, submittedAt: new Date(), score: 50 },
        { ...mockAttempt, submittedAt: new Date(), score: 60 },
        { ...mockAttempt, submittedAt: new Date(), score: 70 },
      ]);
      await expect(service.startQuiz(TENANT_ID, 'student-123', 'quiz-123'))
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
      repository.updateAttemptScore.mockResolvedValue({ ...mockAttempt, score: 67 });
      // FEAT-07: بعد الـ submit في الـ test، نرجع محاولة واحدة
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 67, submittedAt: new Date() }]);
      // ✅ جديد — submitQuiz بيستدعي enrollment.update لو النتيجة >= 70
      mockPrismaService.enrollment.update.mockResolvedValue({});
      mockCertificatesService.issueIfPassed.mockResolvedValue(null);
      mockNotificationsService.createNotification.mockResolvedValue({});
    });

    it('يحسب النقاط صح – 2 صح من 3', async () => {
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(3);
      expect(result.score).toBe(67);
    });

    it('يرجع passed: true لو النتيجة >= 70%', async () => {
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptScore.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', allCorrect);
      expect(result.passed).toBe(true);
    });

    it('يرجع passed: false لو النتيجة < 70%', async () => {
      const wrongAnswers = [
        { questionId: 'q1', answer: 0 },
        { questionId: 'q2', answer: 0 },
        { questionId: 'q3', answer: 0 },
      ];
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 0, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', wrongAnswers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'wrong-id', answers))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي BadRequestException لو مفيش attempt', async () => {
      repository.findAttempt.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
    });

    it('يحفظ النتيجة في قاعدة البيانات', async () => {
      await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers);
      expect(repository.updateAttemptScore).toHaveBeenCalledWith('attempt-123', 67);
    });

    it('يصدر شهادة تلقائياً لو النتيجة >= 70%', async () => {
      const mockCert = { id: 'cert-123', studentId: 'student-123', courseId: 'course-123' };
      mockCertificatesService.issueIfPassed.mockResolvedValue(mockCert);
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptScore.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', allCorrect);
      expect(result.certificate).toEqual(mockCert);
    });

    it('يرجع score = 0 لو الإجابات كلها غلط', async () => {
      const allWrong = mockQuestions.map(q => ({ questionId: q.id, answer: 99 }));
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 0, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', allWrong);
      expect(result.score).toBe(0);
      expect(result.correct).toBe(0);
    });

    it('يرجع score = 100 لو الإجابات كلها صح', async () => {
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptScore.mockResolvedValue({ ...mockAttempt, score: 100 });
      repository.findAllCompletedAttempts.mockResolvedValue([{ ...mockAttempt, score: 100, submittedAt: new Date() }]);
      const result = await service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', allCorrect);
      expect(result.score).toBe(100);
      expect(result.correct).toBe(3);
    });

    it('يرمي BadRequestException ويحفظ score = 0 لو عدى الـ time limit', async () => {
      const expiredAttempt = {
        ...mockAttempt,
        startedAt: new Date(Date.now() - (mockQuiz.timeLimit + 10) * 1000),
      };
      repository.findAttempt.mockResolvedValue(expiredAttempt);
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
      expect(repository.updateAttemptScore).toHaveBeenCalledWith('attempt-123', 0);
    });

    it('يرمي BadRequestException لو الـ answers array فاضية', async () => {
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', []))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو الـ answers مش موجودة', async () => {
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', null as any))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل في الكورس', async () => {
      mockPrismaService.enrollment.findUnique.mockResolvedValue(null);
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو الـ attempt اتبعت قبل كده', async () => {
      const submittedAttempt = { ...mockAttempt, submittedAt: new Date() };
      repository.findAttempt.mockResolvedValue(submittedAttempt);
      await expect(service.submitQuiz(TENANT_ID, 'student-123', 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
    });
  });
});