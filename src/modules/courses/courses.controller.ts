import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { Request } from 'express';
import { CoursesService } from './courses.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureGuard } from '../../common/guards/feature.guard'; // BE-H02
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequireFeature } from '../../common/decorators/require-feature.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role, CourseStatus } from '@prisma/client';
import { CreateCourseDto } from './dto/create-course.dto';
import { CreateRatingDto } from './dto/create-rating.dto';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) { }

  @Public()
  @Get()
  findAll(
    @Req() req: Request,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('sortBy') sortBy?: string,
  ) {
    const tenantId = (req as any).tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context required');
    return this.coursesService.findAll(tenantId, +page, +limit, search, category, sortBy);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  findAllAdmin(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @GetUser() user: any,
  ) {
    return this.coursesService.findAllAdmin(user.tenantId, +page, +limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/my-courses')
  getMyCourses(@GetUser() user: any) {
    return this.coursesService.findByInstructor(user.tenantId, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/stats')
  getTeacherStats(@GetUser() user: any) {
    return this.coursesService.getTeacherStats(user.tenantId, user.id);
  }

  // BE-H02: added FeatureGuard so plan-based gating actually works
  @RequireFeature('ANALYTICS')
  @UseGuards(FeatureGuard, RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/analytics')
  getTeacherAnalytics(@GetUser() user: any) {
    return this.coursesService.getTeacherAnalytics(user.tenantId, user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/students')
  getTeacherStudents(
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.coursesService.getTeacherStudents(user.tenantId, user.id, +page, +limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/stats')
  getAdminStats(@GetUser() user: any) {
    return this.coursesService.getAdminStats(user.tenantId);
  }

  @Public()
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const tenantId = (req as any).tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context required');
    return this.coursesService.findById(id, tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @AuditAction('COURSE_CREATED')
  create(
    @GetUser() user: any,
    @Body() body: CreateCourseDto,
  ) {
    return this.coursesService.create({
      ...body,
      tenantId: user.tenantId,
      instructorId: user.id,
    });
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Put(':id')
  @AuditAction('COURSE_UPDATED')
  update(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
      videoUrl?: string;
    },
  ) {
    return this.coursesService.update(id, user.id, user.role, user.tenantId, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  @AuditAction('COURSE_STATUS_CHANGED')
  updateStatus(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: { status: string },
  ) {
    return this.coursesService.updateStatus(id, body.status as CourseStatus, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Patch(':id/archive')
  @AuditAction('COURSE_ARCHIVED')
  archive(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.coursesService.archive(id, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Delete(':id')
  @AuditAction('COURSE_DELETED')
  delete(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.coursesService.delete(id, user.tenantId);
  }
  // Ratings (Task #6)

  @UseGuards(RolesGuard)
  @Roles(Role.STUDENT)
  @Post(':id/ratings')
  @AuditAction('COURSE_RATED')
  rateCourse(
    @Param('id') courseId: string,
    @GetUser() user: any,
    @Body() body: CreateRatingDto,
  ) {
    return this.coursesService.rateCourse(courseId, user.id, user.tenantId, body);
  }

  @Public()
  @Get(':id/ratings')
  getCourseRatings(
    @Param('id') courseId: string,
    @Req() req: Request,
  ) {
    const tenantId = (req as any).tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context required');
    return this.coursesService.getCourseRatings(courseId, tenantId);
  }
}
