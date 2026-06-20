import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsService } from './enrollments.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { Reflector } from '@nestjs/core';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

const mockEnrollmentsService = {
  enroll: jest.fn(),
  getMyEnrollments: jest.fn(),
  getEnrollmentsByCourse: jest.fn(),
};

const mockSessionAuthGuard = { canActivate: jest.fn(() => true) };

const mockReq = {
  user: { id: 'student-123', tenantId: 'tenant-123', role: 'STUDENT' },
};

const mockEnrollment = {
  id: 'enrollment-123',
  tenantId: 'tenant-123',
  studentId: 'student-123',
  courseId: 'course-123',
  progress: 0,
  status: 'ACTIVE',
  enrolledAt: new Date(),
};

describe('EnrollmentsController', () => {
  let controller: EnrollmentsController;
  let service: typeof mockEnrollmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnrollmentsController],
      providers: [
        { provide: EnrollmentsService, useValue: mockEnrollmentsService },
        { provide: SessionAuthGuard,   useValue: mockSessionAuthGuard   },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useValue(mockSessionAuthGuard)
      .compile();

    controller = module.get<EnrollmentsController>(EnrollmentsController);
    service = mockEnrollmentsService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('enroll', () => {
    it('يسجل الطالب في الكورس بنجاح', async () => {
      service.enroll.mockResolvedValue(mockEnrollment);
      const result = await controller.enroll(mockReq, { courseId: 'course-123' });
      expect(result).toEqual(mockEnrollment);
      expect(service.enroll).toHaveBeenCalledWith('tenant-123', 'student-123', 'course-123');
    });

    it('يبعت tenantId و studentId صح للـ service', async () => {
      service.enroll.mockResolvedValue(mockEnrollment);
      await controller.enroll(mockReq, { courseId: 'course-123' });
      expect(service.enroll).toHaveBeenCalledWith(mockReq.user.tenantId, mockReq.user.id, 'course-123');
    });

    it('يرمي ConflictException لو الطالب مسجل قبل كده', async () => {
      service.enroll.mockRejectedValue(new ConflictException('Already enrolled'));
      await expect(controller.enroll(mockReq, { courseId: 'course-123' }))
        .rejects.toThrow(ConflictException);
    });

    it('يرمي BadRequestException لو الكورس مش PUBLISHED', async () => {
      service.enroll.mockRejectedValue(new BadRequestException('Course is not available'));
      await expect(controller.enroll(mockReq, { courseId: 'course-123' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('getMyEnrollments', () => {
    it('يرجع enrollments الطالب', async () => {
      service.getMyEnrollments.mockResolvedValue([mockEnrollment]);
      const result = await controller.getMyEnrollments(mockReq);
      expect(result).toEqual([mockEnrollment]);
      expect(service.getMyEnrollments).toHaveBeenCalledWith('tenant-123', 'student-123');
    });

    it('يرجع array فاضية لو مفيش enrollments', async () => {
      service.getMyEnrollments.mockResolvedValue([]);
      const result = await controller.getMyEnrollments(mockReq);
      expect(result).toEqual([]);
    });

    it('يبعت tenantId و studentId صح للـ service', async () => {
      service.getMyEnrollments.mockResolvedValue([]);
      await controller.getMyEnrollments(mockReq);
      expect(service.getMyEnrollments).toHaveBeenCalledWith(mockReq.user.tenantId, mockReq.user.id);
    });
  });

  describe('getEnrollmentsByCourse', () => {
    it('يرجع enrollments الكورس', async () => {
      service.getEnrollmentsByCourse.mockResolvedValue([mockEnrollment]);
      const result = await controller.getEnrollmentsByCourse('course-123', mockReq);
      expect(result).toEqual([mockEnrollment]);
      expect(service.getEnrollmentsByCourse).toHaveBeenCalledWith('tenant-123', 'course-123');
    });

    it('يرمي NotFoundException لو الكورس مش موجود', async () => {
      service.getEnrollmentsByCourse.mockRejectedValue(new NotFoundException('Course not found'));
      await expect(controller.getEnrollmentsByCourse('wrong-id', mockReq))
        .rejects.toThrow(NotFoundException);
    });

    it('يبعت tenantId و courseId صح للـ service', async () => {
      service.getEnrollmentsByCourse.mockResolvedValue([]);
      await controller.getEnrollmentsByCourse('course-123', mockReq);
      expect(service.getEnrollmentsByCourse).toHaveBeenCalledWith(mockReq.user.tenantId, 'course-123');
    });
  });
});