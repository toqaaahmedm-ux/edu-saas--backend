import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ModulesRepository {
  constructor(private prisma: PrismaService) {}

  findAllByCourse(courseId: string, tenantId: string) {
    return this.prisma.module.findMany({
      where: { courseId, tenantId },
      include: {
        lessons: { orderBy: { order: 'asc' } },
        _count: { select: { lessons: true } },
      },
      orderBy: { order: 'asc' },
    });
  }

  // tenantId في الـ WHERE مباشرة، مش فحص لاحق — نفس منطق BE-C03 fix في courses
  findById(id: string, tenantId?: string) {
    return this.prisma.module.findFirst({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      include: {
        lessons: { orderBy: { order: 'asc' } },
      },
    });
  }

  async getNextOrder(courseId: string) {
    const last = await this.prisma.module.findFirst({
      where: { courseId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return (last?.order ?? 0) + 1;
  }

  create(data: {
    tenantId: string;
    courseId: string;
    title: string;
    description?: string;
    order: number;
  }) {
    return this.prisma.module.create({ data });
  }

  update(
    id: string,
    data: { title?: string; description?: string; order?: number },
    tenantId?: string,
  ) {
    const { title, description, order } = data;
    return this.prisma.module.update({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
      },
    });
  }

  delete(id: string, tenantId?: string) {
    return this.prisma.module.delete({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
    });
  }
}