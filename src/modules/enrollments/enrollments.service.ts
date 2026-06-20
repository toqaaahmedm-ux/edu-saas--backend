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

    const enrollment = await this.enrollmentsRepository.create(tenantId, studentId, courseId);

    await this.notificationsService.createNotification({
      userId: studentId,
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