import { Test, TestingModule } from '@nestjs/testing';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { Reflector } from '@nestjs/core';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

const mockQuizService = {
  getAllQuizzes: jest.fn(),
  getQuizWithQuestions: jest.fn(),
  startQuiz: jest.fn(),
  submitQuiz: jest.fn(),
};

const mockSessionAuthGuard = { canActivate: jest.fn(() => true) };

const mockUser = { id: 'student-123', tenantId: 'tenant-123', role: 'STUDENT' };

const mockQuiz   = { id: 'quiz-123', title: 'اختبار JavaScript', timeLimit: 600, courseId: 'course-123' };
const mockAttempt = { attemptId: 'attempt-123', startedAt: new Date() };
const mockAnswers = [{ questionId: 'q1', answer: 2 }, { questionId: 'q2', answer: 1 }];

describe('QuizController', () => {
  let controller: QuizController;
  let service: typeof mockQuizService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuizController],
      providers: [
        { provide: QuizService,        useValue: mockQuizService        },
        { provide: SessionAuthGuard,   useValue: mockSessionAuthGuard   },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useValue(mockSessionAuthGuard)
      .compile();

    controller = module.get<QuizController>(QuizController);
    service = mockQuizService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getAllQuizzes', () => {
    it('يرجع كل الكويزات بتاعة الـ tenant', async () => {
      service.getAllQuizzes.mockResolvedValue([mockQuiz]);
      const result = await controller.getAllQuizzes(mockUser);
      expect(result).toEqual([mockQuiz]);
      expect(service.getAllQuizzes).toHaveBeenCalledWith('tenant-123');
    });

    it('يرجع array فاضية لو مفيش كويزات', async () => {
      service.getAllQuizzes.mockResolvedValue([]);
      const result = await controller.getAllQuizzes(mockUser);
      expect(result).toEqual([]);
    });
  });

  describe('getQuiz', () => {
    it('يرجع الكويز مع الأسئلة', async () => {
      service.getQuizWithQuestions.mockResolvedValue(mockQuiz);
      const result = await controller.getQuiz('quiz-123', mockUser);
      expect(result).toEqual(mockQuiz);
      // make sure tenantId was sent too (multi-tenant isolation fix)
      expect(service.getQuizWithQuestions).toHaveBeenCalledWith('quiz-123', mockUser.tenantId);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      service.getQuizWithQuestions.mockRejectedValue(new NotFoundException('Quiz not found'));
      await expect(controller.getQuiz('wrong-id', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('startQuiz', () => {
    it('يبدأ الكويز ويرجع attemptId', async () => {
      service.startQuiz.mockResolvedValue(mockAttempt);
      const result = await controller.startQuiz('quiz-123', mockUser);
      expect(result).toEqual(mockAttempt);
      expect(service.startQuiz).toHaveBeenCalledWith('tenant-123', 'student-123', 'quiz-123');
    });

    it('يبعت tenantId و userId و quizId صح للـ service', async () => {
      service.startQuiz.mockResolvedValue(mockAttempt);
      await controller.startQuiz('quiz-123', mockUser);
      expect(service.startQuiz).toHaveBeenCalledWith(mockUser.tenantId, mockUser.id, 'quiz-123');
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل', async () => {
      service.startQuiz.mockRejectedValue(new ForbiddenException('Not enrolled'));
      await expect(controller.startQuiz('quiz-123', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('يرمي ForbiddenException لو الطالب خلص الكويز قبل كده', async () => {
      service.startQuiz.mockRejectedValue(new ForbiddenException('Already completed'));
      await expect(controller.startQuiz('quiz-123', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('يرمي NotFoundException لو الكويز مش موجود', async () => {
      service.startQuiz.mockRejectedValue(new NotFoundException('Quiz not found'));
      await expect(controller.startQuiz('wrong-id', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitQuiz', () => {
    it('يسلم الكويز ويرجع النتيجة', async () => {
      const mockResult = { score: 80, correct: 2, total: 2, passed: true, certificate: null };
      service.submitQuiz.mockResolvedValue(mockResult);
      const result = await controller.submitQuiz('quiz-123', mockUser, { answers: mockAnswers });
      expect(result).toEqual(mockResult);
      expect(service.submitQuiz).toHaveBeenCalledWith('tenant-123', 'student-123', 'quiz-123', mockAnswers);
    });

    it('يبعت tenantId و userId و quizId و answers صح للـ service', async () => {
      service.submitQuiz.mockResolvedValue({ score: 100, passed: true });
      await controller.submitQuiz('quiz-123', mockUser, { answers: mockAnswers });
      expect(service.submitQuiz).toHaveBeenCalledWith(mockUser.tenantId, mockUser.id, 'quiz-123', mockAnswers);
    });

    it('يرمي BadRequestException لو الـ answers فاضية', async () => {
      service.submitQuiz.mockRejectedValue(new BadRequestException('No answers submitted'));
      await expect(controller.submitQuiz('quiz-123', mockUser, { answers: [] }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو الوقت عدى', async () => {
      service.submitQuiz.mockRejectedValue(new BadRequestException('Quiz time limit exceeded'));
      await expect(controller.submitQuiz('quiz-123', mockUser, { answers: mockAnswers }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرجع passed: false لو النتيجة أقل من 70%', async () => {
      service.submitQuiz.mockResolvedValue({ score: 50, correct: 1, total: 2, passed: false, certificate: null });
      const result = await controller.submitQuiz('quiz-123', mockUser, { answers: mockAnswers });
      expect(result.passed).toBe(false);
    });

    it('يرجع certificate لو النتيجة >= 70%', async () => {
      const mockCert = { id: 'cert-123' };
      service.submitQuiz.mockResolvedValue({ score: 80, passed: true, certificate: mockCert });
      const result = await controller.submitQuiz('quiz-123', mockUser, { answers: mockAnswers });
      expect(result.certificate).toEqual(mockCert);
    });
  });
});