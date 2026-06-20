import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsRepository {
  constructor(private prisma: PrismaService) {}

  findByCourseId(courseId: string) {
    return this.prisma.lesson.findMany({
      where: { courseId },
      orderBy: { order: 'asc' },
    });
  }

  // FEAT-03: بيرجع الدروس المتاحة بس (availableAt <= now أو null)
  findAvailableByCourseId(courseId: string) {
    const now = new Date();
    return this.prisma.lesson.findMany({
      where: {
        courseId,
        OR: [
          { availableAt: null },
          { availableAt: { lte: now } },
        ],
      },
      orderBy: { order: 'asc' },
    });
  }

  create(data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    courseId: string;
    availableAt?: Date | null; // FEAT-03
  }) {
    return this.prisma.lesson.create({ data });
  }

  update(id: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    availableAt?: Date | null; // FEAT-03
  }) {
    return this.prisma.lesson.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.lesson.delete({ where: { id } });
  }

  findById(id: string) {
    return this.prisma.lesson.findUnique({ where: { id } });
  }
}