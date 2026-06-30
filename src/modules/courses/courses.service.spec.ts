import { Test, TestingModule } from '@nestjs/testing';
import { CoursesService } from './courses.service';
import { CoursesRepository } from './courses.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { CourseStatus } from '@prisma/client';

const mockCoursesRepository = {
  findAllPaginated: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  delete: jest.fn(),
  findByInstructor: jest.fn(),
  getStudentsByCoursesPaginated: jest.fn(),
  countAll: jest.fn(),
  countStudents: jest.fn(),
  sumRevenue: jest.fn(),
};

const mockPrismaService = {
  quiz: {
    count: jest.fn(),
  },
  quizAttempt: {
    findMany: jest.fn(),
  },
};

const TENANT_ID = 'tenant-123';

const mockCourse = {
  id: 'course-123',
  tenantId: TENANT_ID,
  title: 'NestJS Course',
  description: 'Learn NestJS',
  instructorId: 'teacher-123',
  status: CourseStatus.DRAFT,
  price: 100,
  category: 'Programming',
  thumbnail: null,
  _count: { enrollments: 0 },
};

describe('CoursesService', () => {
  let service: CoursesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: CoursesRepository, useValue: mockCoursesRepository },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('يرجع كورسات مع meta', async () => {
      mockCoursesRepository.findAllPaginated.mockResolvedValue({ courses: [mockCourse], total: 1 });
      const result = await service.findAll(TENANT_ID, 1, 10);
      expect(result.courses).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });
  });

  describe('findById', () => {
    it('يرجع كورس لو موجود وتبع نفس المستأجر', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      const result = await service.findById('course-123', TENANT_ID);
      expect(result).toEqual(mockCourse);
      expect(mockCoursesRepository.findById).toHaveBeenCalledWith('course-123', TENANT_ID);
    });

    it('يرمي NotFoundException لو مش موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('not-found', TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    // BE-C03: لو الكورس موجود فعلاً لكن تبع مستأجر تاني، الـ repository
    // (بفلتر tenantId في WHERE) هيرجع null، فالـ service يرمي نفس
    // NotFoundException — بدون ما يكشف إن الكورس موجود أصلاً عند مستأجر آخر.
    it('يرمي NotFoundException لو الكورس تبع مستأجر تاني', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('course-123', 'other-tenant')).rejects.toThrow(NotFoundException);
      expect(mockCoursesRepository.findById).toHaveBeenCalledWith('course-123', 'other-tenant');
    });
  });

  describe('create', () => {
    it('ينشئ كورس بنجاح', async () => {
      mockCoursesRepository.create.mockResolvedValue(mockCourse);
      const result = await service.create({
        tenantId: TENANT_ID,
        title: 'NestJS Course',
        description: 'Learn NestJS',
        instructorId: 'teacher-123',
      });
      expect(result).toEqual(mockCourse);
    });

    it('يرمي BadRequestException لو title فاضي', async () => {
      await expect(service.create({ tenantId: TENANT_ID, title: '', description: 'desc', instructorId: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو description فاضي', async () => {
      await expect(service.create({ tenantId: TENANT_ID, title: 'title', description: '', instructorId: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو price سالب', async () => {
      await expect(service.create({ tenantId: TENANT_ID, title: 'title', description: 'desc', instructorId: 'x', price: -1 }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('يعدل الكورس لو الـ owner ونفس المستأجر', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.update.mockResolvedValue({ ...mockCourse, title: 'Updated' });
      const result = await service.update('course-123', 'teacher-123', 'TEACHER', TENANT_ID, { title: 'Updated' });
      expect(result.title).toBe('Updated');
      expect(mockCoursesRepository.update).toHaveBeenCalledWith('course-123', { title: 'Updated' }, TENANT_ID);
    });

    it('يعدل الكورس لو ADMIN', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.update.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'admin-999', 'ADMIN', TENANT_ID, {})).resolves.toBeDefined();
    });

    it('يرمي ForbiddenException لو مش الـ owner', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'other-user', 'TEACHER', TENANT_ID, {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو price سالب', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'teacher-123', 'TEACHER', TENANT_ID, { price: -1 }))
        .rejects.toThrow(BadRequestException);
    });

    // BE-C04: لو الـ admin بعت tenantId مختلف عن tenant الكورس، findById
    // هيرمي NotFoundException قبل ما نوصل لفحص الملكية خالص.
    it('يرمي NotFoundException لو الكورس تبع مستأجر تاني', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.update('course-123', 'admin-999', 'ADMIN', 'other-tenant', { title: 'x' }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('يحذف كورس DRAFT بدون طلاب', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.delete.mockResolvedValue(undefined);
      const result = await service.delete('course-123', TENANT_ID);
      expect(result).toEqual({ message: 'Course deleted successfully' });
      expect(mockCoursesRepository.delete).toHaveBeenCalledWith('course-123', TENANT_ID);
    });

    it('يرمي BadRequestException لو الكورس PUBLISHED', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, status: CourseStatus.PUBLISHED });
      await expect(service.delete('course-123', TENANT_ID)).rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو عنده طلاب', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, _count: { enrollments: 5 } });
      await expect(service.delete('course-123', TENANT_ID)).rejects.toThrow(BadRequestException);
    });

    it('يرمي NotFoundException لو الكورس تبع مستأجر تاني', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.delete('course-123', 'other-tenant')).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('يحول الكورس لـ ARCHIVED', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.updateStatus.mockResolvedValue({ ...mockCourse, status: CourseStatus.ARCHIVED });
      const result = await service.archive('course-123', TENANT_ID);
      expect(result.status).toBe(CourseStatus.ARCHIVED);
      expect(mockCoursesRepository.updateStatus).toHaveBeenCalledWith('course-123', CourseStatus.ARCHIVED, TENANT_ID);
    });

    it('يرمي NotFoundException لو الكورس تبع مستأجر تاني', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.archive('course-123', 'other-tenant')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAdminStats', () => {
    it('يرجع إحصائيات الـ admin', async () => {
      mockCoursesRepository.countAll.mockResolvedValue(10);
      mockCoursesRepository.countStudents.mockResolvedValue(100);
      mockCoursesRepository.sumRevenue.mockResolvedValue(5000);
      const result = await service.getAdminStats(TENANT_ID);
      expect(result).toEqual({ totalCourses: 10, totalStudents: 100, totalRevenue: 5000 });
    });
  });
});