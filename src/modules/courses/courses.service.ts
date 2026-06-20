import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { CourseStatus } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(
    private readonly coursesRepository: CoursesRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    tenantId: string,
    page: number = 1,
    limit: number = 10,
    search?: string,
    category?: string,
  ) {
    const skip = (page - 1) * limit;
    const { courses, total } = await this.coursesRepository.findAllPaginated(
      tenantId, skip, limit, search, category,
    );
    return {
      courses,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(tenantId: string, page: number = 1, limit: number = 10) {
    const allCourses = await this.coursesRepository.findAllAdmin(tenantId);
    const total = allCourses.length;
    const start = (page - 1) * limit;
    const courses = allCourses.slice(start, start + limit);
    return {
      courses,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const course = await this.coursesRepository.findById(id);
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
  }) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    if (!data.description?.trim()) throw new BadRequestException('Description is required');
    if (data.price !== undefined && data.price < 0) throw new BadRequestException('Price cannot be negative');
    return this.coursesRepository.create(data);
  }

  async update(
    id: string,
    requestUserId: string,
    requestUserRole: string,
    data: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
    },
  ) {
    const course = await this.findById(id);
    if (requestUserRole !== 'ADMIN' && course.instructorId !== requestUserId) {
      throw new ForbiddenException('You do not own this course');
    }
    if (data.price !== undefined && data.price < 0) throw new BadRequestException('Price cannot be negative');
    return this.coursesRepository.update(id, data);
  }

  async updateStatus(id: string, status: CourseStatus) {
    await this.findById(id);
    return this.coursesRepository.updateStatus(id, status);
  }

  async delete(id: string) {
    const course = await this.findById(id);
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
    await this.coursesRepository.delete(id);
    return { message: 'Course deleted successfully' };
  }

  async archive(id: string) {
    await this.findById(id);
    return this.coursesRepository.updateStatus(id, CourseStatus.ARCHIVED);
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

    // ✅ FIX: عدد حقيقي من الـ DB بدل hardcoded 0
    const activeQuizzes = await this.prisma.quiz.count({
      where: { courseId: { in: courseIds } },
    });

    // ✅ FIX: avgRating محذوفة — مفيش Rating model في الـ schema
    return {
      totalStudents,
      publishedCourses,
      activeQuizzes,
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
    const totalCourses  = await this.coursesRepository.countAll(tenantId);
    const totalStudents = await this.coursesRepository.countStudents(tenantId);
    const totalRevenue  = await this.coursesRepository.sumRevenue(tenantId);
    return { totalCourses, totalStudents, totalRevenue };
  }
}