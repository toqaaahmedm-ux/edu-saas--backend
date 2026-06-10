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
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role, CourseStatus } from '@prisma/client';

@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Public()
  @Get()
  findAll(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    return this.coursesService.findAll(+page, +limit, search, category);
  }

  // ── Admin يشوف كل الكورسات حتى DRAFT ──
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/all')
  findAllAdmin(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.coursesService.findAllAdmin(+page, +limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/my-courses')
  getMyCourses(@GetUser() user: any) {
    return this.coursesService.findByInstructor(user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/stats')
  getTeacherStats(@GetUser() user: any) {
    return this.coursesService.getTeacherStats(user.id);
  }

  // QE-02: أضفنا page و limit عشان مش نجيب كل الطلاب دفعة واحدة
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Get('teacher/students')
  getTeacherStudents(
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.coursesService.getTeacherStudents(user.id, +page, +limit);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/stats')
  getAdminStats() {
    return this.coursesService.getAdminStats();
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(
    @GetUser('id') userId: string,
    @Body() body: {
      title: string;
      description: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      videoUrl?: string;
    },
  ) {
    return this.coursesService.create({ ...body, instructorId: userId });
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @GetUser('id') userId: string,
    @GetUser('role') userRole: string,
    @Body() body: {
      title?: string;
      description?: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      status?: CourseStatus;
    },
  ) {
    return this.coursesService.update(id, userId, userRole, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.coursesService.updateStatus(id, body.status as CourseStatus);
  }

  // BL-06: soft delete — بدل ما نمسح الكورس ونضيع بيانات الطلاب
  // بنحوله لـ ARCHIVED وبيفضل موجود في الـ DB
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.coursesService.archive(id);
  }

  // BL-06: الـ delete دلوقتي بيرفض لو الكورس PUBLISHED أو عنده طلاب
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.coursesService.delete(id);
  }
}