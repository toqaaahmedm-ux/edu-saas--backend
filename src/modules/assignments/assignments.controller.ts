import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AssignmentsService } from './assignments.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

@Controller('courses/:courseId/assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  @Get()
  findAll(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.assignmentsService.findAllByCourse(courseId, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: any) {
    return this.assignmentsService.findById(id, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @AuditAction('ASSIGNMENT_CREATED')
  create(
    @Param('courseId') courseId: string,
    @GetUser() user: any,
    @Body() body: CreateAssignmentDto,
  ) {
    return this.assignmentsService.create(courseId, user.tenantId, user.id, user.role, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':id')
  @AuditAction('ASSIGNMENT_UPDATED')
  update(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: Partial<CreateAssignmentDto>,
  ) {
    return this.assignmentsService.update(id, courseId, user.tenantId, user.id, user.role, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':id')
  @AuditAction('ASSIGNMENT_DELETED')
  delete(
    @Param('courseId') courseId: string,
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.assignmentsService.delete(id, courseId, user.tenantId, user.id, user.role);
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get(':id/submissions')
  getSubmissions(
    @Param('courseId') courseId: string,
    @Param('id') assignmentId: string,
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.assignmentsService.getSubmissions(
      assignmentId, courseId, user.tenantId, user.id, user.role, +page, +limit,
    );
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get(':id/submissions/me')
  getMySubmission(@Param('id') assignmentId: string, @GetUser() user: any) {
    return this.assignmentsService.getMySubmission(assignmentId, user.id, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/submissions')
  @AuditAction('ASSIGNMENT_SUBMITTED')
  submit(
    @Param('id') assignmentId: string,
    @GetUser() user: any,
    @Body() body: SubmitAssignmentDto,
  ) {
    return this.assignmentsService.submit(assignmentId, user.id, user.tenantId, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':id/submissions/:submissionId/grade')
  @AuditAction('SUBMISSION_GRADED')
  grade(
    @Param('courseId') courseId: string,
    @Param('submissionId') submissionId: string,
    @GetUser() user: any,
    @Body() body: GradeSubmissionDto,
  ) {
    return this.assignmentsService.grade(
      submissionId, courseId, user.tenantId, user.id, user.role, body,
    );
  }
}