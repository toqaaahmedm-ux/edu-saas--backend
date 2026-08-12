import { Test, TestingModule } from '@nestjs/testing';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { CourseStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';

const mockCoursesService = {
  findAll: jest.fn(),
  findAllAdmin: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updateStatus: jest.fn(),
  archive: jest.fn(),
  delete: jest.fn(),
  findByInstructor: jest.fn(),
  getTeacherStats: jest.fn(),
  getTeacherStudents: jest.fn(),
  getAdminStats: jest.fn(),
};

const TENANT_ID = 'tenant-123';

const mockCourse = {
  id: 'course-123',
  tenantId: TENANT_ID,
  title: 'NestJS Course',
  description: 'Learn NestJS',
  instructorId: 'teacher-123',
  status: CourseStatus.DRAFT,
};

const mockUser = {
  id: 'teacher-123',
  tenantId: TENANT_ID,
  role: 'TEACHER',
};

// BE-C03: findAll and findOne now take tenantId from req.tenantId
// (set by TenantMiddleware), not from a query param or directly from the user.
// in the unit test, we set a mock request with tenantId manually since
// the middleware itself doesn't run here.
const mockReqWithTenant = { tenantId: TENANT_ID } as any;
const mockReqNoTenant = { tenantId: null } as any;

describe('CoursesController', () => {
  let controller: CoursesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CoursesController],
      providers: [{ provide: CoursesService, useValue: mockCoursesService }],
    })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .overrideGuard(FeatureGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CoursesController>(CoursesController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('يرجع كورسات مع pagination', async () => {
      mockCoursesService.findAll.mockResolvedValue({ courses: [mockCourse], meta: { total: 1 } });
      const result = await controller.findAll(mockReqWithTenant, '1', '10', undefined, undefined);
      expect(result.courses).toHaveLength(1);
      expect(mockCoursesService.findAll).toHaveBeenCalledWith(TENANT_ID, 1, 10, undefined, undefined, undefined);
    });

    // findAll isn't async — when the tenant context is missing it throws the error directly
    // (synchronously) before reaching any return Promise, so we use
    // expect(() => ...).toThrow instead of rejects.toThrow.
    it('يرمي BadRequestException لو مفيش tenant context', () => {
      expect(() => controller.findAll(mockReqNoTenant, '1', '10', undefined, undefined))
        .toThrow(BadRequestException);
      expect(mockCoursesService.findAll).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('يرجع كورس بالـ id لما يكون فيه tenant context', async () => {
      mockCoursesService.findById.mockResolvedValue(mockCourse);
      const result = await controller.findOne('course-123', mockReqWithTenant);
      expect(result).toEqual(mockCourse);
      expect(mockCoursesService.findById).toHaveBeenCalledWith('course-123', TENANT_ID);
    });

    // findOne also isn't async — same reason as above
    it('يرمي BadRequestException لو مفيش tenant context', () => {
      expect(() => controller.findOne('course-123', mockReqNoTenant))
        .toThrow(BadRequestException);
      expect(mockCoursesService.findById).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('ينشئ كورس جديد', async () => {
      mockCoursesService.create.mockResolvedValue(mockCourse);
      const result = await controller.create(mockUser, {
        title: 'NestJS Course',
        description: 'Learn NestJS',
      });
      expect(result).toEqual(mockCourse);
    });
  });

  describe('update', () => {
    it('يعدل الكورس ويبعت tenantId للـ service', async () => {
      mockCoursesService.update.mockResolvedValue({ ...mockCourse, title: 'Updated' });
      const result = await controller.update('course-123', mockUser, { title: 'Updated' });
      expect(result.title).toBe('Updated');
      expect(mockCoursesService.update).toHaveBeenCalledWith(
        'course-123', mockUser.id, mockUser.role, mockUser.tenantId, { title: 'Updated' },
      );
    });
  });

  describe('updateStatus', () => {
    it('يغير status الكورس ويبعت tenantId', async () => {
      mockCoursesService.updateStatus.mockResolvedValue({ ...mockCourse, status: CourseStatus.PUBLISHED });
      const result = await controller.updateStatus('course-123', mockUser, { status: 'PUBLISHED' });
      expect(result.status).toBe(CourseStatus.PUBLISHED);
      expect(mockCoursesService.updateStatus).toHaveBeenCalledWith('course-123', 'PUBLISHED', TENANT_ID);
    });
  });

  describe('archive', () => {
    it('يحول الكورس لـ ARCHIVED ويبعت tenantId', async () => {
      mockCoursesService.archive.mockResolvedValue({ ...mockCourse, status: CourseStatus.ARCHIVED });
      const result = await controller.archive('course-123', mockUser);
      expect(result.status).toBe(CourseStatus.ARCHIVED);
      expect(mockCoursesService.archive).toHaveBeenCalledWith('course-123', TENANT_ID);
    });
  });

  describe('delete', () => {
    it('يحذف الكورس ويبعت tenantId', async () => {
      mockCoursesService.delete.mockResolvedValue({ message: 'Course deleted successfully' });
      const result = await controller.delete('course-123', mockUser);
      expect(result.message).toBe('Course deleted successfully');
      expect(mockCoursesService.delete).toHaveBeenCalledWith('course-123', TENANT_ID);
    });
  });

  describe('getAdminStats', () => {
    it('يرجع إحصائيات الـ admin', async () => {
      mockCoursesService.getAdminStats.mockResolvedValue({ totalCourses: 10, totalStudents: 100, totalRevenue: 5000 });
      const result = await controller.getAdminStats(mockUser);
      expect(result.totalCourses).toBe(10);
    });
  });

  describe('getMyCourses', () => {
    it('يرجع كورسات المدرس', async () => {
      mockCoursesService.findByInstructor.mockResolvedValue([mockCourse]);
      const result = await controller.getMyCourses(mockUser);
      expect(result).toHaveLength(1);
    });
  });

  describe('getTeacherStats', () => {
    it('يرجع إحصائيات المدرس', async () => {
      mockCoursesService.getTeacherStats.mockResolvedValue({ totalStudents: 10, publishedCourses: 2 });
      const result = await controller.getTeacherStats(mockUser);
      expect(result.totalStudents).toBe(10);
    });
  });
});
