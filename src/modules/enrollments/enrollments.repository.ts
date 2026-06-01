import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EnrollmentStatus } from '@prisma/client';

@Injectable()
export class EnrollmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByStudentId(studentId: string) {
    return this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            instructor: true,
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

  async findByCourseId(courseId: string) {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async create(studentId: string, courseId: string) {
    return this.prisma.enrollment.create({
      data: { studentId, courseId },
    });
  }

  async updateStatus(id: string, status: EnrollmentStatus) {
    return this.prisma.enrollment.update({
      where: { id },
      data: { status },
    });
  }

  async updateProgress(id: string, progress: number) {  // ← جديد
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        progress,
        status: progress >= 100 ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE,
      },
    });
  }

  async findById(id: string) {  // ← جديد
    return this.prisma.enrollment.findUnique({ where: { id } });
  }
}