import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CertificatesRepository } from './certificates.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly certificatesRepository: CertificatesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getMyCertificates(tenantId: string, studentId: string) {
    return this.certificatesRepository.findByStudentId(tenantId, studentId);
  }

  async findById(id: string) {
    const cert = await this.certificatesRepository.findById(id);
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  async create(
    tenantId: string,
    studentId: string,
    courseId: string,
    data: {
      examName: string;
      institutionName: string;
      facultyName: string;
    },
  ) {
    // BL-03: التحقق من التسجيل في الكورس
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to get a certificate');
    }

    // BL-03: التحقق من إكمال الكورس (progress = 100)
    if (enrollment.progress < 100) {
      throw new BadRequestException('Course not completed — progress must reach 100%');
    }

    const existing = await this.certificatesRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) throw new ConflictException('Certificate already issued');

    return this.certificatesRepository.create({
      tenantId,
      studentId,
      courseId,
      ...data,
    });
  }

  // تصدر تلقائياً بعد نجاح الكويز
  async issueIfPassed(
    tenantId: string,
    studentId: string,
    courseId: string,
    score: number,
    passingScore: number = 70,
  ) {
    if (score < passingScore) return null;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) return null;

    const existing = await this.certificatesRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) return existing;

    return this.certificatesRepository.create({
      tenantId,
      studentId,
      courseId,
      examName: 'General Exam',
      institutionName: 'EduSaaS',
      facultyName: 'Online Learning',
    });
  }
}