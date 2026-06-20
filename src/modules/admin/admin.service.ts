import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
        subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { users: true, courses: true, enrollments: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async createTenant(data: {
    name: string;
    subdomain: string;
    planId?: string;
    ownerEmail?: string;
    ownerName?: string;
    ownerPassword?: string;
  }) {
    const existing = await this.prisma.tenant.findUnique({
      where: { subdomain: data.subdomain },
    });
    if (existing) throw new BadRequestException('Subdomain already taken');

    return this.prisma.tenant.create({
      data: {
        name: data.name,
        subdomain: data.subdomain,
        planId: data.planId ?? null,
        status: TenantStatus.TRIAL,
      },
      include: { plan: { select: { id: true, name: true } } },
    });
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

  async suspendTenant(id: string, actorId: string) {
    await this.findTenantById(id);
    const tenant = await this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
    });
    await this.prisma.auditLog.create({
      data: { actorId, action: 'TENANT_SUSPENDED', target: id, tenantId: id },
    });
    return tenant;
  }

  async assignPlan(tenantId: string, planId: string, actorId: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { planId },
      include: { plan: { select: { id: true, name: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PLAN_ASSIGNED',
        target: tenantId,
        tenantId,
        metadata: { planId, planName: plan.name },
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
        Promise.resolve(0), // placeholder — wire to MediaAsset when built
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