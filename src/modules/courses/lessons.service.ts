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

    // ADMIN و TEACHER صاحب الكورس يشوفوا بدون تسجيل
    const isAdmin = userRole === 'ADMIN';
    const isInstructor = course.instructorId === userId;

    if (!isAdmin && !isInstructor) {
      // التحقق من التسجيل للطالب
      const enrollment = await this.prisma.enrollment.findUnique({
        where: { studentId_courseId: { studentId: userId, courseId } },
      });
      if (!enrollment) {
        throw new ForbiddenException('You must be enrolled in this course to view lessons');
      }
    }

    return this.lessonsRepository.findByCourseId(courseId);
  }

  async create(courseId: string, userId: string, userRole: string, data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
  }) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.create({ ...data, courseId });
  }

  async update(id: string, userId: string, userRole: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
  }) {
    const lesson = await this.lessonsRepository.findById(id);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.update(id, data);
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