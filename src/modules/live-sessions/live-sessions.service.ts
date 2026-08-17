import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LiveSessionsService {
  constructor(private prisma: PrismaService) {}

  async getSessions(tenantId: string, courseId?: string) {
    return this.prisma.liveSession.findMany({
      where: { tenantId, ...(courseId ? { courseId } : {}) },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async createSession(
    tenantId: string,
    userId: string,
    userRole: string,
    data: { courseId: string; title: string; meetingUrl: string; scheduledAt: string; durationMinutes?: number },
  ) {
    if (!data.courseId) throw new BadRequestException('courseId is required');
    if (!data.title?.trim()) throw new BadRequestException('title is required');
    if (!data.meetingUrl?.trim()) throw new BadRequestException('meetingUrl is required');
    if (!data.scheduledAt) throw new BadRequestException('scheduledAt is required');

    await this.assertCourseOwnership(data.courseId, tenantId, userId, userRole);

    return this.prisma.liveSession.create({
      data: {
        tenantId,
        courseId: data.courseId,
        title: data.title,
        meetingUrl: data.meetingUrl,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: data.durationMinutes ?? 60,
      },
    });
  }

  async updateSession(id: string, tenantId: string, userId: string, userRole: string, data: any) {
    const session = await this.assertExists(id, tenantId);
    await this.assertCourseOwnership(session.courseId, tenantId, userId, userRole);

    return this.prisma.liveSession.update({
      where: { id, tenantId },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.meetingUrl && { meetingUrl: data.meetingUrl }),
        ...(data.scheduledAt && { scheduledAt: new Date(data.scheduledAt) }),
        ...(data.durationMinutes !== undefined && { durationMinutes: data.durationMinutes }),
        ...(data.status && { status: data.status }),
      },
    });
  }

  async deleteSession(id: string, tenantId: string, userId: string, userRole: string) {
    const session = await this.assertExists(id, tenantId);
    await this.assertCourseOwnership(session.courseId, tenantId, userId, userRole);

    await this.prisma.liveSession.delete({ where: { id, tenantId } });
    return { message: 'Live session deleted' };
  }

  private async assertExists(id: string, tenantId: string) {
    const session = await this.prisma.liveSession.findFirst({ where: { id, tenantId } });
    if (!session) throw new NotFoundException('Live session not found');
    return session;
  }

  private async assertCourseOwnership(courseId: string, tenantId: string, userId: string, userRole: string) {
    if (userRole === 'ADMIN') return;
    const course = await this.prisma.course.findFirst({ where: { id: courseId, tenantId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }
  }
}