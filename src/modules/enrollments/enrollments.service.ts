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

@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly coursesRepository: CoursesRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async enroll(studentId: string, courseId: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');

    // BL-01: رفض الكورسات اللي مش PUBLISHED
    if (course.status !== 'PUBLISHED') {
      throw new BadRequestException('Course is not available for enrollment');
    }

    // BL-01: رفض الكورسات المدفوعة (هيتبدل بـ Stripe لاحقاً)
    if (Number(course.price) > 0) {
      throw new BadRequestException('Payment required — Stripe integration pending');
    }

    // BL-07: المدرس ميقدرش يسجل في كورسه هو
    if (course.instructorId === studentId) {
      throw new BadRequestException('Cannot enroll in your own course');
    }

    // منع التسجيل المكرر
    const existing = await this.enrollmentsRepository.findByStudentAndCourse(
      studentId,
      courseId,
    );
    if (existing) throw new ConflictException('Already enrolled');

    const enrollment = await this.enrollmentsRepository.create(studentId, courseId);

    // إرسال notification للطالب
    await this.notificationsService.createNotification({
      userId: studentId,
      title: 'تم التسجيل بنجاح! 🎉',
      message: `تم تسجيلك في كورس "${course.title}"`,
      type: 'ENROLLMENT',
    });

    return enrollment;
  }

  async getMyEnrollments(studentId: string) {
    return this.enrollmentsRepository.findByStudentId(studentId);
  }

  async getEnrollmentsByCourse(courseId: string) {
    const course = await this.coursesRepository.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
    return this.enrollmentsRepository.findByCourseId(courseId);
  }

  async updateProgress(id: string, studentId: string, progress: number) {
    // BL-04: التحقق إن الـ progress بين 0 و 100
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const enrollment = await this.enrollmentsRepository.findById(id);
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    // التحقق إن الطالب هو صاحب الـ enrollment ده
    if (enrollment.studentId !== studentId) {
      throw new ForbiddenException('You do not own this enrollment');
    }

    // BL-04: لو الـ progress وصل 100، غير الـ status لـ COMPLETED
    if (progress === 100) {
      return this.enrollmentsRepository.updateProgressAndStatus(id, progress, 'COMPLETED');
    }

    return this.enrollmentsRepository.updateProgress(id, progress);
  }
}