import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { LessonsRepository } from './lessons.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsService {
  constructor(
    private lessonsRepository: LessonsRepository,
    private coursesRepository: CoursesRepository,
    private prisma: PrismaService,
  ) {}

  async getLessons(courseId: string, userId: string, userRole: string, tenantId: string) { // ✅ BE-M02
    const course = await this.coursesRepository.findById(courseId, tenantId);
    if (!course) throw new NotFoundException('Course not found');

    const isAdmin = userRole === 'ADMIN';
    const isInstructor = course.instructorId === userId;

    if (isAdmin || isInstructor) {
      return this.lessonsRepository.findByCourseId(courseId, tenantId); // ✅
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to view lessons');
    }

    return this.lessonsRepository.findAvailableByCourseId(courseId, tenantId); // ✅
  }

  async create(courseId: string, userId: string, userRole: string, tenantId: string, data: { // ✅ BE-M02
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    availableAt?: string | null;
  }) {
    const course = await this.coursesRepository.findById(courseId, tenantId);
    if (!course) throw new NotFoundException('Course not found');

    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.create({
      ...data,
      tenantId,   // ✅
      courseId,
      availableAt: data.availableAt ? new Date(data.availableAt) : null,
    });
  }

  async update(id: string, userId: string, userRole: string, tenantId: string, data: { // ✅ BE-M02
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    availableAt?: string | null;
  }) {
    const lesson = await this.lessonsRepository.findById(id, tenantId); // ✅
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId, tenantId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    const { availableAt, ...rest } = data;
    return this.lessonsRepository.update(id, tenantId, { // ✅
      ...rest,
      ...(availableAt !== undefined && {
        availableAt: availableAt ? new Date(availableAt) : null,
      }),
    });
  }

  async delete(id: string, userId: string, userRole: string, tenantId: string) { // ✅ BE-M02
    const lesson = await this.lessonsRepository.findById(id, tenantId); // ✅
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId, tenantId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.delete(id, tenantId); // ✅
  }
}