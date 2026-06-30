import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LessonsRepository {
  constructor(private prisma: PrismaService) {}

  findByCourseId(courseId: string, tenantId: string) { // ✅ BE-M02
    return this.prisma.lesson.findMany({
      where: { courseId, tenantId }, // ✅
      orderBy: { order: 'asc' },
    });
  }

  findAvailableByCourseId(courseId: string, tenantId: string) { // ✅ BE-M02
    const now = new Date();
    return this.prisma.lesson.findMany({
      where: {
        courseId,
        tenantId, // ✅
        OR: [
          { availableAt: null },
          { availableAt: { lte: now } },
        ],
      },
      orderBy: { order: 'asc' },
    });
  }

  create(data: {
    tenantId: string; // ✅ BE-M02
    title: string;
    videoUrl?: string;
    duration?: number;
    order: number;
    courseId: string;
    availableAt?: Date | null;
  }) {
    return this.prisma.lesson.create({ data });
  }

  update(id: string, tenantId: string, data: { // ✅ BE-M02
    title?: string;
    videoUrl?: string;
    duration?: number;
    order?: number;
    availableAt?: Date | null;
  }) {
    return this.prisma.lesson.update({
      where: { id, tenantId }, // ✅
      data,
    });
  }

  delete(id: string, tenantId: string) { // ✅ BE-M02
    return this.prisma.lesson.delete({
      where: { id, tenantId }, // ✅
    });
  }

  findById(id: string, tenantId: string) { // ✅ BE-M02
    return this.prisma.lesson.findFirst({
      where: { id, tenantId }, // ✅ findFirst بدل findUnique
    });
  }
}