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

  async getMyCertificates(studentId: string) {
    return this.certificatesRepository.findByStudentId(studentId);
  }

  async findById(id: string) {
    const cert = await this.certificatesRepository.findById(id);
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  async create(
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
      studentId,
      courseId,
      ...data,
    });
  }

  // تصدر تلقائياً بعد نجاح الكويز (من quiz.service)
  async issueIfPassed(
    studentId: string,
    courseId: string,
    score: number,
    passingScore: number = 70, // BL-02: المعيار 70 مش 60
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
    if (existing) return existing; // already issued — silent skip

    return this.certificatesRepository.create({
      studentId,
      courseId,
      examName: 'General Exam',
      institutionName: 'EduSaaS',
      facultyName: 'Online Learning',
    });
  }
}