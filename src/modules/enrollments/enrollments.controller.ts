import {
  Controller,
  Get,
  Post,
  Patch,
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

  @Get('my')
  getMyEnrollments(@GetUser() user: any) {
    return this.enrollmentsService.getMyEnrollments(user.tenantId, user.id);
  }

  // HIGH-16 FIX: قبل كده أي مستخدم مسجل دخول (حتى الطلاب) كان يقدر يشوف
  // قائمة كل الطلاب المسجلين في أي كورس — ده data leak حقيقي. دلوقتي
  // الـ endpoint ده محمي بـ RolesGuard ومتاح للـ TEACHER والـ ADMIN بس.
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  @Get('course/:courseId')
  getEnrollmentsByCourse(@Param('courseId') courseId: string, @GetUser() user: any) {
    return this.enrollmentsService.getEnrollmentsByCourse(user.tenantId, courseId);
  }

  // CRIT-10 FIX: الـ endpoint ده كان ناقص بالكامل — الـ service عنده
  // updateProgress() جاهزة، لكن مفيش route بيوصلها. من غيره الفرونت
  // مينفعش يحفظ تقدم الطالب في الداتابيز خالص مهما كان الكود في الفرونت
  // مظبوط.
  @Patch(':id/progress')
  updateProgress(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: { progress: number },
  ) {
    return this.enrollmentsService.updateProgress(id, user.id, body.progress);
  }
}