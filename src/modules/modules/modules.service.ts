import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ModulesRepository } from './modules.repository';
import { CoursesService } from '../courses/courses.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModulesService {
  constructor(
    private readonly modulesRepository: ModulesRepository,
    private readonly coursesService: CoursesService,
    private readonly prisma: PrismaService,
  ) {}

  private async assertCourseOwnership(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.coursesService.findById(courseId, tenantId);
    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }
    return course;
  }

  // Sprint 2 / Task #1: enrich each lesson with the current student's
  // completion state. If the caller isn't a student with an enrollment
  // (e.g. teacher/admin, or an anonymous @Public() request), lessons are
  // returned with isCompleted: false and no error is thrown.
  //
  // LESSON-PROGRESS-NEW: also enrich each lesson with `savedPosition`
  // (seconds), read from LessonProgress, so the frontend video player can
  // seek to where the student left off. Defaults to 0 (start) when there
  // is no student, or no saved progress yet for that lesson.
  async findAllByCourse(courseId: string, tenantId: string, studentId?: string) {
    const modules = await this.modulesRepository.findAllByCourse(courseId, tenantId);

    if (!studentId) {
      return modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l: any) => ({ ...l, isCompleted: false, savedPosition: 0 })),
      }));
    }

    const completed = await this.prisma.lessonCompletion.findMany({
      where: { studentId, tenantId, lesson: { courseId } },
      select: { lessonId: true },
    });
    const completedIds = new Set(completed.map((c) => c.lessonId));

    // LESSON-PROGRESS-NEW
    const progressRecords = await this.prisma.lessonProgress.findMany({
      where: { studentId, tenantId, lesson: { courseId } },
      select: { lessonId: true, positionSeconds: true },
    });
    const progressByLessonId = new Map(progressRecords.map((p) => [p.lessonId, p.positionSeconds]));

    return modules.map((m) => ({
      ...m,
      lessons: m.lessons.map((l: any) => ({
        ...l,
        isCompleted: completedIds.has(l.id),
        savedPosition: progressByLessonId.get(l.id) ?? 0,
      })),
    }));
  }

  async findById(id: string, tenantId: string) {
    const module = await this.modulesRepository.findById(id, tenantId);
    if (!module) throw new NotFoundException('Module not found');
    return module;
  }

  async create(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: { title: string; description?: string; order?: number },
  ) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);

    const order = data.order ?? (await this.modulesRepository.getNextOrder(courseId));

    return this.modulesRepository.create({
      tenantId,
      courseId,
      title: data.title,
      description: data.description,
      order,
    });
  }

  async update(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: { title?: string; description?: string; order?: number },
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);
    return this.modulesRepository.update(id, data, tenantId);
  }

  async delete(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);
    await this.modulesRepository.delete(id, tenantId);
    return { message: 'Module deleted successfully' };
  }
}