import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────
  async createNotification(data: {
    userId: string;
    tenantId?: string;
    title: string;
    message: string;
    type: string; // 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'
  }) {
    return this.prisma.notification.create({ data });
  }

  // ── بيرسل لكل طلاب tenant معين ───────────────────────────────
  async broadcastToTenant(data: {
    tenantId: string;
    title: string;
    message: string;
    type: string;
  }) {
    const users = await this.prisma.user.findMany({
      where: { tenantId: data.tenantId },
      select: { id: true },
    });

    await this.prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        tenantId: data.tenantId,
        title: data.title,
        message: data.message,
        type: data.type,
      })),
    });

    return { sent: users.length };
  }

  // ── Read ──────────────────────────────────────────────────────
  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  // ── Mark Read ─────────────────────────────────────────────────
  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}