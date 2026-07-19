import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubmissionStatus } from '@prisma/client';

@Injectable()
export class AssignmentsRepository {
  constructor(private prisma: PrismaService) {}

  findAllByCourse(courseId: string, tenantId: string) {
    return this.prisma.assignment.findMany({
      where: { courseId, tenantId },
      include: { _count: { select: { submissions: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  // tenantId مباشر في WHERE، نفس منطق BE-C03 fix في courses
  findById(id: string, tenantId?: string) {
    return this.prisma.assignment.findFirst({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
    });
  }

  create(data: {
    tenantId: string;
    courseId: string;
    title: string;
    description?: string;
    dueDate?: Date;
    maxScore?: number;
    isPublished?: boolean;
    allowFileUpload?: boolean;
  }) {
    return this.prisma.assignment.create({ data });
  }

  update(
    id: string,
    data: {
      title?: string;
      description?: string;
      dueDate?: Date;
      maxScore?: number;
      isPublished?: boolean;
      allowFileUpload?: boolean;
    },
    tenantId?: string,
  ) {
    return this.prisma.assignment.update({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      data,
    });
  }

  delete(id: string, tenantId?: string) {
    return this.prisma.assignment.delete({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
    });
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  async findSubmissionsPaginated(
    assignmentId: string,
    tenantId: string,
    skip: number,
    take: number,
  ) {
    const where = { assignmentId, tenantId };
    const [submissions, total] = await this.prisma.$transaction([
      this.prisma.assignmentSubmission.findMany({
        where,
        include: { student: { select: { id: true, name: true, email: true } } },
        skip,
        take,
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.assignmentSubmission.count({ where }),
    ]);
    return { submissions, total };
  }

  findSubmissionByStudent(assignmentId: string, studentId: string, tenantId: string) {
    return this.prisma.assignmentSubmission.findFirst({
      where: { assignmentId, studentId, tenantId },
    });
  }

  findSubmissionById(id: string, tenantId?: string) {
    return this.prisma.assignmentSubmission.findFirst({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      include: { student: { select: { id: true, name: true, email: true } } },
    });
  }

  // upsert عشان الطالب يقدر يعدّل تسليمه قبل الـ dueDate (resubmit) —
  // الـ unique constraint [assignmentId, studentId] هو اللي بيمنع تكرار الصف
  upsertSubmission(data: {
    tenantId: string;
    assignmentId: string;
    studentId: string;
    fileUrl?: string;
    textContent?: string;
  }) {
    return this.prisma.assignmentSubmission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId: data.assignmentId,
          studentId: data.studentId,
        },
      },
      create: {
        tenantId: data.tenantId,
        assignmentId: data.assignmentId,
        studentId: data.studentId,
        fileUrl: data.fileUrl,
        textContent: data.textContent,
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
      update: {
        fileUrl: data.fileUrl,
        textContent: data.textContent,
        status: SubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      },
    });
  }

  gradeSubmission(
    id: string,
    data: { score: number; feedback?: string },
    tenantId?: string,
  ) {
    return this.prisma.assignmentSubmission.update({
      where: {
        id,
        ...(tenantId && { tenantId }),
      },
      data: {
        score: data.score,
        feedback: data.feedback,
        status: SubmissionStatus.GRADED,
        gradedAt: new Date(),
      },
    });
  }
}