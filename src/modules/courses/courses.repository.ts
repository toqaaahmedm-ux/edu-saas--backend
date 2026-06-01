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
    return this.prisma.course.create({ data });
  }

  update(id: string, data: {
    title?: string;
    description?: string;
    thumbnail?: string;
    category?: string;
    price?: number;
    status?: CourseStatus;
  }) {
    return this.prisma.course.update({ where: { id }, data });
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
      include: { _count: { select: { enrollments: true } } },
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
    return this.prisma.enrollment.count();
  }

  async sumRevenue() {
    const activeEnrollments = await this.prisma.enrollment.count({
      where: { status: 'ACTIVE' },
    });
    return activeEnrollments * 299;
  }
}