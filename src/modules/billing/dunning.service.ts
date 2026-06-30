import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);
  private readonly GRACE_PERIOD_DAYS = 3;

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDunningCycle() {
    this.logger.log('⏰ Dunning cycle started');
    await Promise.all([
      this.markExpiredSubscriptions(),
      this.suspendPastDueTenants(),
    ]);
    this.logger.log('✅ Dunning cycle completed');
  }

  async markExpiredSubscriptions() {
    const now = new Date();

    // ✅ BE-M04: جيب الـ IDs الأول بدل ما نعمل N updates
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },
      select: { id: true, tenantId: true, planId: true },
    });

    if (expired.length === 0) return;

    this.logger.log(`📋 Found ${expired.length} expired subscriptions`);

    // ✅ BE-M04: updateMany بدل حلقة for
    await this.prisma.subscription.updateMany({
      where: { id: { in: expired.map((s) => s.id) } },
      data: { status: 'PAST_DUE' },
    });

    // ✅ BE-M04: createMany بدل حلقة for
    await this.prisma.auditLog.createMany({
      data: expired.map((sub) => ({
        tenantId: sub.tenantId,
        action: 'SUBSCRIPTION_EXPIRED',
        target: sub.id,
        metadata: {
          planId: sub.planId,
          expiredAt: now.toISOString(),
        },
      })),
    });

    this.logger.warn(`⚠️  ${expired.length} subscriptions → PAST_DUE`);
  }

  async suspendPastDueTenants() {
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - this.GRACE_PERIOD_DAYS);

    // ✅ BE-M04: جيب الـ IDs الأول
    const pastDue = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        currentPeriodEnd: { lt: graceCutoff },
      },
      select: { id: true, tenantId: true },
    });

    if (pastDue.length === 0) return;

    this.logger.log(`🔴 Suspending ${pastDue.length} tenants past grace period`);

    const tenantIds = pastDue.map((s) => s.tenantId);
    const subIds = pastDue.map((s) => s.id);
    const now = new Date();

    // ✅ BE-M04: updateMany للـ subscriptions
    await this.prisma.subscription.updateMany({
      where: { id: { in: subIds } },
      data: { status: 'CANCELLED' },
    });

    // ✅ BE-M04: updateMany للـ tenants
    await this.prisma.tenant.updateMany({
      where: { id: { in: tenantIds } },
      data: { status: 'SUSPENDED' },
    });

    // ✅ BE-M04: createMany للـ audit logs
    await this.prisma.auditLog.createMany({
      data: pastDue.map((sub) => ({
        tenantId: sub.tenantId,
        action: 'TENANT_SUSPENDED',
        target: sub.tenantId,
        metadata: {
          reason: 'PAYMENT_FAILED',
          gracePeriodDays: this.GRACE_PERIOD_DAYS,
          suspendedAt: now.toISOString(),
        },
      })),
    });

    this.logger.error(`🚫 ${pastDue.length} tenants SUSPENDED`);
  }

  async reactivateTenant(tenantId: string, planId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) return;

    if (tenant.status === 'SUSPENDED') {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { status: 'ACTIVE', planId },
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          action: 'TENANT_REACTIVATED',
          target: tenantId,
          metadata: { planId, reactivatedAt: new Date().toISOString() },
        },
      });

      this.logger.log(`✅ Tenant ${tenant.name} REACTIVATED`);
    }
  }

  async runManually() {
    this.logger.log('🔧 Manual dunning cycle triggered');
    await this.runDunningCycle();
    return { message: 'Dunning cycle completed' };
  }
}