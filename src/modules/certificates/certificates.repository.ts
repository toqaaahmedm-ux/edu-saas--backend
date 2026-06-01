// src/modules/certificates/certificates.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CertificatesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByStudentId(studentId: string) {
    return this.prisma.certificate.findMany({
      where: { studentId },
      include: {
        course: {
          select: { id: true, title: true },
        },
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
    return this.prisma.certificate.findFirst({
      where: { studentId, courseId },
    });
  }

  async create(data: {
    studentId: string;
    courseId: string;
    examName: string;
    institutionName: string;
    facultyName: string;
  }) {
    return this.prisma.certificate.create({
      data: {
        studentId: data.studentId,
        courseId: data.courseId,
      },
    });
  }
}