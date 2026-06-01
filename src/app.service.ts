import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'EduSaaS API is running!';
  }

  async getAdminStats() {
    const [totalUsers, totalCourses, totalEnrollments, totalCertificates] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.course.count(),
        this.prisma.enrollment.count(),
        this.prisma.certificate.count(),
      ]);

    // ── NEW-07: إيرادات حقيقية من DB ──
    const revenueResult = await this.prisma.enrollment.findMany({
      where: { status: 'ACTIVE' },
      include: {
        course: { select: { price: true } },
      },
    });

    const totalRevenue = revenueResult.reduce((sum, enrollment) => {
      return sum + (Number(enrollment.course.price) || 0);
    }, 0);

    const activeStudents = await this.prisma.user.count({
      where: { role: 'STUDENT' },
    });

    return {
      totalUsers,
      totalCourses,
      totalEnrollments,
      totalCertificates,
      totalRevenue,        // ← حقيقي من DB
      activeStudents,      // ← عدد الطلاب النشطين
    };
  }
}