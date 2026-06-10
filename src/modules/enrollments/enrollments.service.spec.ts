import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

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

// BL-01: الكورس لازم يكون PUBLISHED وسعره 0 عشان التسجيل يشتغل
const mockCourse = {
  id: 'course-123',
  title: 'JavaScript Course',
  instructorId: 'teacher-123',
  status: 'PUBLISHED',  // ← مطلوب للـ BL-01 check
  price: 0,             // ← مطلوب للـ BL-01 check
};

const mockEnrollment = {
  id: 'enrollment-123',
  studentId: 'student-123',
  courseId: 'course-123',
  progress: 0,
  status: 'ACTIVE',
};

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
    mockNotificationsService.createNotification.mockResolvedValue({});
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

    // BL-01: tests جديدة للـ checks اللي أضفناها
    it('يرمي BadRequestException لو الكورس مش PUBLISHED', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, status: 'DRAFT' });
      await expect(service.enroll('student-123', 'course-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو الكورس مدفوع', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, price: 99.99 });
      await expect(service.enroll('student-123', 'course-123'))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو المعلم بيسجل في كورسه', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.enroll('teacher-123', 'course-123'))
        .rejects.toThrow(BadRequestException);
    });
  });
});