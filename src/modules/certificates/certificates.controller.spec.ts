jest.mock('puppeteer', () => ({}));
import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

const mockCertificatesService = {
  getMyCertificates: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
};

// mock the guards directly without needing their dependencies
const mockSessionAuthGuard = { canActivate: jest.fn(() => true) };
const mockRolesGuard       = { canActivate: jest.fn(() => true) };

const mockStudent = { id: 'student-123', tenantId: 'tenant-123', role: 'STUDENT' };
const mockAdmin   = { id: 'admin-123',   tenantId: 'tenant-123', role: 'ADMIN'   };

const mockCertificate = {
  id: 'cert-123',
  tenantId: 'tenant-123',
  studentId: 'student-123',
  courseId: 'course-123',
  examName: 'اختبار JavaScript',
  institutionName: 'EduSaaS',
  facultyName: 'Online Learning',
  issuedAt: new Date(),
};

describe('CertificatesController', () => {
  let controller: CertificatesController;
  let service: typeof mockCertificatesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertificatesController],
      providers: [
        { provide: CertificatesService, useValue: mockCertificatesService },
        { provide: SessionAuthGuard,    useValue: mockSessionAuthGuard    },
        { provide: RolesGuard,          useValue: mockRolesGuard          },
        Reflector,
      ],
    })
      .overrideGuard(SessionAuthGuard).useValue(mockSessionAuthGuard)
      .overrideGuard(RolesGuard).useValue(mockRolesGuard)
      .compile();

    controller = module.get<CertificatesController>(CertificatesController);
    service = mockCertificatesService;
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyCertificates', () => {
    it('يرجع شهادات الطالب', async () => {
      service.getMyCertificates.mockResolvedValue([mockCertificate]);
      const result = await controller.getMyCertificates(mockStudent);
      expect(result).toEqual([mockCertificate]);
      expect(service.getMyCertificates).toHaveBeenCalledWith('tenant-123', 'student-123');
    });

    it('يرجع array فاضية لو مفيش شهادات', async () => {
      service.getMyCertificates.mockResolvedValue([]);
      const result = await controller.getMyCertificates(mockStudent);
      expect(result).toEqual([]);
    });

    it('يبعت tenantId و studentId صح للـ service', async () => {
      service.getMyCertificates.mockResolvedValue([]);
      await controller.getMyCertificates(mockStudent);
      expect(service.getMyCertificates).toHaveBeenCalledWith(mockStudent.tenantId, mockStudent.id);
    });
  });

  describe('createMyCertificate', () => {
    it('يصدر شهادة للطالب بنجاح', async () => {
      service.create.mockResolvedValue(mockCertificate);
      const result = await controller.createMyCertificate(mockStudent, { courseId: 'course-123' });
      expect(result).toEqual(mockCertificate);
      expect(service.create).toHaveBeenCalledWith('tenant-123', 'student-123', 'course-123', {
        examName: 'General Exam',
        institutionName: 'EduSaaS',
        facultyName: 'Online Learning',
      });
    });

    it('يستخدم القيم الافتراضية لو مش بعت examName', async () => {
      service.create.mockResolvedValue(mockCertificate);
      await controller.createMyCertificate(mockStudent, { courseId: 'course-123' });
      expect(service.create).toHaveBeenCalledWith(
        'tenant-123', 'student-123', 'course-123',
        expect.objectContaining({ examName: 'General Exam' }),
      );
    });

    it('يرمي ForbiddenException لو الطالب مش مسجل', async () => {
      service.create.mockRejectedValue(new ForbiddenException('Not enrolled'));
      await expect(controller.createMyCertificate(mockStudent, { courseId: 'course-123' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو الـ progress أقل من 100%', async () => {
      service.create.mockRejectedValue(new BadRequestException('Course not completed'));
      await expect(controller.createMyCertificate(mockStudent, { courseId: 'course-123' }))
        .rejects.toThrow(BadRequestException);
    });

    it('يرمي ConflictException لو الشهادة اتصدرت قبل كده', async () => {
      service.create.mockRejectedValue(new ConflictException('Certificate already issued'));
      await expect(controller.createMyCertificate(mockStudent, { courseId: 'course-123' }))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('findOne', () => {
    // BE-C05: findOne now requires a user (from SessionAuthGuard) and passes it
    // to the service to verify ownership. The student themselves can view their own certificate.
    it('يرجع الشهادة لو الطالب صاحبها', async () => {
      service.findById.mockResolvedValue(mockCertificate);
      const result = await controller.findOne('cert-123', mockStudent);
      expect(result).toEqual(mockCertificate);
      expect(service.findById).toHaveBeenCalledWith(
        'cert-123', mockStudent.tenantId, mockStudent.id, mockStudent.role,
      );
    });

    it('يرجع الشهادة لو ADMIN في نفس المستأجر', async () => {
      service.findById.mockResolvedValue(mockCertificate);
      const result = await controller.findOne('cert-123', mockAdmin);
      expect(result).toEqual(mockCertificate);
      expect(service.findById).toHaveBeenCalledWith(
        'cert-123', mockAdmin.tenantId, mockAdmin.id, mockAdmin.role,
      );
    });

    it('يرمي NotFoundException لو الشهادة مش موجودة', async () => {
      service.findById.mockRejectedValue(new NotFoundException('Certificate not found'));
      await expect(controller.findOne('wrong-id', mockStudent)).rejects.toThrow(NotFoundException);
    });

    // BE-C05: if the certificate belongs to a different tenant, the service throws NotFoundException
    // (not ForbiddenException) so we don't leak that it exists for another tenant.
    it('يرمي NotFoundException لو الشهادة تبع مستأجر تاني', async () => {
      service.findById.mockRejectedValue(new NotFoundException('Certificate not found'));
      const otherTenantStudent = { id: 'student-999', tenantId: 'other-tenant', role: 'STUDENT' };
      await expect(controller.findOne('cert-123', otherTenantStudent)).rejects.toThrow(NotFoundException);
    });

    // BE-C05: a different student (not the certificate owner) in the same tenant, and not admin/teacher.
    it('يرمي ForbiddenException لو طالب تاني مش صاحب الشهادة', async () => {
      service.findById.mockRejectedValue(new ForbiddenException('You do not have access to this certificate'));
      const otherStudent = { id: 'other-student', tenantId: 'tenant-123', role: 'STUDENT' };
      await expect(controller.findOne('cert-123', otherStudent)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create (Admin/Teacher)', () => {
    const body = {
      studentId: 'student-123',
      courseId: 'course-123',
      examName: 'اختبار JavaScript',
      institutionName: 'EduSaaS',
      facultyName: 'Online Learning',
    };

    it('يصدر شهادة لطالب بنجاح', async () => {
      service.create.mockResolvedValue(mockCertificate);
      const result = await controller.create(mockAdmin, body);
      expect(result).toEqual(mockCertificate);
      expect(service.create).toHaveBeenCalledWith('tenant-123', 'student-123', 'course-123', {
        examName: 'اختبار JavaScript',
        institutionName: 'EduSaaS',
        facultyName: 'Online Learning',
      });
    });

    it('يبعت tenantId من الـ admin مش من الـ body', async () => {
      service.create.mockResolvedValue(mockCertificate);
      await controller.create(mockAdmin, body);
      expect(service.create).toHaveBeenCalledWith(
        mockAdmin.tenantId, 'student-123', 'course-123', expect.any(Object),
      );
    });

    it('يرمي ConflictException لو الشهادة اتصدرت قبل كده', async () => {
      service.create.mockRejectedValue(new ConflictException('Certificate already issued'));
      await expect(controller.create(mockAdmin, body)).rejects.toThrow(ConflictException);
    });
  });
});