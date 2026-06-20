import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

//  FIX: SessionAuthGuard دلوقتي هو JWT guard فعلاً
@UseGuards(SessionAuthGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Post()
  enroll(@GetUser() user: any, @Body() body: { courseId: string }) {
    return this.enrollmentsService.enroll(user.tenantId, user.id, body.courseId);
  }

  @Get('my')
  getMyEnrollments(@GetUser() user: any) {
    return this.enrollmentsService.getMyEnrollments(user.tenantId, user.id);
  }

  @Get('course/:courseId')
  getEnrollmentsByCourse(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.enrollmentsService.getEnrollmentsByCourse(user.tenantId, courseId);
  }
}