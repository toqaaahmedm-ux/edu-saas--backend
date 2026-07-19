import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@Controller('lessons/:lessonId/attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post('bulk')
  @AuditAction('ATTENDANCE_MARKED')
  mark(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
    @Body() body: MarkAttendanceDto,
  ) {
    return this.attendanceService.mark(lessonId, user.tenantId, user.id, user.role, body.records);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get()
  getByLesson(@Param('lessonId') lessonId: string, @GetUser() user: any) {
    return this.attendanceService.getByLesson(lessonId, user.tenantId, user.id, user.role);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me')
  getMine(@Param('lessonId') lessonId: string, @GetUser() user: any) {
    return this.attendanceService.getMyAttendance(lessonId, user.id, user.tenantId);
  }
}

// separate controller because this one is scoped by course, not lesson —
// used for the "attendance summary" view (X out of Y lessons attended)
@Controller('courses/:courseId/attendance')
export class CourseAttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Get('me')
  getMySummary(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.attendanceService.getStudentCourseSummary(courseId, user.id, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('student/:studentId')
  getStudentSummary(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @GetUser() user: any,
  ) {
    return this.attendanceService.getStudentCourseSummary(courseId, studentId, user.tenantId);
  }
}