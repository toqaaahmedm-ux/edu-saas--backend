import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CoursesRepository } from './courses.repository';
import { CourseStatus } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(private readonly coursesRepository: CoursesRepository) {}

  // QE-03: الـ pagination بتتعمل في الـ DB مش في الـ JS
  // الكود القديم كان بيجيب كل الكورسات وبعدين يعمل slice
  async findAll(
    page: number = 1,
    limit: number = 10,
    search?: string,
    category?: string,
  ) {
    const skip = (page - 1) * limit;
    const { courses, total } = await this.coursesRepository.findAllPaginated(
      skip,
      limit,
      search,
      category,
    );

    return {
      courses,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findAllAdmin(page: number = 1, limit: number = 10) {
    const allCourses = await this.coursesRepository.findAllAdmin();
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
    title: string;
    description: string;
    instructorId: string;
    thumbnail?: string;
    category?: string;
    price?: number;
  }) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    if (!data.description?.trim())
      throw new BadRequestException('Description is required');
    if (data.price !== undefined && data.price < 0)
      throw new BadRequestException('Price cannot be negative');
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
    if (data.price !== undefined && data.price < 0)
      throw new BadRequestException('Price cannot be negative');
    return this.coursesRepository.update(id, data);
  }

  async updateStatus(id: string, status: CourseStatus) {
    await this.findById(id);
    return this.coursesRepository.updateStatus(id, status);
  }

  // BL-06: حماية الـ delete — منع حذف الكورسات المنشورة
  // الكود القديم كان بيمسح الكورس وكل بيانات الطلاب (enrollments, certificates, quiz attempts)
  async delete(id: string) {
    const course = await this.findById(id);

    // لو الكورس PUBLISHED — ارفض الحذف وحول لـ ARCHIVED
    if (course.status === CourseStatus.PUBLISHED) {
      throw new BadRequestException(
        'Cannot delete a published course. Archive it instead to protect student data.',
      );
    }

    // لو الكورس DRAFT — تحقق إنه مفيش enrollments عليه
    const enrollmentCount = (course as any)._count?.enrollments ?? 0;
    if (enrollmentCount > 0) {
      throw new BadRequestException(
        'Cannot delete a course with enrolled students. Archive it instead.',
      );
    }

    await this.coursesRepository.delete(id);
    return { message: 'Course deleted successfully' };
  }

  // BL-06: soft delete — حول الكورس لـ ARCHIVED بدل الحذف الكامل
  async archive(id: string) {
    await this.findById(id);
    return this.coursesRepository.updateStatus(id, CourseStatus.ARCHIVED);
  }

  async findByInstructor(instructorId: string) {
    return this.coursesRepository.findByInstructor(instructorId);
  }

  async getTeacherStats(instructorId: string) {
    const courses = await this.coursesRepository.findByInstructor(instructorId);
    const publishedCourses = courses.filter((c) => c.status === 'PUBLISHED').length;
    const totalStudents = courses.reduce((sum, c) => {
      return sum + ((c as any)._count?.enrollments || 0);
    }, 0);
    return {
      totalStudents,
      publishedCourses,
      activeQuizzes: 0,
      avgRating: 4.8,
    };
  }

  // QE-02: أضفنا pagination — الكود القديم كان بيجيب كل الطلاب دفعة واحدة
  async getTeacherStudents(
    instructorId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const courses = await this.coursesRepository.findByInstructor(instructorId);
    const courseIds = courses.map((c) => c.id);

    const skip = (page - 1) * limit;
    return this.coursesRepository.getStudentsByCoursesPaginated(
      courseIds,
      skip,
      limit,
    );
  }

  async getAdminStats() {
    const totalCourses = await this.coursesRepository.countAll();
    const totalStudents = await this.coursesRepository.countStudents();
    const totalRevenue = await this.coursesRepository.sumRevenue();
    return {
      totalCourses,
      totalStudents,
      totalRevenue,
    };
  }
}