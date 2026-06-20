import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByStudentId(tenantId: string, studentId: string) {
    return this.prisma.certificate.findMany({
      where: { tenantId, studentId },
      include: {
        course: { select: { id: true, title: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.certificate.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        student: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async findByStudentAndCourse(studentId: string, courseId: string) {
    return this.prisma.certificate.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
  }

  async create(data: {
    tenantId: string;
    studentId: string;
    courseId: string;
    examName: string;
    institutionName: string;
    facultyName: string;
  }) {
    return this.prisma.certificate.create({
      data: {
        tenantId:        data.tenantId,
        studentId:       data.studentId,
        courseId:        data.courseId,
        examName:        data.examName,
        institutionName: data.institutionName,
        facultyName:     data.facultyName,
      },
    });
  }
}