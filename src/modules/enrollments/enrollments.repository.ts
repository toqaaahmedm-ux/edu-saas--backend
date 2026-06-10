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
            // DL-01: بدل instructor: true اللي كان بيرجع hashedPassword
            // دلوقتي بنرجع بس الحقول الآمنة
            instructor: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
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

  // BL-04: بتحدث الـ progress وبتغير الـ status تلقائياً
  // لو progress = 100 → COMPLETED، غير كده → ACTIVE
  async updateProgress(id: string, progress: number) {
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        progress,
        status: progress >= 100 ? EnrollmentStatus.COMPLETED : EnrollmentStatus.ACTIVE,
      },
    });
  }

  // alias عشان الـ service تشتغل من غير error
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