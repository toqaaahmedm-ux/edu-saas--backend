import { Test, TestingModule } from '@nestjs/testing';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { CertificatesRepository } from './certificates.repository';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const mockCertificatesService = {
  getMyCertificates: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
};

const mockUser = { id: 'student-123', role: 'STUDENT' };
const mockCertificate = {
  id: 'cert-123',
  studentId: 'student-123',
  courseId: 'course-123',
  issuedAt: new Date(),
};

describe('CertificatesController', () => {
  let controller: CertificatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertificatesController],
      providers: [
        { provide: CertificatesService, useValue: mockCertificatesService },
        { provide: CertificatesRepository, useValue: {} },
      ],
    })
      .overrideGuard(SessionAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CertificatesController>(CertificatesController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyCertificates', () => {
    it('يرجع شهادات الطالب', async () => {
      mockCertificatesService.getMyCertificates.mockResolvedValue([mockCertificate]);
      const result = await controller.getMyCertificates(mockUser);
      expect(result).toEqual([mockCertificate]);
      expect(mockCertificatesService.getMyCertificates).toHaveBeenCalledWith('student-123');
    });

    it('يرجع array فاضية لو مفيش شهادات', async () => {
      mockCertificatesService.getMyCertificates.mockResolvedValue([]);
      const result = await controller.getMyCertificates(mockUser);
      expect(result).toEqual([]);
    });
  });

  describe('createMyCertificate', () => {
    it('ينشئ شهادة جديدة للطالب بالقيم الافتراضية', async () => {
      mockCertificatesService.create.mockResolvedValue(mockCertificate);
      const body = { courseId: 'course-123' };
      const result = await controller.createMyCertificate(mockUser, body);
      expect(result).toEqual(mockCertificate);
      expect(mockCertificatesService.create).toHaveBeenCalledWith(
        'student-123', 'course-123',
        { examName: 'General Exam', institutionName: 'EduSaaS', facultyName: 'Online Learning' },
      );
    });

    it('يستخدم القيم المرسلة لو موجودة', async () => {
      mockCertificatesService.create.mockResolvedValue(mockCertificate);
      const body = { courseId: 'course-123', examName: 'JS Exam', institutionName: 'Ain Shams', facultyName: 'Faculty of CS' };
      await controller.createMyCertificate(mockUser, body);
      expect(mockCertificatesService.create).toHaveBeenCalledWith(
        'student-123', 'course-123',
        { examName: 'JS Exam', institutionName: 'Ain Shams', facultyName: 'Faculty of CS' },
      );
    });
  });

  describe('findOne', () => {
    it('يرجع شهادة بالـ id', async () => {
      mockCertificatesService.findById.mockResolvedValue(mockCertificate);
      const result = await controller.findOne('cert-123');
      expect(result).toEqual(mockCertificate);
      expect(mockCertificatesService.findById).toHaveBeenCalledWith('cert-123');
    });
  });

  describe('create (Admin/Teacher)', () => {
    it('ينشئ شهادة لأي طالب', async () => {
      mockCertificatesService.create.mockResolvedValue(mockCertificate);
      const body = { studentId: 'student-456', courseId: 'course-123', examName: 'Final Exam', institutionName: 'EduSaaS', facultyName: 'Online' };
      const adminUser = { id: 'admin-123', role: 'ADMIN' };
      const result = await controller.create(adminUser, body);
      expect(result).toEqual(mockCertificate);
      expect(mockCertificatesService.create).toHaveBeenCalledWith(
        'student-456', 'course-123',
        { examName: 'Final Exam', institutionName: 'EduSaaS', facultyName: 'Online' },
      );
    });
  });
});