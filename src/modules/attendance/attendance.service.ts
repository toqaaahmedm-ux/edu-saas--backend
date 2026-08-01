import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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

  // --- excuse flow ---

  // student submits a reason (+ optional file already uploaded via
  // /upload/document) for one of their own ABSENT records
  async requestExcuse(
    attendanceId: string,
    studentId: string,
    tenantId: string,
    reason: string,
    fileUrl?: string,
  ) {
    const record = await this.attendanceRepository.findByIdWithLessonCourse(attendanceId, tenantId);
    if (!record) throw new NotFoundException('Attendance record not found');
    if (record.studentId !== studentId) {
      throw new ForbiddenException('This attendance record does not belong to you');
    }
    if (record.status !== 'ABSENT') {
      throw new BadRequestException('You can only request an excuse for an absence');
    }
    if (record.excuseStatus === 'PENDING') {
      throw new BadRequestException('An excuse request is already pending for this absence');
    }
    return this.attendanceRepository.requestExcuse(attendanceId, tenantId, reason, fileUrl);
  }

  // teacher/admin approves or rejects a pending excuse; approving flips
  // the attendance status itself to EXCUSED
  async reviewExcuse(
    attendanceId: string,
    tenantId: string,
    reviewerId: string,
    reviewerRole: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    const record = await this.attendanceRepository.findByIdWithLessonCourse(attendanceId, tenantId);
    if (!record) throw new NotFoundException('Attendance record not found');
    if (reviewerRole !== 'ADMIN' && record.lesson.course.instructorId !== reviewerId) {
      throw new ForbiddenException('You do not own this course');
    }
    if (record.excuseStatus !== 'PENDING') {
      throw new BadRequestException('This excuse request is not pending review');
    }
    return this.attendanceRepository.reviewExcuse(attendanceId, decision, reviewerId);
  }
}
