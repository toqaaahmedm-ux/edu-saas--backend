import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceStatus } from '@prisma/client';

@Injectable()
export class AttendanceRepository {
  constructor(private prisma: PrismaService) {}

  // needed to check ownership (lesson -> course -> instructorId) before
  // letting a teacher mark attendance for it
  findLessonWithCourse(lessonId: string, tenantId: string) {
    return this.prisma.lesson.findFirst({
      where: { id: lessonId, tenantId },
      include: { course: { select: { id: true, instructorId: true } } },
    });
  }

  findByLesson(lessonId: string, tenantId: string) {
    return this.prisma.attendance.findMany({
      where: { lessonId, tenantId },
      include: { student: { select: { id: true, name: true, email: true } } },
      orderBy: { student: { name: 'asc' } },
    });
  }

  findByStudentAndLesson(lessonId: string, studentId: string, tenantId: string) {
    return this.prisma.attendance.findFirst({
      where: { lessonId, studentId, tenantId },
    });
  }

  // student's full attendance history across a course, used for the
  // "X out of Y lessons attended" summary
  findByStudentAndCourse(courseId: string, studentId: string, tenantId: string) {
    return this.prisma.attendance.findMany({
      where: {
        tenantId,
        studentId,
        lesson: { courseId },
      },
      include: { lesson: { select: { id: true, title: true, order: true } } },
      orderBy: { lesson: { order: 'asc' } },
    });
  }

  // one upsert per student, all wrapped in a single transaction so a
  // partial failure doesn't leave the roll call half-saved
  bulkUpsert(
    tenantId: string,
    lessonId: string,
    records: { studentId: string; status: AttendanceStatus; note?: string }[],
  ) {
    const ops = records.map((r) =>
      this.prisma.attendance.upsert({
        where: {
          lessonId_studentId: { lessonId, studentId: r.studentId },
        },
        create: {
          tenantId,
          lessonId,
          studentId: r.studentId,
          status: r.status,
          note: r.note,
        },
        update: {
          status: r.status,
          note: r.note,
          markedAt: new Date(),
        },
      }),
    );
    return this.prisma.$transaction(ops);
  }
}