import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '@prisma/client';

@Injectable()
export class CoursesRepository {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.course.findMany({
      where: { status: CourseStatus.PUBLISHED },
      include: { instructor: { select: { name: true, email: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.course.findUnique({
      where: { id },
      include: {
        instructor: { select: { name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  create(data: {
    title: string;
    description: string;
    instructorId: string;
    thumbnail?: string;
    category?: string;
    price?: number;
  }) {
    return this.prisma.course.create({
      data: {
        title: data.title,
        description: data.description,
        instructorId: data.instructorId,
        thumbnail: data.thumbnail,
        category: data.category,
        price: data.price,
      }
    });
  }

  update(id: string, data: {
    title?: string;
    description?: string;
    thumbnail?: string;
    category?: string;
    price?: number;
    status?: CourseStatus;
  }) {
    const { title, description, thumbnail, category, price, status } = data;
    return this.prisma.course.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(description && { description }),
        ...(thumbnail !== undefined && { thumbnail }),
        ...(category !== undefined && { category }),
        ...(price !== undefined && { price }),
        ...(status && { status }),
      }
    });
  }

  delete(id: string) {
    return this.prisma.course.delete({ where: { id } });
  }

  updateStatus(id: string, status: CourseStatus) {
    return this.prisma.course.update({ where: { id }, data: { status } });
  }

  findByInstructor(instructorId: string) {
    return this.prisma.course.findMany({
      where: { instructorId },
      include: {
        _count: { select: { enrollments: true } },  // ← HIGH-01: عدد الطلاب الحقيقي
      },
    });
  }

  async getStudentsByCourses(courseIds: string[]) {
    return this.prisma.enrollment.findMany({
      where: { courseId: { in: courseIds } },
      include: {
        student: {
          select: { id: true, name: true, email: true, role: true },
        },
        course: {
          select: { id: true, title: true },
        },
      },
    });
  }

  async countAll() {
    return this.prisma.course.count();
  }

  async countStudents() {
    // ← HIGH-01: عدد الطلاب الفريدين المسجلين
    return this.prisma.enrollment.groupBy({
      by: ['studentId'],
    }).then(result => result.length);
  }

  // ← BUG-01: إيرادات حقيقية من أسعار الكورسات
  async sumRevenue() {
    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { status: 'ACTIVE' },
      include: {
        course: { select: { price: true } },
      },
    });

    return activeEnrollments.reduce((sum, enrollment) => {
      return sum + (Number(enrollment.course.price) || 0);
    }, 0);
  }
}