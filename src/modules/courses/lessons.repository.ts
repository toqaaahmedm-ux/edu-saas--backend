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

  create(data: {
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    courseId: string;
  }) {
    return this.prisma.lesson.create({ data });
  }

  update(id: string, data: {
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
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