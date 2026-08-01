import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const BROADCAST_BATCH_SIZE = 500;

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  // ── Create ────────────────────────────────────────────────────
  async createNotification(data: {
    userId: string;
    tenantId?: string;
    title: string;
    message: string;
    type: string;
  }) {
    return this.prisma.notification.create({ data });
  }

  // ── sends to all students of a given tenant ───────────────────────────────
  // PERF-19 FIX: before this, we were fetching all of a tenant's users at once
  // with findMany() with no limit — with 10,000 students that means 10,000 objects
  // in memory + a createMany() with 10,000 rows in a single query, which would
  // cause a timeout or a memory crash.
  //
  // The fix: fetch users in batches of 500 using
  // cursor-based pagination, and run createMany() for each batch separately.
  // this keeps memory usage constant no matter how many users there are.
  async broadcastToTenant(data: {
    tenantId: string;
    title: string;
    message: string;
    type: string;
  }) {
    let totalSent = 0;
    let cursor: string | undefined = undefined;

    while (true) {
      const users = await this.prisma.user.findMany({
        where: { tenantId: data.tenantId },
        select: { id: true },
        take: BROADCAST_BATCH_SIZE,
        // cursor-based pagination — faster than skip/offset with large datasets
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      });

      if (users.length === 0) break;

      await this.prisma.notification.createMany({
        data: users.map((u) => ({
          userId:   u.id,
          tenantId: data.tenantId,
          title:    data.title,
          message:  data.message,
          type:     data.type,
        })),
      });

      totalSent += users.length;
      cursor = users[users.length - 1].id;

      // if the batch is smaller than the limit, we're done
      if (users.length < BROADCAST_BATCH_SIZE) break;
    }

    return { sent: totalSent };
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
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
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