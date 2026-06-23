import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CertificatesRepository } from './certificates.repository';
import { PrismaService } from '../../prisma/prisma.service';

// FIX #24: قاعدة واحدة مركزية للإصدار — نجاح الكويز + اكتمال الكورس
const PASSING_SCORE = 70;
const REQUIRED_PROGRESS = 100;

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

  // FIX #24: helper مشترك للتحقق من الشروط
  private async assertEligible(studentId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in the course to get a certificate');
    }
    // FIX #24: نفس الـ threshold في المسارين
    if (enrollment.progress < REQUIRED_PROGRESS) {
      throw new BadRequestException(
        `Course not completed — progress must reach ${REQUIRED_PROGRESS}%`,
      );
    }
    return enrollment;
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
    // FIX #24: استخدام الـ helper المشترك
    await this.assertEligible(studentId, courseId);

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

  async issueIfPassed(
    tenantId: string,
    studentId: string,
    courseId: string,
    score: number,
    passingScore: number = PASSING_SCORE,
  ) {
    if (score < passingScore) return null;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) return null;

    // FIX #24: الإصدار التلقائي بيتحقق من التقدم زي الإصدار اليدوي
    if (enrollment.progress < REQUIRED_PROGRESS) return null;

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