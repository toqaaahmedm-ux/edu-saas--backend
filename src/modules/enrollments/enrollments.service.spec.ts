import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

// ── Mock Repositories ─────────────────────────────────────────────────────────
const mockEnrollmentsRepository = {
  findByStudentAndCourse: jest.fn(),
  create: jest.fn(),
  findByStudentId: jest.fn(),
  findByCourseId: jest.fn(),
  findById: jest.fn(),
  updateProgress: jest.fn(),
};

const mockCoursesRepository = {
  findById: jest.fn(),
};

const mockNotificationsService = {
  createNotification: jest.fn().mockResolvedValue({}),
};

// ── Test Data ─────────────────────────────────────────────────────────────────
const mockCourse = {
  id: 'course-123',
  title: 'JavaScript Course',
  instructorId: 'teacher-123',
};

const mockEnrollment = {
  id: 'enrollment-123',
  studentId: 'student-123',
  courseId: 'course-123',
  progress: 0,
  status: 'ACTIVE',
};

// ── Test Suite ────────────────────────────────────────────────────────────────
describe('EnrollmentsService', () => {
  let service: EnrollmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: EnrollmentsRepository, useValue: mockEnrollmentsRepository },
        { provide: CoursesRepository, useValue: mockCoursesRepository },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enroll', () => {
    it('يسجل الطالب في الكورس', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockEnrollmentsRepository.findByStudentAndCourse.mockResolvedValue(null);
      mockEnrollmentsRepository.create.mockResolvedValue(mockEnrollment);

      const result = await service.enroll('student-123', 'course-123');

      expect(result).toEqual(mockEnrollment);
      expect(mockNotificationsService.createNotification).toHaveBeenCalled();
    });

    it('يرمي NotFoundException لو الكورس مش موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.enroll('student-123', 'wrong-id'))
        .rejects.toThrow(NotFoundException);
    });

    it('يرمي ConflictException لو الطالب مسجل بالفعل', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockEnrollmentsRepository.findByStudentAndCourse.mockResolvedValue(mockEnrollment);
      await expect(service.enroll('student-123', 'course-123'))
        .rejects.toThrow(ConflictException);
    });
  });
});