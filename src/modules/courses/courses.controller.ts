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
    @GetUser() user?: any,
  ) {
    const tenantId = user?.tenantId ?? null;
    return this.coursesService.findAll(tenantId, +page, +limit, search, category);
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
  findOne(@Param('id') id: string) {
    return this.coursesService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(
    @GetUser() user: any,
    @Body() body: {
      title: string;
      description: string;
      thumbnail?: string;
      category?: string;
      price?: number;
      videoUrl?: string;
    },
  ) {
    return this.coursesService.create({
      ...body,
      tenantId: user.tenantId,
      instructorId: user.id,
    });
  }

  // AUTH-02: إضافة Guard على PUT :id — كان مفيش حماية خالص
  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Put(':id')
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
    },
  ) {
    return this.coursesService.update(id, user.id, user.role, body);
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

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Patch(':id/archive')
  archive(@Param('id') id: string) {
    return this.coursesService.archive(id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.TEACHER)
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.coursesService.delete(id);
  }
}