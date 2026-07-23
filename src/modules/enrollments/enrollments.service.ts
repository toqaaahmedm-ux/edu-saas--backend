import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly notificationsService: NotificationsService,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  async enroll(tenantId: string, studentId: string, courseId: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Course is not available for enrollment');
    }

    if (Number(course.price) > 0) {
      throw new BadRequestException('Payment required — Stripe integration pending');
    }

    if (course.instructorId === studentId) {
      throw new BadRequestException('Cannot enroll in your own course');
    }

    const existing = await this.enrollmentsRepository.findByStudentAndCourse(studentId, courseId);
    if (existing) throw new ConflictException('Already enrolled');

    const subscription = await this.billingService.getTenantSubscription(tenantId);

    const enrollment = await this.prisma.$transaction(async (tx) => {
      if (subscription) {
        const maxStudents = subscription.plan.maxStudents;
        const currentStudents = await tx.enrollment.count({
          where: { tenantId },
        });
        if (currentStudents >= maxStudents) {
          throw new ForbiddenException(
            `Student limit reached (${maxStudents}). Please upgrade your plan.`,
          );
        }
      }

      const created = await tx.enrollment.create({
        data: { tenantId, studentId, courseId },
      });

      if (course.classSectionId) {
        const student = await tx.user.findUnique({
          where: { id: studentId },
          select: { classSectionId: true },
        });

        if (student && !student.classSectionId) {
          await tx.user.update({
            where: { id: studentId },
            data: { classSectionId: course.classSectionId },
          });
        }
      }

      return created;
    });

    await this.notificationsService.createNotification({
      userId: studentId,
      tenantId,
      title: 'تم التسجيل بنجاح! 🎉',
      message: `تم تسجيلك في كورس "${course.title}"`,
      type: 'ENROLLMENT',
    });

    return enrollment;
  }

  // ─── Admin assigns student to course (REQ-03) ──────────────────────────
  // Skips the payment gate entirely (admin decides it's free/paid outside
  // the system) and still respects the plan's maxStudents limit, same
  // transaction pattern as enroll() to avoid the same race condition.
  async adminEnroll(tenantId: string, studentId: string, courseId: string) {
    const course = await this.coursesRepository.findById(courseId, tenantId);
    if (!course) throw new NotFoundException('Course not found in this tenant');

    const student = await this.prisma.user.findFirst({
      where: { id: studentId, tenantId, role: Role.STUDENT },
    });
    if (!student) throw new NotFoundException('Student not found in this tenant');

    const existing = await this.enrollmentsRepository.findByStudentAndCourse(studentId, courseId);
    if (existing) throw new ConflictException('Student is already enrolled in this course');

    const subscription = await this.billingService.getTenantSubscription(tenantId);

    const enrollment = await this.prisma.$transaction(async (tx) => {
      if (subscription) {
        const maxStudents = subscription.plan.maxStudents;
        const currentStudents = await tx.enrollment.count({
          where: { tenantId },
        });
        if (currentStudents >= maxStudents) {
          throw new ForbiddenException(
            `Student limit reached (${maxStudents}). Please upgrade your plan.`,
          );
        }
      }

      const created = await tx.enrollment.create({
        data: { tenantId, studentId, courseId },
      });

      if (course.classSectionId) {
        const existingLink = await tx.user.findUnique({
          where: { id: studentId },
          select: { classSectionId: true },
        });

        if (existingLink && !existingLink.classSectionId) {
          await tx.user.update({
            where: { id: studentId },
            data: { classSectionId: course.classSectionId },
          });
        }
      }

      return created;
    });

    await this.notificationsService.createNotification({
      userId: studentId,
      tenantId,
      title: 'تم تسجيلك في كورس جديد',
      message: `قام المسؤول بتسجيلك في كورس "${course.title}"`,
      type: 'ADMIN_ENROLLMENT',
    });

    return enrollment;
  }

  async removeEnrollment(tenantId: string, id: string) {
    const enrollment = await this.enrollmentsRepository.findById(id);
    if (!enrollment || enrollment.tenantId !== tenantId) {
      throw new NotFoundException('Enrollment not found in this tenant');
    }
    await this.prisma.enrollment.delete({ where: { id } });
    return { message: 'Enrollment removed successfully' };
  }

  async getMyEnrollments(tenantId: string, studentId: string) {
    return this.enrollmentsRepository.findByStudentId(tenantId, studentId);
  }

  async getEnrollmentsByCourse(tenantId: string, courseId: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
    return this.enrollmentsRepository.findByCourseId(tenantId, courseId);
  }

  async updateProgress(id: string, studentId: string, progress: number) {
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const enrollment = await this.enrollmentsRepository.findById(id);
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    if (enrollment.studentId !== studentId) {
      throw new ForbiddenException('You do not own this enrollment');
    }

    if (progress === 100) {
      return this.enrollmentsRepository.updateProgressAndStatus(id, progress, 'COMPLETED');
    }

    return this.enrollmentsRepository.updateProgress(id, progress);
  }
}
