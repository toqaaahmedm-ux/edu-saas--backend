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

  async getLessons(courseId: string, userId: string, userRole: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    const isAdmin = userRole === 'ADMIN';
    const isInstructor = course.instructorId === userId;

    if (isAdmin || isInstructor) {
      // المدرس والأدمن يشوفوا كل الدروس بما فيها المجدولة مستقبلاً
      return this.lessonsRepository.findByCourseId(courseId);
    }

    // الطالب — لازم يكون enrolled
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to view lessons');
    }

    // FEAT-03: الطالب يشوف الدروس المتاحة بس (availableAt <= now أو null)
    return this.lessonsRepository.findAvailableByCourseId(courseId);
  }

  async create(courseId: string, userId: string, userRole: string, data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    availableAt?: string | null; // FEAT-03: ISO string من الفرونت
  }) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.create({
      ...data,
      courseId,
      availableAt: data.availableAt ? new Date(data.availableAt) : null,
    });
  }

  async update(id: string, userId: string, userRole: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    availableAt?: string | null; // FEAT-03
  }) {
    const lesson = await this.lessonsRepository.findById(id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    const { availableAt, ...rest } = data;
    return this.lessonsRepository.update(id, {
      ...rest,
      ...(availableAt !== undefined && {
        availableAt: availableAt ? new Date(availableAt) : null,
      }),
    });
  }

  async delete(id: string, userId: string, userRole: string) {
    const lesson = await this.lessonsRepository.findById(id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.delete(id);
  }
}