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

// ملحوظة: الكود الحقيقي بقى بياخد PrismaService في الـ constructor —
// بيستخدمها مباشرة في getTeacherStats() (quiz.count) و
// getTeacherAnalytics() (quizAttempt.findMany). الميثودز اللي إحنا
// بنتستهم هنا مش بيلمسوا الجزء ده، لكن NestJS لازم يقدر يبني الكلاس
// كامل وقت compile()، فلازم نوفر mock حتى لو مش هنستخدمه في كل تست.
const mockPrismaService = {
  quiz: {
    count: jest.fn(),
  },
  quizAttempt: {
    findMany: jest.fn(),
  },
};

const mockCourse = {
  id: 'course-123',
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
      const result = await service.findAll('tenant-123', 1, 10);
      expect(result.courses).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });
  });

  describe('findById', () => {
    it('يرجع كورس لو موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      const result = await service.findById('course-123');
      expect(result).toEqual(mockCourse);
    });

    it('يرمي NotFoundException لو مش موجود', async () => {
      mockCoursesRepository.findById.mockResolvedValue(null);
      await expect(service.findById('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('ينشئ كورس بنجاح', async () => {
      mockCoursesRepository.create.mockResolvedValue(mockCourse);
      const result = await service.create({
        tenantId: 'tenant-123',
        title: 'NestJS Course',
        description: 'Learn NestJS',
        instructorId: 'teacher-123',
      });
      expect(result).toEqual(mockCourse);
    });

    it('يرمي BadRequestException لو title فاضي', async () => {
      await expect(service.create({ tenantId: 'tenant-123', title: '', description: 'desc', instructorId: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو description فاضي', async () => {
      await expect(service.create({ tenantId: 'tenant-123', title: 'title', description: '', instructorId: 'x' }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو price سالب', async () => {
      await expect(service.create({ tenantId: 'tenant-123', title: 'title', description: 'desc', instructorId: 'x', price: -1 }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('يعدل الكورس لو الـ owner', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.update.mockResolvedValue({ ...mockCourse, title: 'Updated' });
      const result = await service.update('course-123', 'teacher-123', 'TEACHER', { title: 'Updated' });
      expect(result.title).toBe('Updated');
    });

    it('يعدل الكورس لو ADMIN', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.update.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'admin-999', 'ADMIN', {})).resolves.toBeDefined();
    });

    it('يرمي ForbiddenException لو مش الـ owner', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'other-user', 'TEACHER', {}))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو price سالب', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      await expect(service.update('course-123', 'teacher-123', 'TEACHER', { price: -1 }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('يحذف كورس DRAFT بدون طلاب', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.delete.mockResolvedValue(undefined);
      const result = await service.delete('course-123');
      expect(result).toEqual({ message: 'Course deleted successfully' });
    });

    it('يرمي BadRequestException لو الكورس PUBLISHED', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, status: CourseStatus.PUBLISHED });
      await expect(service.delete('course-123')).rejects.toThrow(BadRequestException);
    });

    it('يرمي BadRequestException لو عنده طلاب', async () => {
      mockCoursesRepository.findById.mockResolvedValue({ ...mockCourse, _count: { enrollments: 5 } });
      await expect(service.delete('course-123')).rejects.toThrow(BadRequestException);
    });
  });

  describe('archive', () => {
    it('يحول الكورس لـ ARCHIVED', async () => {
      mockCoursesRepository.findById.mockResolvedValue(mockCourse);
      mockCoursesRepository.updateStatus.mockResolvedValue({ ...mockCourse, status: CourseStatus.ARCHIVED });
      const result = await service.archive('course-123');
      expect(result.status).toBe(CourseStatus.ARCHIVED);
    });
  });

  describe('getAdminStats', () => {
    it('يرجع إحصائيات الـ admin', async () => {
      mockCoursesRepository.countAll.mockResolvedValue(10);
      mockCoursesRepository.countStudents.mockResolvedValue(100);
      mockCoursesRepository.sumRevenue.mockResolvedValue(5000);
      const result = await service.getAdminStats('tenant-123');
      expect(result).toEqual({ totalCourses: 10, totalStudents: 100, totalRevenue: 5000 });
    });
  });
});