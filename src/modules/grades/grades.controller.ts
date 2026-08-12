import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { GradesService } from './grades.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';
import { UpdateGradeNotesDto } from './dto/update-grade-notes.dto';

@Controller('courses/:courseId/grades')
export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get()
  getAll(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.gradesService.getByCourse(courseId, user.tenantId, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me')
  getMine(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.gradesService.getMyGrade(courseId, user.id, user.tenantId);
  }

  // NOTE: manual trigger for now. The natural next step is to call
  // gradesService.recompute() automatically from AssignmentsService.grade()
  // and from the quiz-submission flow, so grades update live instead of
  // needing this endpoint hit by hand. Left as a follow-up to avoid a
  // circular module dependency (Grades <-> Assignments <-> Quiz) in one pass.
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('recompute/:studentId')
  @AuditAction('GRADE_RECOMPUTED')
  recompute(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @GetUser() user: any,
  ) {
    return this.gradesService.recompute(courseId, studentId, user.tenantId, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':gradeId/notes')
  @AuditAction('GRADE_NOTES_UPDATED')
  updateNotes(
    @Param('courseId') courseId: string,
    @Param('gradeId') gradeId: string,
    @GetUser() user: any,
    @Body() body: UpdateGradeNotesDto,
  ) {
    return this.gradesService.updateNotes(
      gradeId, courseId, user.tenantId, user.id, user.role, body.notes,
    );
  }
}
