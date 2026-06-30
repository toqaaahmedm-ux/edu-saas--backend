import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@Controller('courses/:courseId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  getLessons(
    @Param('courseId') courseId: string,
    @GetUser() user: any, // ✅ BE-M02: نجيب الـ user كاملاً
  ) {
    return this.lessonsService.getLessons(courseId, user.id, user.role, user.tenantId); // ✅
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(
    @Param('courseId') courseId: string,
    @GetUser() user: any, // ✅
    @Body() body: {
      title: string;
      videoUrl?: string;
      duration?: number;
      order: number;
      availableAt?: string | null;
    },
  ) {
    return this.lessonsService.create(courseId, user.id, user.role, user.tenantId, body); // ✅
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Put(':lessonId')
  update(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any, // ✅
    @Body() body: {
      title?: string;
      videoUrl?: string;
      duration?: number;
      order?: number;
      availableAt?: string | null;
    },
  ) {
    return this.lessonsService.update(lessonId, user.id, user.role, user.tenantId, body); // ✅
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':lessonId')
  delete(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any, // ✅
  ) {
    return this.lessonsService.delete(lessonId, user.id, user.role, user.tenantId); // ✅
  }
}