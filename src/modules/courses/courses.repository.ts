import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '@prisma/client';

@Injectable()
export class CoursesRepository {
  constructor(private prisma: PrismaService) {}

  async findAllPaginated(
    tenantId: string | null,
    skip: number,
    take: number,
    search?: string,
    category?: string,
  ) {
    const where: any = {
      status: CourseStatus.PUBLISHED,
      ...(tenantId && { tenantId }),
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

  // PERF-17 FIX: قبل كده findAllAdmin كانت بتجيب كل الكورسات للذاكرة
  // (findMany بدون skip/take)، وبعدين courses.service.ts كان بيعمل
  // .slice() في Node.js عشان يعمل pagination. مع آلاف الكورسات ده كان
  // هيعمل memory pressure وبطء واضح. دلوقتي الـ pagination اتنقل
  // لمستوى قاعدة البيانات مباشرة باستخدام skip/take + count في transaction.
  async findAllAdmin(
    tenantId: string,
    skip: number = 0,
    take: number = 10,
  ) {
    const where = { tenantId };

    const [courses, total] = await this.prisma.$transaction([
      this.prisma.course.findMany({
        where,
        include: {
          instructor: { select: { name: true, email: true } },
          _count: { select: { enrollments: true } },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { courses, total };
  }

  // BE-C03 FIX: قبل كده findById كانت بتجيب الكورس بالـ id بس من غير
  // أي فلتر على tenantId — يعني GET /courses/:id كان يقدر يرجع كورس
  // تبع مستأجر تاني تماماً لو الشخص عارف الـ UUID بتاعه. دلوقتي tenantId
  // بقى جزء من شرط WHERE نفسه (مش فحص لاحق في الكود)، فالاستعلام يرجع
  // null لو الكورس مش تبع نفس المستأجر، بالظبط زي لو مش موجود خالص —
  // ده يمنع حتى تسريب معلومة "الكورس ده موجود بس مش بتاعك".
  findById(id: string, tenantId?: string) {
    return this.prisma.course.findFirst({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      include: {
        instructor: { select: { name: true, email: true } },
        _count: { select: { enrollments: true } },
      },
    });
  }

  create(data: {
    tenantId: string;
    title: string;
    description: string;
    instructorId: string;
    thumbnail?: string;
    category?: string;
    price?: number;
  }) {
    return this.prisma.course.create({
      data: {
        tenantId:     data.tenantId,
        title:        data.title,
        description:  data.description,
        instructorId: data.instructorId,
        thumbnail:    data.thumbnail,
        category:     data.category,
        price:        data.price,
      },
    });
  }

  // BE-C04 FIX: update/delete/updateStatus بقوا بياخدوا tenantId
  // اختياري ويحطوه في شرط WHERE نفسه. لو الـ admin بعت id كورس تبع
  // مستأجر تاني، Prisma هيرمي P2025 (record not found) بدل ما ينفّذ
  // التعديل أو الحذف — مش محتاجين نعتمد بس على فحص منطقي بعد الجلب.
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
    tenantId?: string,
  ) {
    const { title, description, thumbnail, category, price, status } = data;
    return this.prisma.course.update({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
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

  delete(id: string, tenantId?: string) {
    return this.prisma.course.delete({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
    });
  }

  updateStatus(id: string, status: CourseStatus, tenantId?: string) {
    return this.prisma.course.update({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      data: { status },
    });
  }

  findByInstructor(tenantId: string, instructorId: string) {
    return this.prisma.course.findMany({
      where: { tenantId, instructorId },
      include: {
        _count: { select: { enrollments: true } },
      },
    });
  }

  async getStudentsByCoursesPaginated(
    tenantId: string,
    courseIds: string[],
    skip: number,
    take: number,
  ) {
    const where = { tenantId, courseId: { in: courseIds } };

    const [students, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({
        where,
        include: {
          student: { select: { id: true, name: true, email: true } },
          course:  { select: { id: true, title: true } },
        },
        skip,
        take,
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.enrollment.count({ where }),
    ]);

    return { students, total };
  }

  async countAll(tenantId: string) {
    return this.prisma.course.count({ where: { tenantId } });
  }

  async countStudents(tenantId: string) {
    return this.prisma.user.count({
      where: { tenantId, role: 'STUDENT' },
    });
  }

  async sumRevenue(tenantId: string) {
    const result = await this.prisma.$queryRaw<[{ total: string }]>`
      SELECT COALESCE(SUM(c.price), 0)::text AS total
      FROM "Enrollment" e
      JOIN "Course" c ON e."courseId" = c.id
      WHERE e.status = 'ACTIVE'
        AND e."tenantId" = ${tenantId}
    `;
    return Number(result[0]?.total ?? 0);
  }
}