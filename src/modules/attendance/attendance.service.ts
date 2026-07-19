import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceRepository } from './attendance.repository';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private readonly attendanceRepository: AttendanceRepository) {}

  // same ownership pattern as ModulesService/AssignmentsService, but
  // starting from the lesson since attendance is tracked per lesson,
  // not per course directly
  private async assertLessonOwnership(
    lessonId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    const lesson = await this.attendanceRepository.findLessonWithCourse(lessonId, tenantId);
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (userRole !== 'ADMIN' && lesson.course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }
    return lesson;
  }

  async mark(
    lessonId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    records: { studentId: string; status: AttendanceStatus; note?: string }[],
  ) {
    await this.assertLessonOwnership(lessonId, tenantId, userId, userRole);
    return this.attendanceRepository.bulkUpsert(tenantId, lessonId, records);
  }

  async getByLesson(
    lessonId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertLessonOwnership(lessonId, tenantId, userId, userRole);
    return this.attendanceRepository.findByLesson(lessonId, tenantId);
  }

  async getMyAttendance(lessonId: string, studentId: string, tenantId: string) {
    return this.attendanceRepository.findByStudentAndLesson(lessonId, studentId, tenantId);
  }

  async getStudentCourseSummary(courseId: string, studentId: string, tenantId: string) {
    const records = await this.attendanceRepository.findByStudentAndCourse(
      courseId, studentId, tenantId,
    );
    const present = records.filter((r) => r.status === 'PRESENT').length;
    const total = records.length;
    return {
      records,
      totalLessons: total,
      present,
      // avoid division by zero when the course has no attendance data yet
      attendanceRate: total > 0 ? Math.round((present / total) * 100) : 0,
    };
  }
}