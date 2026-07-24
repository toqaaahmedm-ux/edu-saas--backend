import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsRepository {
  constructor(private prisma: PrismaService) {}

  findByCourseId(courseId: string, tenantId: string, moduleId?: string) {
    return this.prisma.lesson.findMany({
      where: { courseId, tenantId, ...(moduleId && { moduleId }) },
      orderBy: { order: 'asc' },
    });
  }

  findAvailableByCourseId(courseId: string, tenantId: string) {
    const now = new Date();
    return this.prisma.lesson.findMany({
      where: {
        courseId,
        tenantId,
        OR: [
          { availableAt: null },
          { availableAt: { lte: now } },
        ],
      },
      orderBy: { order: 'asc' },
    });
  }

  create(data: {
    tenantId: string;
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    courseId: string;
    moduleId: string;
    availableAt?: Date | null;
  }) {
    return this.prisma.lesson.create({ data });
  }

  update(id: string, tenantId: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    moduleId?: string;
    availableAt?: Date | null;
  }) {
    return this.prisma.lesson.update({
      where: { id, tenantId },
      data,
    });
  }

  delete(id: string, tenantId: string) {
    return this.prisma.lesson.delete({
      where: { id, tenantId },
    });
  }

  findById(id: string, tenantId: string) {
    return this.prisma.lesson.findFirst({
      where: { id, tenantId },
    });
  }

  countByCourseId(courseId: string, tenantId: string) {
    return this.prisma.lesson.count({ where: { courseId, tenantId } });
  }

  findCompletion(studentId: string, lessonId: string) {
    return this.prisma.lessonCompletion.findUnique({
      where: { studentId_lessonId: { studentId, lessonId } },
    });
  }

  createCompletion(tenantId: string, studentId: string, lessonId: string) {
    return this.prisma.lessonCompletion.create({
      data: { tenantId, studentId, lessonId },
    });
  }

  countCompletedByCourse(studentId: string, courseId: string, tenantId: string) {
    return this.prisma.lessonCompletion.count({
      where: {
        studentId,
        tenantId,
        lesson: { courseId },
      },
    });
  }

  findCompletedLessonIdsByCourse(studentId: string, courseId: string, tenantId: string) {
    return this.prisma.lessonCompletion.findMany({
      where: {
        studentId,
        tenantId,
        lesson: { courseId },
      },
      select: { lessonId: true },
    });
  }
}
