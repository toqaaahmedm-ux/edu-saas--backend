import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '@prisma/client';
import { BillingService } from '../billing/billing.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly coursesRepository: CoursesRepository,
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) { }

  async findAll(
    tenantId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    category?: string,
    sortBy?: string,
  ) {
    const skip = (page - 1) * limit;
    const { courses, total } = await this.coursesRepository.findAllPaginated(
      tenantId, skip, limit, search, category, sortBy,
    );
    return {
      courses,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(tenantId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;
    const { courses, total } = await this.coursesRepository.findAllAdmin(
      tenantId, skip, limit,
    );
    return {
      courses,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string, tenantId?: string) {
    const course = await this.coursesRepository.findById(id, tenantId);
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async create(data: {
    tenantId: string;
    title: string;
    description: string;
    instructorId: string;
    thumbnail?: string;
    category?: string;
    price?: number;
    videoUrl?: string; // T-02 FIX: allow videoUrl on create too, for consistency
  }) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    if (!data.description?.trim()) throw new BadRequestException('Description is required');
    if (data.price !== undefined && data.price < 0) throw new BadRequestException('Price cannot be negative');

    // Plan limits enforcement: mirrors the maxStudents check already done
    // in EnrollmentsService â€” same transaction pattern to avoid a race
    // condition where two concurrent requests both pass the count check
    // before either course is actually created.
    const subscription = await this.billingService.getTenantSubscription(data.tenantId);

    return this.prisma.$transaction(async (tx) => {
      if (subscription) {
        const maxCourses = subscription.plan.maxCourses;
        const currentCourses = await tx.course.count({
          where: { tenantId: data.tenantId },
        });
        if (currentCourses >= maxCourses) {
          throw new BadRequestException(
            `Course limit reached (${maxCourses}). Please upgrade your plan.`,
          );
        }
      }

      return tx.course.create({ data });
    });
  }

  // T-02 FIX: `data` did not declare `videoUrl` in its type, even though
  // the value survives fine at runtime (this is a plain object, not a
  // class-validated DTO, so TypeScript's structural typing doesn't strip
  // it). The real drop happened one layer down, in
  // CoursesRepository.update(), which destructured a fixed set of fields.
  // Declaring videoUrl here too keeps this function's type signature
  // honest about what it actually forwards to the repository.
  async update(
    id: string,
    requestUserId: string,
    requestUserRole: string,
    tenantId: string,
    data: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
      videoUrl?: string; // T-02 FIX
    },
  ) {
    const course = await this.findById(id, tenantId);
    if (requestUserRole !== 'ADMIN' && course.instructorId !== requestUserId) {
      throw new ForbiddenException('You do not own this course');
    }
    if (data.price !== undefined && data.price < 0) throw new BadRequestException('Price cannot be negative');
    return this.coursesRepository.update(id, data, tenantId);
  }

  async updateStatus(id: string, status: CourseStatus, tenantId: string) {
    await this.findById(id, tenantId);
    return this.coursesRepository.updateStatus(id, status, tenantId);
  }

  async delete(id: string, tenantId: string) {
    const course = await this.findById(id, tenantId);
    if (course.status === CourseStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot delete a published course. Archive it instead to protect student data.',
      );
    }
    const enrollmentCount = (course as any)._count?.enrollments ?? 0;
    if (enrollmentCount > 0) {
      throw new BadRequestException(
        'Cannot delete a course with enrolled students. Archive it instead.',
      );
    }
    await this.coursesRepository.delete(id, tenantId);
    return { message: 'Course deleted successfully' };
  }

  async archive(id: string, tenantId: string) {
    await this.findById(id, tenantId);
    return this.coursesRepository.updateStatus(id, CourseStatus.ARCHIVED, tenantId);
  }

  async findByInstructor(tenantId: string, instructorId: string) {
    return this.coursesRepository.findByInstructor(tenantId, instructorId);
  }

  async getTeacherStats(tenantId: string, instructorId: string) {
    const courses = await this.coursesRepository.findByInstructor(tenantId, instructorId);
    const courseIds = courses.map((c) => c.id);

    const publishedCourses = courses.filter((c) => c.status === 'PUBLISHED').length;

    const totalStudents = courses.reduce(
      (sum, c) => sum + ((c as any)._count?.enrollments || 0),
      0,
    );

    const activeQuizzes = await this.prisma.quiz.count({
      where: { courseId: { in: courseIds } },
    });

    // T-07 FIX: avgRating replaced with completionRate â€” there's no Rating
    // model in the DB so avgRating always returned 0 and was misleading.
    // completionRate is calculated from real enrollment data we already have.
    const completedEnrollments = await this.prisma.enrollment.count({
      where: {
        courseId: { in: courseIds },
        status: 'COMPLETED',
      },
    });

    const completionRate = totalStudents > 0
      ? Math.round((completedEnrollments / totalStudents) * 100)
      : 0;

    return {
      totalStudents,
      publishedCourses,
      activeQuizzes,
      completionRate, // T-07 FIX: real metric instead of non-existent avgRating
    };
  }

  async getTeacherAnalytics(tenantId: string, instructorId: string) {
    const courses = await this.coursesRepository.findByInstructor(tenantId, instructorId);
    const courseIds = courses.map((c) => c.id);

    const attempts = await this.prisma.quizAttempt.findMany({
      where: {
        tenantId,
        quiz: { courseId: { in: courseIds } },
        submittedAt: { not: null },
      },
      select: { score: true, submittedAt: true },
      orderBy: { submittedAt: 'asc' },
    });

    const excellent = attempts.filter((a) => a.score >= 85).length;
    const good = attempts.filter((a) => a.score >= 60 && a.score < 85).length;
    const needsWork = attempts.filter((a) => a.score < 60).length;

    const monthlyMap: Record<string, { total: number; count: number }> = {};
    attempts.forEach((a) => {
      if (!a.submittedAt) return;
      const month = new Date(a.submittedAt).toLocaleString('en', { month: 'short' });
      if (!monthlyMap[month]) monthlyMap[month] = { total: 0, count: 0 };
      monthlyMap[month].total += a.score;
      monthlyMap[month].count += 1;
    });

    const performanceTrend = Object.entries(monthlyMap).map(([month, { total, count }]) => ({
      month,
      score: Math.round(total / count),
    }));

    return {
      performanceTrend: performanceTrend.length > 0 ? performanceTrend : [{ month: 'No data', score: 0 }],
      quizDistribution: [
        { name: 'Excellent', value: excellent },
        { name: 'Good', value: good },
        { name: 'Needs Improvement', value: needsWork },
      ],
    };
  }

  async getTeacherStudents(
    tenantId: string,
    instructorId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const courses = await this.coursesRepository.findByInstructor(tenantId, instructorId);
    const courseIds = courses.map((c) => c.id);
    const skip = (page - 1) * limit;
    return this.coursesRepository.getStudentsByCoursesPaginated(
      tenantId, courseIds, skip, limit,
    );
  }

  async getAdminStats(tenantId: string) {
    const totalCourses = await this.coursesRepository.countAll(tenantId);
    const totalStudents = await this.coursesRepository.countStudents(tenantId);
    const totalRevenue = await this.coursesRepository.sumRevenue(tenantId);
    return { totalCourses, totalStudents, totalRevenue };
  }
  // â”€â”€â”€ Lesson Methods (T-04) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async createLesson(
    courseId: string,
    tenantId: string,
    instructorId: string,
    data: {
      title: string;
      videoUrl?: string;
      duration?: number;
      order?: number;
      availableAt?: string;
    },
  ) {
    const course = await this.findById(courseId, tenantId);
    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('You do not own this course');
    }

    // if no order given, put it at the end
    let order = data.order;
    if (order === undefined) {
      const lastLesson = await this.prisma.lesson.findFirst({
        where: { courseId },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = (lastLesson?.order ?? 0) + 1;
    }

    return this.prisma.lesson.create({
      data: {
        title: data.title,
        videoUrl: data.videoUrl,
        duration: data.duration ?? 0,
        order,
        courseId,
        tenantId,
        availableAt: data.availableAt ? new Date(data.availableAt) : null,
      },
    });
  }

  async getLessons(courseId: string, tenantId: string, instructorId: string) {
    const course = await this.findById(courseId, tenantId);
    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.prisma.lesson.findMany({
      where: { courseId, tenantId },
      orderBy: { order: 'asc' },
    });
  }

  async updateLesson(
    lessonId: string,
    courseId: string,
    tenantId: string,
    instructorId: string,
    data: {
      title?: string;
      videoUrl?: string;
      duration?: number;
      order?: number;
      availableAt?: string;
    },
  ) {
    const course = await this.findById(courseId, tenantId);
    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...data,
        availableAt: data.availableAt ? new Date(data.availableAt) : undefined,
      },
    });
  }

  async deleteLesson(
    lessonId: string,
    courseId: string,
    tenantId: string,
    instructorId: string,
  ) {
    const course = await this.findById(courseId, tenantId);
    if (course.instructorId !== instructorId) {
      throw new ForbiddenException('You do not own this course');
    }

    await this.prisma.lesson.delete({ where: { id: lessonId } });
    return { message: 'Lesson deleted successfully' };
  }
}