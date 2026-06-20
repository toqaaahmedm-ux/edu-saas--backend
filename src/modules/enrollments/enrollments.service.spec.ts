import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

const mockEnrollmentsRepository = {
  findByStudentAndCourse: jest.fn(),
  create: jest.fn(),
  findByStudentId: jest.fn(),
  findByCourseId: jest.fn(),
  findById: jest.fn(),
  updateProgress: jest.fn(),
  updateProgressAndStatus: jest.fn(),
};

const mockCoursesRepository = {
  findById: jest.fn(),
};

const mockNotificationsService = {
  createNotification: jest.fn().mockResolvedValue({}),
};

const mockCourse = {
  id: 'course-123',
  title: 'NestJS Course',
  status: 'PUBLISHED',
  price: 0,
  instructorId: 'teacher-123',
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
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('enroll', () => {
    it('يسجل الطالب في الكورس بنجاح', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockEnrollmentsRepository.findByStudentAndCourse.mockResolvedValue(null);
      mockEnrollmentsRepository.create.mockResolvedValue(mockEnrollment);
      const result = await service.enroll('tenant-123', 'student-123', 'course-123');
      expect(result).toEqual(mockEnrollment);
      expect(mockNotificationsService.createNotification).toHaveBeenCalled();
    });

    it('يرمي NotFoundException لو الكورس مش موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.enroll('tenant-123', 'student-123', 'course-123')).rejects.toThrow(NotFoundException);
    });

    it('يرمي BadRequestException لو الكورس مش PUBLISHED', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, status: 'DRAFT' });
      await expect(service.enroll('tenant-123', 'student-123', 'course-123')).rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو الكورس مدفوع', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, price: 100 });
      await expect(service.enroll('tenant-123', 'student-123', 'course-123')).rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو المدرس حاول يسجل في كورسه', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.enroll('tenant-123', 'teacher-123', 'course-123')).rejects.toThrow(BadRequestException);
    });

    it('يرمي ConflictException لو الطالب مسجل مسبقاً', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockEnrollmentsRepository.findByStudentAndCourse.mockResolvedValue(mockEnrollment);
      await expect(service.enroll('tenant-123', 'student-123', 'course-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('getMyEnrollments', () => {
    it('يرجع enrollments الطالب', async () => {
      mockEnrollmentsRepository.findByStudentId.mockResolvedValue([mockEnrollment]);
      const result = await service.getMyEnrollments('tenant-123', 'student-123');
      expect(result).toHaveLength(1);
    });
  });

  describe('getEnrollmentsByCourse', () => {
    it('يرجع enrollments الكورس', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockEnrollmentsRepository.findByCourseId.mockResolvedValue([mockEnrollment]);
      const result = await service.getEnrollmentsByCourse('tenant-123', 'course-123');
      expect(result).toHaveLength(1);
    });

    it('يرمي NotFoundException لو الكورس مش موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.getEnrollmentsByCourse('tenant-123', 'not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProgress', () => {
    it('يعدل الـ progress بنجاح', async () => {
      mockEnrollmentsRepository.findById.mockResolvedValue(mockEnrollment);
      mockEnrollmentsRepository.updateProgress.mockResolvedValue({ ...mockEnrollment, progress: 50 });
      const result = await service.updateProgress('enrollment-123', 'student-123', 50);
      expect(result.progress).toBe(50);
    });

    it('يحول الـ status لـ COMPLETED لو progress = 100', async () => {
      mockEnrollmentsRepository.findById.mockResolvedValue(mockEnrollment);
      mockEnrollmentsRepository.updateProgressAndStatus.mockResolvedValue({
        ...mockEnrollment, progress: 100, status: 'COMPLETED',
      });
      const result = await service.updateProgress('enrollment-123', 'student-123', 100);
      expect(result.status).toBe('COMPLETED');
    });

    it('يرمي BadRequestException لو progress خارج النطاق', async () => {
      await expect(service.updateProgress('enrollment-123', 'student-123', 101)).rejects.toThrow(BadRequestException);
      await expect(service.updateProgress('enrollment-123', 'student-123', -1)).rejects.toThrow(BadRequestException);
    });

    it('يرمي NotFoundException لو enrollment مش موجود', async () => {
      mockEnrollmentsRepository.findById.mockResolvedValue(null);
      await expect(service.updateProgress('not-found', 'student-123', 50)).rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو مش صاحب الـ enrollment', async () => {
      mockEnrollmentsRepository.findById.mockResolvedValue(mockEnrollment);
      await expect(service.updateProgress('enrollment-123', 'other-user', 50)).rejects.toThrow(ForbiddenException);
    });
  });
});