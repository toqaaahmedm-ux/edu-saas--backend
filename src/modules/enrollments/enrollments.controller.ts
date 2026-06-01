import { Controller, Post, Get, Patch, Body, Param, Req } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private enrollmentsService: EnrollmentsService) {}

  @Post()
  enroll(@Body() body: { courseId: string }, @Req() req: any) {
    return this.enrollmentsService.enroll(req.user.id, body.courseId);
  }

  @Get('my')
  getMyEnrollments(@Req() req: any) {
    return this.enrollmentsService.getMyEnrollments(req.user.id);
  }

  @Get('course/:courseId')
  getByCourse(@Param('courseId') courseId: string) {
    return this.enrollmentsService.getEnrollmentsByCourse(courseId);
  }

  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { progress: number },
  ) {
    return this.enrollmentsService.updateProgress(id, req.user.id, body.progress);
  }
}