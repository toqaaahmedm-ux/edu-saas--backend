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

    // FEAT-04: التحقق من حد الطلاب في خطة الـ tenant
    const subscription = await this.billingService.getTenantSubscription(tenantId);

    // CRIT-11 FIX: قبل كده الفحص (count) وعملية الإنشاء (create) كانوا
    // عمليتين منفصلتين — طلبين متزامنين كانوا ممكن يعدّوا فحص الحد
    // المسموح به في نفس اللحظة (race condition) ويتسجلوا الاتنين رغم
    // إن الخطة وصلت لحدها. دلوقتي بنلف الفحص والإنشاء في transaction
    // واحدة، فمفيش طلب تاني يقدر "يشوف" حالة قديمة للعدّاد أثناء ما إحنا
    // لسه بنسجل الطلب الحالي.
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

      // NEW: link the student to the course's class section (if it has one).
      // This is what makes attendance rolls, section-wide announcements,
      // etc. show the right roster once a student enrolls in a SCHOOL/
      // UNIVERSITY-type course that's tied to a specific section.
      //
      // Note: User.classSectionId is a single field (a student belongs to
      // one section at a time), not a list. If the student is already
      // linked to a *different* section, we deliberately don't overwrite
      // it here — enrolling in a course shouldn't silently move someone
      // out of their existing homeroom. We only fill it in when it's empty.
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