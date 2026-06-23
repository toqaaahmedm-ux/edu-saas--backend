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

  // ── بيرسل لكل طلاب tenant معين ───────────────────────────────
  // PERF-19 FIX: قبل كده كنا بنجيب كل مستخدمي الـ tenant دفعة واحدة
  // بـ findMany() من غير حد — مع 10,000 طالب ده معناه 10,000 object
  // في الذاكرة + createMany() بـ 10,000 row في استعلام واحد، وده كان
  // هيعمل timeout أو memory crash.
  //
  // الحل: بنجيب المستخدمين على دفعات (batches) بحجم 500 باستخدام
  // cursor-based pagination، وبنعمل createMany() لكل دفعة على حدة.
  // ده بيخلي الـ memory usage ثابت بغض النظر عن عدد المستخدمين.
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
        // cursor-based pagination — أسرع من skip/offset مع بيانات كبيرة
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

      // لو الدفعة أقل من الحد الأقصى، يبقى خلصنا
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