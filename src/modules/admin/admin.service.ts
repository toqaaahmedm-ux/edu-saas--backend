import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { MailService } from '../mail/mail.service';
import { TenantStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const TRIAL_DAYS = 14;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
    private readonly mailService: MailService,
  ) { }

  // ─── Tenant CRUD ─────────────────────────────────────

  async findAllTenants(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          plan: { select: { id: true, name: true, price: true } },
          _count: { select: { users: true, courses: true, enrollments: true } },
        },
      }),
      this.prisma.tenant.count(),
    ]);
    return { tenants, total, page, limit };
  }

  async findTenantById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        plan: true,
        // Needed for the Tenant Detail page — without this, the UI has
        // no way to show who the tenant's admin actually is.
        owner: { select: { id: true, name: true, email: true, createdAt: true } },
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { users: true, courses: true, enrollments: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  // SA-C01 fix: creates the Tenant AND its first ADMIN (owner) atomically.
  async createTenant(data: {
    name: string;
    subdomain: string;
    planId?: string;
    ownerName: string;
    ownerEmail: string;
    ownerPassword: string;
  }) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { subdomain: data.subdomain },
    });
    if (existingTenant) throw new BadRequestException('Subdomain already taken');

    const existingOwner = await this.prisma.user.findFirst({
      where: { email: data.ownerEmail },
    });
    if (existingOwner) throw new BadRequestException('Owner email already in use');

    const hashedPassword = await bcrypt.hash(data.ownerPassword, 10);
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);

    const tenant = await this.prisma.$transaction(async (tx) => {
      const newTenant = await tx.tenant.create({
        data: {
          name: data.name,
          subdomain: data.subdomain,
          planId: data.planId ?? null,
          status: TenantStatus.TRIAL,
          trialEndsAt,
        },
      });

      const owner = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          name: data.ownerName,
          email: data.ownerEmail,
          hashedPassword,
          role: Role.ADMIN,
        },
      });

      return tx.tenant.update({
        where: { id: newTenant.id },
        data: { ownerUserId: owner.id },
        include: { plan: { select: { id: true, name: true } }, owner: true },
      });
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.mailService
      .sendTenantWelcome(tenant.owner!.email, {
        tenantName: tenant.name,
        ownerName: tenant.owner!.name,
        loginUrl: `${frontendUrl}/login`,
      })
      .catch(() => { });

    return tenant;
  }

  async updateTenant(id: string, data: {
    name?: string;
    status?: TenantStatus;
    planId?: string;
    customDomain?: string;
  }) {
    await this.findTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data,
      include: { plan: { select: { id: true, name: true } } },
    });
  }

  // Sprint 1 fix: removed the manual auditLog.create call here — @AuditAction
  // on the controller (admin.controller.ts) already logs this via the
  // interceptor. Keeping both was writing two audit rows per suspend action.
  async suspendTenant(id: string, actorId: string) {
    await this.findTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
    });
  }

  // Sprint 2 — SuperAdmin: manual trial extension.
  async extendTrial(id: string, days: number, actorId: string) {
    const tenant = await this.findTenantById(id);
    const currentEnd = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : new Date();
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + days);

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { trialEndsAt: newEnd },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'TRIAL_EXTENDED',
        target: id,
        tenantId: id,
        metadata: { days, newTrialEndsAt: newEnd },
      },
    });

    return updated;
  }

  // SA-C02 fix: بدل ما يحدّث tenant.planId لوحده، بقى بيستخدم BillingService
  // كمصدر قانوني واحد بيحدّث tenant.planId و Subscription مع بعض في transaction واحدة
  async assignPlan(tenantId: string, planId: string, actorId: string) {
    const { tenant } = await this.billingService.assignPlanToTenant(tenantId, planId);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PLAN_ASSIGNED',
        target: tenantId,
        tenantId,
        metadata: { planId, planName: tenant.plan?.name },
      },
    });

    return tenant;
  }

  // ─── Usage Metrics ────────────────────────────────────

  async getTenantUsage(tenantId: string) {
    const [userCount, courseCount, enrollmentCount, storageBytes] =
      await Promise.all([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.course.count({ where: { tenantId } }),
        this.prisma.enrollment.count({ where: { tenantId } }),
        Promise.resolve(0),
      ]);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { plan: true },
    });

    return {
      tenantId,
      users: { current: userCount, limit: tenant?.plan?.maxStudents ?? null },
      courses: { current: courseCount, limit: tenant?.plan?.maxCourses ?? null },
      enrollments: { current: enrollmentCount },
      storageGb: {
        current: +(storageBytes / 1e9).toFixed(2),
        limit: tenant?.plan?.maxStorageGb ?? null,
      },
    };
  }

  // ─── Platform-level Stats ─────────────────────────────

  async getPlatformStats() {
    const [totalTenants, activeTenants, totalUsers, totalCourses, totalEnrollments] =
      await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
        this.prisma.user.count(),
        this.prisma.course.count(),
        this.prisma.enrollment.count(),
      ]);

    return { totalTenants, activeTenants, totalUsers, totalCourses, totalEnrollments };
  }
// Platform revenue analytics for the SuperAdmin dashboard.
  // MRR normalizes every billing cycle down to a monthly figure so plans
  // on different cycles (monthly/quarterly/annual) can be summed
  // meaningfully — an annual plan's real monthly contribution is
  // price/12, not its sticker price.
  async getPlatformAnalytics() {
    const activeSubscriptions = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE' },
      include: {
        plan: { select: { id: true, name: true, price: true, billingCycle: true } },
        tenant: { select: { id: true, name: true } },
      },
    });

    const monthlyValue = (price: number, cycle: string) => {
      if (cycle === 'ANNUAL') return price / 12;
      if (cycle === 'QUARTERLY') return price / 3;
      return price; // MONTHLY
    };

    let mrr = 0;
    const revenueByPlan: Record<string, { planName: string; tenantCount: number; mrr: number }> = {};

    for (const sub of activeSubscriptions) {
      const monthly = monthlyValue(Number(sub.plan.price), sub.plan.billingCycle);
      mrr += monthly;

      const key = sub.plan.id;
      if (!revenueByPlan[key]) {
        revenueByPlan[key] = { planName: sub.plan.name, tenantCount: 0, mrr: 0 };
      }
      revenueByPlan[key].tenantCount += 1;
      revenueByPlan[key].mrr += monthly;
    }

    // Tenant growth over the last 6 months, bucketed by creation month.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const recentTenants = await this.prisma.tenant.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });

    const growthMap: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      const key = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      growthMap[key] = 0;
    }
    recentTenants.forEach((t) => {
      const key = t.createdAt.toLocaleString('en', { month: 'short', year: '2-digit' });
      if (growthMap[key] !== undefined) growthMap[key] += 1;
    });

    // Trial conversion: of tenants that ever had a trial (trialEndsAt is
    // set), what fraction are now ACTIVE vs still TRIAL/other. This is a
    // simple snapshot ratio, not a true cohort analysis — we don't keep
    // status-change history, so we can't tell exactly when a trial
    // converted, only whether it currently has (status=ACTIVE) or hasn't.
    const [everTrialed, convertedFromTrial] = await Promise.all([
      this.prisma.tenant.count({ where: { trialEndsAt: { not: null } } }),
      this.prisma.tenant.count({ where: { trialEndsAt: { not: null }, status: 'ACTIVE' } }),
    ]);

    const trialConversionRate = everTrialed > 0
      ? Math.round((convertedFromTrial / everTrialed) * 100)
      : 0;

    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      revenueByPlan: Object.values(revenueByPlan),
      tenantGrowth: Object.entries(growthMap).map(([month, count]) => ({ month, count })),
      trialConversionRate,
      everTrialed,
      convertedFromTrial,
    };
  }
  
  // ─── Audit Logs ───────────────────────────────────────

  async getAuditLogs(tenantId?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = tenantId ? { tenantId } : {};
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { logs, total, page, limit };
  }

  // ─── Plans ────────────────────────────────────────────

  async findAllPlans() {
    return this.prisma.plan.findMany({
      where: { isArchived: false },
      include: { features: true, _count: { select: { tenants: true } } },
      orderBy: { price: 'asc' },
    });
  }
}