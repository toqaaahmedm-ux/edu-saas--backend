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
    sortBy?: string,
  ) {
    const orderBy =
      sortBy === 'price_asc' ? { price: 'asc' as const } :
      sortBy === 'price_desc' ? { price: 'desc' as const } :
      sortBy === 'title_asc' ? { title: 'asc' as const } :
      { createdAt: 'desc' as const };
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
        orderBy,
      }),
      this.prisma.course.count({ where }),
    ]);

    return { courses, total };
  }

  // PERF-17 FIX: findAllAdmin used to load ALL courses into memory
  // (findMany with no skip/take) and then courses.service.ts did an
  // in-Node .slice() for pagination. With thousands of courses this
  // caused memory pressure and noticeable slowness. Pagination now
  // happens at the database level via skip/take + count in a transaction.
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

  // BE-C03 FIX: findById used to fetch the course by id with NO tenantId
  // filter — meaning GET /courses/:id could return a course belonging to
  // a completely different tenant if someone knew the UUID. tenantId is
  // now part of the WHERE clause itself (not a check performed after the
  // fetch), so the query returns null when the course doesn't belong to
  // the current tenant, exactly as if it didn't exist at all — this also
  // prevents leaking the "this course exists but isn't yours" signal.
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
    videoUrl?: string; // T-02 FIX: allow videoUrl on create too, for consistency
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
        videoUrl:     data.videoUrl, // T-02 FIX
      },
    });
  }

  // BE-C04 FIX: update/delete/updateStatus take an optional tenantId and
  // put it directly in the WHERE clause. If an admin passes a course id
  // belonging to a different tenant, Prisma throws P2025 (record not
  // found) instead of silently updating/deleting it — we don't rely on a
  // logical check performed after the fetch.
  //
  // T-02 FIX: `videoUrl` was silently dropped here. The function
  // destructured only a fixed subset of fields out of `data` and built
  // the Prisma `data` payload from that subset — videoUrl was never
  // included in either the destructure or the payload, so any video URL
  // sent by the frontend never reached the database, even though it made
  // it all the way through the controller and service untouched. Fixed
  // by adding videoUrl to both the destructure and the conditional spread.
  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
      videoUrl?: string; // T-02 FIX
    },
    tenantId?: string,
  ) {
    const { title, description, thumbnail, category, price, status, videoUrl } = data; // T-02 FIX: videoUrl added
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
        ...(videoUrl !== undefined && { videoUrl }), // T-02 FIX: this was the missing line
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