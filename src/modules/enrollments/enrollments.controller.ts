import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';

@UseGuards(SessionAuthGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  enroll(@Req() req: any, @Body() body: { courseId: string }) {
    // بنمرر (tenantId, studentId, courseId)
    return this.enrollmentsService.enroll(req.user.tenantId, req.user.id, body.courseId);
  }

  @Get('my')
  getMyEnrollments(@Req() req: any) {
    // بنمرر (tenantId, studentId)
    return this.enrollmentsService.getMyEnrollments(req.user.tenantId, req.user.id);
  }

  @Get('course/:courseId')
  getEnrollmentsByCourse(@Param('courseId') courseId: string, @Req() req: any) {
    // بنمرر (tenantId, courseId)
    return this.enrollmentsService.getEnrollmentsByCourse(req.user.tenantId, courseId);
  }
}