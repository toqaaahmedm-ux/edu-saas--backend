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
        owner: { select: { id: true, name: true, email: true, createdAt: true } },
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
        include: {
          plan: { select: { id: true, name: true } },
          // SEC fix: explicit select instead of owner: true, to exclude hashedPassword
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              createdAt: true,
            },
          },
        },
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

  async suspendTenant(id: string, actorId: string) {
    await this.findTenantById(id);
    return this.prisma.tenant.update({
      where: { id },
      data: { status: TenantStatus.SUSPENDED },
    });
  }

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

  async getTenantUsage(tenantId: string) {
    const [userCount, courseCount, enrollmentCount, storageBytes] =
      await Promise.all([
        this.prisma.user.count({ where: { tenantId } }),
        this.prisma.course.count({ where: { tenantId } }),
        this.prisma.enrollment.count({ where: { tenantId } }),
        this.prisma.mediaAsset.aggregate({
          where: { tenantId },
          _sum: { sizeBytes: true },
        }).then(r => r._sum.sizeBytes ?? 0),
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
      return price;
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

  async getTenantAnalytics(tenantId: string) {
    const [
      totalTeachers,
      totalStudents,
      totalCourses,
      totalEnrollments,
      completedEnrollments,
    ] = await Promise.all([
      this.prisma.user.count({ where: { tenantId, role: Role.TEACHER } }),
      this.prisma.user.count({ where: { tenantId, role: Role.STUDENT } }),
      this.prisma.course.count({ where: { tenantId } }),
      this.prisma.enrollment.count({ where: { tenantId } }),
      this.prisma.enrollment.count({ where: { tenantId, status: 'COMPLETED' } }),
    ]);

    const completionRate = totalEnrollments > 0
      ? Math.round((completedEnrollments / totalEnrollments) * 100)
      : 0;

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const activeStudentsThisMonth = await this.prisma.enrollment.findMany({
      where: { tenantId, updatedAt: { gte: startOfMonth } },
      select: { studentId: true },
      distinct: ['studentId'],
    }).then((rows) => rows.length);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const recentEnrollments = await this.prisma.enrollment.findMany({
      where: { tenantId, enrolledAt: { gte: sixMonthsAgo } },
      select: { enrolledAt: true },
    });

    const trendMap: Record<string, number> = {};
    for (let i = 0; i < 6; i++) {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      const key = d.toLocaleString('en', { month: 'short', year: '2-digit' });
      trendMap[key] = 0;
    }
    recentEnrollments.forEach((e) => {
      const key = e.enrolledAt.toLocaleString('en', { month: 'short', year: '2-digit' });
      if (trendMap[key] !== undefined) trendMap[key] += 1;
    });

    const courses = await this.prisma.course.findMany({
      where: { tenantId },
      select: {
        id: true,
        title: true,
        _count: { select: { enrollments: true, certificates: true } },
      },
    });

    const coursePerformance = await Promise.all(
      courses.map(async (c) => {
        const completedCount = await this.prisma.enrollment.count({
          where: { tenantId, courseId: c.id, status: 'COMPLETED' },
        });
        const avgScoreResult = await this.prisma.quizAttempt.aggregate({
          where: { tenantId, quiz: { courseId: c.id }, submittedAt: { not: null } },
          _avg: { score: true },
        });
        return {
          courseId: c.id,
          title: c.title,
          enrolledCount: c._count.enrollments,
          completedCount,
          avgQuizScore: Math.round(avgScoreResult._avg.score ?? 0),
          certificatesIssued: c._count.certificates,
        };
      }),
    );

    const teachers = await this.prisma.user.findMany({
      where: { tenantId, role: Role.TEACHER },
      select: {
        id: true,
        name: true,
        courses: {
          select: {
            id: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    });

    const teacherLeaderboard = await Promise.all(
      teachers.map(async (t) => {
        const courseIds = t.courses.map((c) => c.id);
        const studentCount = t.courses.reduce((sum, c) => sum + c._count.enrollments, 0);
        const completed = courseIds.length
          ? await this.prisma.enrollment.count({
              where: { tenantId, courseId: { in: courseIds }, status: 'COMPLETED' },
            })
          : 0;
        const completionRateForTeacher = studentCount > 0
          ? Math.round((completed / studentCount) * 100)
          : 0;
        return {
          teacherId: t.id,
          name: t.name,
          studentCount,
          completionRate: completionRateForTeacher,
        };
      }),
    );
    teacherLeaderboard.sort((a, b) => b.studentCount - a.studentCount);

    const quizzes = await this.prisma.quiz.findMany({
      where: { tenantId },
      select: { id: true, title: true, passScore: true },
    });

    const quizAnalytics = await Promise.all(
      quizzes.map(async (q) => {
        const attempts = await this.prisma.quizAttempt.findMany({
          where: { quizId: q.id, submittedAt: { not: null } },
          select: { score: true },
        });
        const attemptCount = attempts.length;
        const passCount = attempts.filter((a) => a.score >= q.passScore).length;
        const avgScore = attemptCount > 0
          ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attemptCount)
          : 0;
        return {
          quizId: q.id,
          title: q.title,
          attempts: attemptCount,
          passRate: attemptCount > 0 ? Math.round((passCount / attemptCount) * 100) : 0,
          avgScore,
        };
      }),
    );

    const activeEnrollments = await this.prisma.enrollment.findMany({
      where: { tenantId },
      select: { progress: true },
    });

    const distribution = { '0-25': 0, '26-50': 0, '51-75': 0, '76-100': 0 };
    activeEnrollments.forEach((e) => {
      if (e.progress <= 25) distribution['0-25']++;
      else if (e.progress <= 50) distribution['26-50']++;
      else if (e.progress <= 75) distribution['51-75']++;
      else distribution['76-100']++;
    });

    return {
      overview: {
        totalTeachers,
        totalStudents,
        totalCourses,
        totalEnrollments,
        completedEnrollments,
        completionRate,
        activeStudentsThisMonth,
      },
      enrollmentTrend: Object.entries(trendMap).map(([month, count]) => ({ month, count })),
      coursePerformance,
      teacherLeaderboard,
      quizAnalytics,
      studentProgressDistribution: Object.entries(distribution).map(([range, count]) => ({
        range,
        count,
      })),
    };
  }

  // --- Academic Oversight (REQ-09 / REQ-10) ---
  // Cross-course view for the tenant ADMIN: at-risk students (low
  // attendance or failing grade) and pass rate per course, aggregated
  // across every course in the tenant rather than one teacher's own.
  async getAcademicOverview(tenantId: string) {
    const students = await this.prisma.user.findMany({
      where: { tenantId, role: Role.STUDENT },
      select: { id: true, name: true, email: true },
    });

    const atRiskStudents: {
      studentId: string;
      name: string;
      email: string;
      attendanceRate: number;
      avgGrade: number | null;
      reason: string;
    }[] = [];

    for (const student of students) {
      const attendanceRecords = await this.prisma.attendance.findMany({
        where: { tenantId, studentId: student.id },
        select: { status: true },
      });

      const totalMarked = attendanceRecords.length;
      const presentCount = attendanceRecords.filter(
        (r) => r.status === 'PRESENT' || r.status === 'LATE',
      ).length;
      const attendanceRate = totalMarked > 0
        ? Math.round((presentCount / totalMarked) * 100)
        : 100;

      const grades = await this.prisma.grade.findMany({
        where: { tenantId, studentId: student.id },
        select: { score: true },
      });
      const avgGrade = grades.length > 0
        ? Math.round(
            grades.reduce((sum, g) => sum + Number(g.score), 0) / grades.length,
          )
        : null;

      const lowAttendance = totalMarked > 0 && attendanceRate < 75;
      const failingGrade = avgGrade !== null && avgGrade < 60;

      if (lowAttendance || failingGrade) {
        const reasons: string[] = [];
        if (lowAttendance) reasons.push(`Attendance ${attendanceRate}%`);
        if (failingGrade) reasons.push(`Avg grade ${avgGrade}%`);

        atRiskStudents.push({
          studentId: student.id,
          name: student.name,
          email: student.email,
          attendanceRate,
          avgGrade,
          reason: reasons.join(' · '),
        });
      }
    }

    const courses = await this.prisma.course.findMany({
      where: { tenantId },
      select: { id: true, title: true },
    });

    const coursePassRates = await Promise.all(
      courses.map(async (c) => {
        const grades = await this.prisma.grade.findMany({
          where: { tenantId, courseId: c.id },
          select: { score: true },
        });
        const total = grades.length;
        const passing = grades.filter((g) => Number(g.score) >= 60).length;
        return {
          courseId: c.id,
          title: c.title,
          totalGraded: total,
          passRate: total > 0 ? Math.round((passing / total) * 100) : null,
        };
      }),
    );

    return {
      atRiskStudents,
      coursePassRates,
    };
  }

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

  async findAllPlans() {
    return this.prisma.plan.findMany({
      where: { isArchived: false },
      include: { features: true, _count: { select: { tenants: true } } },
      orderBy: { price: 'asc' },
    });
  }

  async getAcademicReports(tenantId: string) {
    const courses = await this.prisma.course.findMany({
      where: { tenantId },
      select: { id: true, title: true },
    });

    const attendanceByCourse = await Promise.all(courses.map(async (c) => {
      const lessons = await this.prisma.lesson.findMany({
        where: { courseId: c.id, tenantId },
        select: { id: true },
      });
      const lessonIds = lessons.map((l) => l.id);
      const records = lessonIds.length
        ? await this.prisma.attendance.findMany({
            where: { tenantId, lessonId: { in: lessonIds } },
            select: { studentId: true, status: true },
          })
        : [];
      const total = records.length;
      const present = records.filter((r) => r.status === 'PRESENT').length;
      return {
        courseId: c.id,
        title: c.title,
        totalLessons: lessons.length,
        totalRecords: total,
        attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
      };
    }));

    const gradesByCourse = await Promise.all(courses.map(async (c) => {
      const grades = await this.prisma.grade.findMany({
        where: { tenantId, courseId: c.id },
        select: { score: true },
      });
      const avg = grades.length
        ? grades.reduce((s, g) => s + Number(g.score), 0) / grades.length
        : 0;
      const failing = grades.filter((g) => Number(g.score) < 60).length;
      return {
        courseId: c.id,
        title: c.title,
        studentsGraded: grades.length,
        avgScore: Math.round(avg * 100) / 100,
        failingCount: failing,
      };
    }));

    const allAttendance = await this.prisma.attendance.findMany({
      where: { tenantId },
      select: { studentId: true, status: true, lesson: { select: { courseId: true } } },
    });

    const attendanceMap: Record<string, { present: number; total: number; studentId: string; courseId: string }> = {};
    allAttendance.forEach((a) => {
      const key = `_`;
      if (!attendanceMap[key]) {
        attendanceMap[key] = { present: 0, total: 0, studentId: a.studentId, courseId: a.lesson.courseId };
      }
      attendanceMap[key].total++;
      if (a.status === 'PRESENT') attendanceMap[key].present++;
    });

    const atRiskFromAttendance = Object.values(attendanceMap)
      .filter((v) => v.total > 0 && (v.present / v.total) * 100 < 75)
      .map((v) => ({
        studentId: v.studentId,
        courseId: v.courseId,
        reason: 'LOW_ATTENDANCE' as const,
        attendanceRate: Math.round((v.present / v.total) * 100),
      }));

    const lowGrades = await this.prisma.grade.findMany({
      where: { tenantId, score: { lt: 60 } },
      select: { studentId: true, courseId: true, score: true },
    });
    const atRiskFromGrades = lowGrades.map((g) => ({
      studentId: g.studentId,
      courseId: g.courseId,
      reason: 'LOW_GRADE' as const,
      score: g.score,
    }));

    const combined = [...atRiskFromAttendance, ...atRiskFromGrades];
    const studentIds = [...new Set(combined.map((c) => c.studentId))];

    const students = studentIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    const courseMap = Object.fromEntries(courses.map((c) => [c.id, c.title]));

    const atRiskStudents = combined.map((c) => ({
      ...c,
      studentName: studentMap[c.studentId]?.name ?? 'Unknown',
      studentEmail: studentMap[c.studentId]?.email ?? '',
      courseTitle: courseMap[c.courseId] ?? 'Unknown',
    }));

    return { attendanceByCourse, gradesByCourse, atRiskStudents };
  }
}