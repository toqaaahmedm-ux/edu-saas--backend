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

  // BE-C05 FIX: قبل كده findById كانت بترجع أي شهادة بالـ id من غير أي
  // تحقق — أي مستخدم مصادق (وحتى endpoint مكشوف بدون auth خالص) كان
  // يقدر يشوف بيانات شخصية لطالب تاني (اسم، إيميل، اسم الكورس...).
  // دلوقتي بنتحقق من حاجتين بالترتيب:
  //  1. الشهادة تبع نفس المستأجر (tenantId) — لو لأ نرمي NotFoundException
  //     بدل ForbiddenException عشان منكشفش إن الشهادة موجودة عند مستأجر تاني.
  //  2. صاحب الطلب هو الطالب نفسه، أو ADMIN/TEACHER في نفس المستأجر —
  //     غير ذلك نرمي ForbiddenException.
  async findById(
    id: string,
    tenantId: string,
    requestUserId: string,
    requestUserRole: string,
  ) {
    const cert = await this.certificatesRepository.findById(id);
    if (!cert || cert.tenantId !== tenantId) {
      throw new NotFoundException('Certificate not found');
    }

    const isOwner = cert.studentId === requestUserId;
    const isStaff = requestUserRole === 'ADMIN' || requestUserRole === 'TEACHER';
    if (!isOwner && !isStaff) {
      throw new ForbiddenException('You do not have access to this certificate');
    }

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