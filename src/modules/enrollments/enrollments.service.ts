import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
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

    const existing = await this.enrollmentsRepository.findByStudentAndCourse(studentId, courseId);
    if (existing) throw new ConflictException('Already enrolled');

    const enrollment = await this.enrollmentsRepository.create(studentId, courseId);

    // إشعار للطالب
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
    if (progress < 0 || progress > 100) {
      throw new BadRequestException('Progress must be between 0 and 100');
    }

    const enrollment = await this.enrollmentsRepository.findById(id);
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    if (enrollment.studentId !== studentId) {
      throw new ForbiddenException('You do not own this enrollment');
    }

    return this.enrollmentsRepository.updateProgress(id, progress);
  }
}