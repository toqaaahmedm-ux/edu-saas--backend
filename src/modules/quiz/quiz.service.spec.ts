import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { QuizRepository } from './quiz.repository';
import { CertificatesService } from '../certificates/certificates.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

// ── Mock Repository ──────────────────────────────────────────────────────────
const mockQuizRepository = {
  findAllWithCourse: jest.fn(),
  findByIdWithQuestions: jest.fn(),
  findById: jest.fn(),
  findQuestionsByQuizId: jest.fn(),
  findAttempt: jest.fn(),
  findCompletedAttempt: jest.fn(),
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

// ── Test Data ─────────────────────────────────────────────────────────────────
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

// ── Test Suite ────────────────────────────────────────────────────────────────
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
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    repository = mockQuizRepository;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getAllQuizzes', () => {
    it('يرجع كل الكويزات', async () => {
      const mockList = [mockQuiz];
      repository.findAllWithCourse.mockResolvedValue(mockList);
      const result = await service.getAllQuizzes();
      expect(result).toEqual(mockList);
      expect(repository.findAllWithCourse).toHaveBeenCalledTimes(1);
    });

    it('يرجع array فاضية لو مفيش كويزات', async () => {
      repository.findAllWithCourse.mockResolvedValue([]);
      const result = await service.getAllQuizzes();
      expect(result).toEqual([]);
    });
  });

  describe('getQuizWithQuestions', () => {
    it('يرجع الكويز مع الأسئلة', async () => {
      const quizWithQuestions = { ...mockQuiz, questions: mockQuestions };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      const result = await service.getQuizWithQuestions('quiz-123');
      expect(result).toEqual(quizWithQuestions);
      expect(repository.findByIdWithQuestions).toHaveBeenCalledWith('quiz-123');
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findByIdWithQuestions.mockResolvedValue(null);
      await expect(service.getQuizWithQuestions('wrong-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('الأسئلة مش فيها correctIndex', async () => {
      const quizWithQuestions = {
        ...mockQuiz,
        questions: mockQuestions.map(({ correctIndex, ...q }) => q),
      };
      repository.findByIdWithQuestions.mockResolvedValue(quizWithQuestions);
      const result = await service.getQuizWithQuestions('quiz-123');
      result.questions.forEach((q: any) => {
        expect(q.correctIndex).toBeUndefined();
      });
    });
  });

  describe('startQuiz', () => {
    it('ينشئ محاولة جديدة ويرجع attemptId', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findCompletedAttempt.mockResolvedValue(null);
      repository.deleteIncompleteAttempt.mockResolvedValue(undefined);
      repository.createAttempt.mockResolvedValue(mockAttempt);

      const result = await service.startQuiz('student-123', 'quiz-123');

      expect(result).toHaveProperty('attemptId', 'attempt-123');
      expect(result).toHaveProperty('startedAt');
      expect(repository.createAttempt).toHaveBeenCalledWith('student-123', 'quiz-123');
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.startQuiz('student-123', 'wrong-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو الطالب خلص الكويز قبل كده', async () => {
      repository.findById.mockResolvedValue(mockQuiz);
      repository.findCompletedAttempt.mockResolvedValue({ ...mockAttempt, submittedAt: new Date() });
      await expect(service.startQuiz('student-123', 'quiz-123'))
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
      mockCertificatesService.issueIfPassed.mockResolvedValue(null);
      mockNotificationsService.createNotification.mockResolvedValue({});
    });

    it('يحسب النقاط صح — 2 صح من 3', async () => {
      const result = await service.submitQuiz('student-123', 'quiz-123', answers);
      expect(result.correct).toBe(2);
      expect(result.total).toBe(3);
      expect(result.score).toBe(67);
    });

    it('يرجع passed: true لو النتيجة >= 60%', async () => {
      const result = await service.submitQuiz('student-123', 'quiz-123', answers);
      expect(result.passed).toBe(true);
    });

    it('يرجع passed: false لو النتيجة < 60%', async () => {
      const wrongAnswers = [
        { questionId: 'q1', answer: 0 },
        { questionId: 'q2', answer: 0 },
        { questionId: 'q3', answer: 0 },
      ];
      const result = await service.submitQuiz('student-123', 'quiz-123', wrongAnswers);
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.submitQuiz('student-123', 'wrong-id', answers))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي BadRequestException لو مفيش attempt', async () => {
      repository.findAttempt.mockResolvedValue(null);
      await expect(service.submitQuiz('student-123', 'quiz-123', answers))
        .rejects.toThrow(BadRequestException);
    });

    it('يحفظ النتيجة في قاعدة البيانات', async () => {
      await service.submitQuiz('student-123', 'quiz-123', answers);
      expect(repository.updateAttemptScore).toHaveBeenCalledWith('attempt-123', 67);
    });

    it('يصدر شهادة تلقائياً لو النتيجة >= 60%', async () => {
      const mockCert = { id: 'cert-123', studentId: 'student-123', courseId: 'course-123' };
      mockCertificatesService.issueIfPassed.mockResolvedValue(mockCert);
      const result = await service.submitQuiz('student-123', 'quiz-123', answers);
      expect(result.certificate).toEqual(mockCert);
    });

    it('يرجع score = 0 لو الإجابات كلها غلط', async () => {
      const allWrong = mockQuestions.map(q => ({ questionId: q.id, answer: 99 }));
      const result = await service.submitQuiz('student-123', 'quiz-123', allWrong);
      expect(result.score).toBe(0);
      expect(result.correct).toBe(0);
    });

    it('يرجع score = 100 لو الإجابات كلها صح', async () => {
      const allCorrect = mockQuestions.map(q => ({ questionId: q.id, answer: q.correctIndex }));
      repository.updateAttemptScore.mockResolvedValue({ ...mockAttempt, score: 100 });
      const result = await service.submitQuiz('student-123', 'quiz-123', allCorrect);
      expect(result.score).toBe(100);
      expect(result.correct).toBe(3);
    });
  });
});