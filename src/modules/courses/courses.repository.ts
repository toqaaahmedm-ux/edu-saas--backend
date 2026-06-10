import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '@prisma/client';

@Injectable()
export class CoursesRepository {
  constructor(private prisma: PrismaService) {}

  // ── سيرش وفلتر (القديمة — محتاجينها لو في كود تاني بيستخدمها) ──
  findAll(search?: string, category?: string) {
    return this.prisma.course.findMany({
      where: {
        status: CourseStatus.PUBLISHED,
        ...(search && {
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ],
        }),
        ...(category && { category }),
      },
      include: { instructor: { select: { name: true, email: true } } },
    });
  }

  // QE-03: pagination في الـ DB مش في الـ JS
  async findAllPaginated(
    skip: number,
    take: number,
    search?: string,
    category?: string,
  ) {
    const where = {
      status: CourseStatus.PUBLISHED,
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { description: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
      ...(category && { category }),
    };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: { instructor: { select: { name: true, email: true } } },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { courses, total };
  }

  // ── Admin يشوف كل الكورسات حتى DRAFT ──
  findAllAdmin() {
    return this.prisma.course.findMany({
      include: {
        instructor: { select: { name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
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
      },
    });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
    },
  ) {
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
      },
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
        _count: { select: { enrollments: true } },
      },
    });
  }

  async getStudentsByCourses(courseIds: string[]) {
    return this.prisma.enrollment.findMany({
      where: { courseId: { in: courseIds } },
      include: {
        // DL-03: شلنا الـ role لأنه sensitive ومش محتاجينه هنا
        student: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
    });
  }

  // QE-02: نسخة بـ pagination عشان مش نجيب كل الطلاب دفعة واحدة
  async getStudentsByCoursesPaginated(
    courseIds: string[],
    skip: number,
    take: number,
  ) {
    const where = { courseId: { in: courseIds } };

    const [students, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        include: {
          student: { select: { id: true, name: true, email: true } },
          course: { select: { id: true, title: true } },
        },
        skip,
        take,
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { students, total };
  }

  async countAll() {
    return this.prisma.course.count();
  }

  // BL-05: بنعد الـ users اللي role بتاعهم STUDENT
  // الكود القديم كان بيعمل groupBy على الـ enrollments
  // اللي بيرجع عدد التسجيلات مش عدد الطلاب الفريدين
  async countStudents() {
    return this.prisma.user.count({
      where: { role: 'STUDENT' },
    });
  }

  // QE-01: بدل ما نجيب كل الـ rows في الـ memory ونجمعهم في JS
  // بنخلي الـ database تعمل الـ SUM مباشرة — أسرع بكتير
  async sumRevenue() {
    const result = await this.prisma.$queryRaw<[{ total: string }]>`
      SELECT COALESCE(SUM(c.price), 0)::text AS total
      FROM "Enrollment" e
      JOIN "Course" c ON e."courseId" = c.id
      WHERE e.status = 'ACTIVE'
    `;
    return Number(result[0]?.total ?? 0);
  }
}