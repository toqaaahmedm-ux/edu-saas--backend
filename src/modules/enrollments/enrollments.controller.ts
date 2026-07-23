import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(SessionAuthGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  enroll(@GetUser() user: any, @Body() body: { courseId: string }) {
    return this.enrollmentsService.enroll(user.tenantId, user.id, body.courseId);
  }

  // NEW (REQ-03): admin assigns a student to a course directly, bypassing
  // the payment gate. Separate route from the self-enroll one above so
  // permissions and behavior stay clearly split.
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('admin')
  adminEnroll(
    @GetUser() user: any,
    @Body() body: { studentId: string; courseId: string },
  ) {
    return this.enrollmentsService.adminEnroll(user.tenantId, body.studentId, body.courseId);
  }

  // NEW (REQ-03): admin removes a student from a course.
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Delete('admin/:id')
  removeEnrollment(@Param('id') id: string, @GetUser() user: any) {
    return this.enrollmentsService.removeEnrollment(user.tenantId, id);
  }

  @Get('my')
  getMyEnrollments(@GetUser() user: any) {
    return this.enrollmentsService.getMyEnrollments(user.tenantId, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @Get('course/:courseId')
  getEnrollmentsByCourse(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.enrollmentsService.getEnrollmentsByCourse(user.tenantId, courseId);
  }

  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: { progress: number },
  ) {
    return this.enrollmentsService.updateProgress(id, user.id, body.progress);
  }
}
