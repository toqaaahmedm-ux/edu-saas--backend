import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { AssignmentsRepository } from './assignments.repository';
import { NotificationsService } from '../notifications/notifications.service';
import { CoursesService } from '../courses/courses.service';
import { GradesService } from '../grades/grades.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly assignmentsRepository: AssignmentsRepository,
    private readonly coursesService: CoursesService,
    private readonly gradesService: GradesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async assertCourseOwnership(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.coursesService.findById(courseId, tenantId);
    if (userRole !== 'ADMIN' && course.instructorId !== userId) {
      throw new ForbiddenException('You do not own this course');
    }
    return course;
  }

  async findAllByCourse(courseId: string, tenantId: string) {
    return this.assignmentsRepository.findAllByCourse(courseId, tenantId);
  }

  async findById(id: string, tenantId: string) {
    const assignment = await this.assignmentsRepository.findById(id, tenantId);
    if (!assignment) throw new NotFoundException('Assignment not found');
    return assignment;
  }

  async create(
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: {
      title: string;
      description?: string;
      dueDate?: string;
      maxScore?: number;
      isPublished?: boolean;
      allowFileUpload?: boolean;
    },
  ) {
    if (!data.title?.trim()) throw new BadRequestException('Title is required');
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);

    return this.assignmentsRepository.create({
      tenantId,
      courseId,
      title: data.title,
      description: data.description,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      maxScore: data.maxScore,
      isPublished: data.isPublished,
      allowFileUpload: data.allowFileUpload,
    });
  }

  async update(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: {
      title?: string;
      description?: string;
      dueDate?: string;
      maxScore?: number;
      isPublished?: boolean;
      allowFileUpload?: boolean;
    },
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);

    return this.assignmentsRepository.update(
      id,
      {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
      tenantId,
    );
  }

  async delete(
    id: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    await this.findById(id, tenantId);
    await this.assignmentsRepository.delete(id, tenantId);
    return { message: 'Assignment deleted successfully' };
  }

  // ---- Submissions ---- 

  async getSubmissions(
    assignmentId: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    page: number = 1,
    limit: number = 20,
  ) {
    await this.assertCourseOwnership(courseId, tenantId, userId, userRole);
    const skip = (page - 1) * limit;
    const { submissions, total } = await this.assignmentsRepository.findSubmissionsPaginated(
      assignmentId, tenantId, skip, limit,
    );
    return {
      submissions,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMySubmission(assignmentId: string, studentId: string, tenantId: string) {
    return this.assignmentsRepository.findSubmissionByStudent(assignmentId, studentId, tenantId);
  }

  async submit(
    assignmentId: string,
    studentId: string,
    tenantId: string,
    data: { fileUrl?: string; textContent?: string },
  ) {
    const assignment = await this.findById(assignmentId, tenantId);

    if (!assignment.isPublished) {
      throw new BadRequestException('This assignment is not open for submissions');
    }
    if (!data.fileUrl && !data.textContent) {
      throw new BadRequestException('Submission must include a file or text answer');
    }
    if (assignment.dueDate && new Date() > assignment.dueDate) {
      throw new BadRequestException('The due date for this assignment has passed');
    }

    const submission = await this.assignmentsRepository.upsertSubmission({
      tenantId,
      assignmentId,
      studentId,
      fileUrl: data.fileUrl,
      textContent: data.textContent,
    });

    // Notify the course instructor that a student submitted work.
    // Wrapped in try/catch so a notification hiccup never blocks the
    // actual submission from succeeding (already saved by the line above).
    try {
      const course = await this.coursesService.findById(assignment.courseId, tenantId);
      await this.notificationsService.createNotification({
        userId: course.instructorId,
        tenantId,
        title: 'New assignment submission',
        message: `A student submitted "${assignment.title}"`,
        type: 'ASSIGNMENT_SUBMITTED',
      });
    } catch (err) {
      // swallow -- submission itself succeeded, notification is best-effort
    }

    return submission;
  }

  async grade(
    submissionId: string,
    courseId: string,
    tenantId: string,
    userId: string,
    userRole: string,
    data: { score: number; feedback?: string },
  ) {
    const course = await this.assertCourseOwnership(courseId, tenantId, userId, userRole);

    const submission = await this.assignmentsRepository.findSubmissionById(submissionId, tenantId);
    if (!submission) throw new NotFoundException('Submission not found');

    const assignment = await this.findById(submission.assignmentId, tenantId);
    if (data.score > assignment.maxScore) {
      throw new BadRequestException(`Score cannot exceed ${assignment.maxScore}`);
    }
    if (data.score < 0) {
      throw new BadRequestException('Score cannot be negative');
    }

    const graded = await this.assignmentsRepository.gradeSubmission(submissionId, data, tenantId);

    // auto-recompute the student's final course grade right after grading --
    // this is what used to require a manual "recompute" button click.
    // Wrapped in try/catch so a grade-calc hiccup never blocks the actual
    // grading action from succeeding (the teacher's work is already saved
    // by the line above).
    try {
      await this.gradesService.recompute(course.id, submission.studentId, tenantId, userId, userRole);
    } catch (err) {
      // swallow -- grading itself succeeded, recompute can be retried
      // manually via POST /courses/:courseId/grades/recompute/:studentId
    }

    // Notify the student that their assignment has been graded.
    // Also best-effort: never block a successful grading action.
    try {
      await this.notificationsService.createNotification({
        userId: submission.studentId,
        tenantId,
        title: 'Assignment graded',
        message: `Your submission for "${assignment.title}" scored ${data.score}/${assignment.maxScore}`,
        type: 'ASSIGNMENT_GRADED',
      });
    } catch (err) {
      // swallow -- grading itself succeeded, notification is best-effort
    }

    return graded;
  }
}