import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByStudentId(tenantId: string, studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { tenantId, studentId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            instructor: {
              select: { id: true, name: true, avatar: true },
            },
            category: true,
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }

  async findByStudentAndCourse(studentId: string, courseId: string) {
    return this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
  }

  async findByCourseId(tenantId: string, courseId: string) {
    return this.prisma.enrollment.findMany({
      where: { tenantId, courseId },
      include: {
        student: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // Multi-tenant: لازم tenantId في الـ create
  async create(tenantId: string, studentId: string, courseId: string) {
    return this.prisma.enrollment.create({
      data: { tenantId, studentId, courseId },
    });
  }

  async updateStatus(id: string, status: EnrollmentStatus) {
    return this.prisma.enrollment.update({
      where: { id },
      data: { status },
    });
  }

  // BL-04: progress = 100 → COMPLETED تلقائياً
  async updateProgress(id: string, progress: number) {
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        progress,
        status: progress >= 100 ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE,
      },
    });
  }

  async updateProgressAndStatus(
    id: string,
    progress: number,
    _status: EnrollmentStatus | string,
  ) {
    return this.updateProgress(id, progress);
  }

  async findById(id: string) {
    return this.prisma.enrollment.findUnique({ where: { id } });
  }
}