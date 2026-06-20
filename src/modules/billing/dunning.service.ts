import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * BILL-03: Dunning Service
 * بيشتغل كل يوم الساعة 2 الصبح:
 * 1. يشوف الـ subscriptions اللي انتهت + لسه ACTIVE → يحولها PAST_DUE
 * 2. يشوف الـ PAST_DUE اللي فات عليها grace period (3 أيام) → يعلق الـ tenant
 * 3. يشوف الـ tenants المعلقين اللي دفعوا → يرجعهم ACTIVE
 */
@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  // Grace period: 3 أيام بعد انتهاء الـ subscription قبل التعليق
  private readonly GRACE_PERIOD_DAYS = 3;

  constructor(private prisma: PrismaService) {}

  // ── Cron: كل يوم الساعة 2 الصبح ────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runDunningCycle() {
    this.logger.log('⏰ Dunning cycle started');
    await Promise.all([
      this.markExpiredSubscriptions(),
      this.suspendPastDueTenants(),
    ]);
    this.logger.log('✅ Dunning cycle completed');
  }

  /**
   * Step 1: ACTIVE subscriptions اللي currentPeriodEnd فات → PAST_DUE
   */
  async markExpiredSubscriptions() {
    const now = new Date();

    const expired = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lt: now },
      },
      include: { tenant: true },
    });

    if (expired.length === 0) return;

    this.logger.log(`📋 Found ${expired.length} expired subscriptions`);

    for (const sub of expired) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'PAST_DUE' },
      });

      // سجّل في audit log
      await this.prisma.auditLog.create({
        data: {
          tenantId: sub.tenantId,
          action: 'SUBSCRIPTION_EXPIRED',
          target: sub.id,
          metadata: {
            planId: sub.planId,
            expiredAt: now.toISOString(),
          },
        },
      });

      this.logger.warn(
        `⚠️  Subscription ${sub.id} → PAST_DUE (tenant: ${sub.tenant.name})`,
      );
    }
  }

  /**
   * Step 2: PAST_DUE اللي فات عليها GRACE_PERIOD_DAYS → علّق الـ tenant
   */
  async suspendPastDueTenants() {
    const graceCutoff = new Date();
    graceCutoff.setDate(graceCutoff.getDate() - this.GRACE_PERIOD_DAYS);

    const pastDue = await this.prisma.subscription.findMany({
      where: {
        status: 'PAST_DUE',
        currentPeriodEnd: { lt: graceCutoff },
      },
      include: { tenant: true },
    });

    if (pastDue.length === 0) return;

    this.logger.log(`🔴 Suspending ${pastDue.length} tenants past grace period`);

    for (const sub of pastDue) {
      // علّق الـ subscription
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'CANCELLED' },
      });

      // علّق الـ tenant
      await this.prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { status: 'SUSPENDED' },
      });

      // سجّل في audit log
      await this.prisma.auditLog.create({
        data: {
          tenantId: sub.tenantId,
          action: 'TENANT_SUSPENDED',
          target: sub.tenantId,
          metadata: {
            reason: 'PAYMENT_FAILED',
            gracePeriodDays: this.GRACE_PERIOD_DAYS,
            suspendedAt: new Date().toISOString(),
          },
        },
      });

      this.logger.error(
        `🚫 Tenant ${sub.tenant.name} SUSPENDED (sub: ${sub.id})`,
      );
    }
  }

  /**
   * يُستدعى يدوياً من BillingService لما Stripe يأكد الدفع:
   * يرجع الـ tenant ACTIVE لو كان SUSPENDED
   */
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

  /**
   * SuperAdmin: تشغيل الـ dunning يدوياً (للتست)
   */
  async runManually() {
    this.logger.log('🔧 Manual dunning cycle triggered');
    await this.runDunningCycle();
    return { message: 'Dunning cycle completed' };
  }
}