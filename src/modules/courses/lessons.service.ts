import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { LessonsRepository } from './lessons.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { ModulesRepository } from '../modules/modules.repository';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsService {
  constructor(
    private lessonsRepository: LessonsRepository,
    private coursesRepository: CoursesRepository,
    private modulesRepository: ModulesRepository,
    private prisma: PrismaService,
  ) {}

  async getLessons(courseId: string, userId: string, userRole: string, tenantId: string, moduleId?: string) {
    const course = await this.coursesRepository.findById(courseId, tenantId);
    if (!course) throw new NotFoundException('Course not found');

    const isAdmin = userRole === 'ADMIN';
    const isInstructor = course.instructorId === userId;

    if (isAdmin || isInstructor) {
      return this.lessonsRepository.findByCourseId(courseId, tenantId, moduleId);
    }

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to view lessons');
    }

    return this.lessonsRepository.findAvailableByCourseId(courseId, tenantId);
  }

  // Sprint 2 bugfix: moduleId is now required — lessons created without one
  // were "orphaned" (existed in the DB, invisible to students, since the
  // student-facing GET /courses/:id/modules only ever returns lessons that
  // are actually attached to a module).
  async create(courseId: string, userId: string, userRole: string, tenantId: string, data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    moduleId: string;
    availableAt?: string | null;
  }) {
    const course = await this.coursesRepository.findById(courseId, tenantId);
    if (!course) throw new NotFoundException('Course not found');

    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    if (!data.moduleId) {
      throw new BadRequestException('moduleId is required — choose a module for this lesson');
    }

    const module = await this.modulesRepository.findById(data.moduleId, tenantId);
    if (!module || module.courseId !== courseId) {
      throw new BadRequestException('Module not found in this course');
    }

    return this.lessonsRepository.create({
      ...data,
      tenantId,
      courseId,
      availableAt: data.availableAt ? new Date(data.availableAt) : null,
    });
  }

  async update(id: string, userId: string, userRole: string, tenantId: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    moduleId?: string;
    availableAt?: string | null;
  }) {
    const lesson = await this.lessonsRepository.findById(id, tenantId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId, tenantId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    if (data.moduleId) {
      const module = await this.modulesRepository.findById(data.moduleId, tenantId);
      if (!module || module.courseId !== lesson.courseId) {
        throw new BadRequestException('Module not found in this course');
      }
    }

    const { availableAt, ...rest } = data;
    return this.lessonsRepository.update(id, tenantId, {
      ...rest,
      ...(availableAt !== undefined && {
        availableAt: availableAt ? new Date(availableAt) : null,
      }),
    });
  }

  async delete(id: string, userId: string, userRole: string, tenantId: string) {
    const lesson = await this.lessonsRepository.findById(id, tenantId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.coursesRepository.findById(lesson.courseId, tenantId);
    if (userRole !== 'ADMIN' && course!.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }

    return this.lessonsRepository.delete(id, tenantId);
  }

  async completeLesson(lessonId: string, studentId: string, tenantId: string) {
    const lesson = await this.lessonsRepository.findById(lessonId, tenantId);
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: lesson.courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('You must be enrolled in this course to complete lessons');
    }

    const existing = await this.lessonsRepository.findCompletion(studentId, lessonId);
    if (!existing) {
      await this.lessonsRepository.createCompletion(tenantId, studentId, lessonId);
    }

    const totalLessons = await this.lessonsRepository.countByCourseId(lesson.courseId, tenantId);
    const completedCount = await this.lessonsRepository.countCompletedByCourse(studentId, lesson.courseId, tenantId);
    const progress = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

    const updatedEnrollment = await this.prisma.enrollment.update({
      where: { studentId_courseId: { studentId, courseId: lesson.courseId } },
      data: {
        progress,
        ...(progress >= 100 && { status: 'COMPLETED' }),
      },
    });

    return {
      lessonId,
      completed: true,
      totalLessons,
      completedCount,
      progress: updatedEnrollment.progress,
      courseCompleted: updatedEnrollment.progress >= 100,
    };
  }
}
