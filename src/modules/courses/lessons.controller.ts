import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '@prisma/client';

@Controller('courses/:courseId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Public()
  @Get()
  getLessons(@Param('courseId') courseId: string) {
    return this.lessonsService.getLessons(courseId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(
    @Param('courseId') courseId: string,
    @GetUser('id') userId: string,
    @GetUser('role') userRole: string,
    @Body() body: {
      title: string;
      videoUrl?: string;
      duration?: number;
      order: number;
    },
  ) {
    return this.lessonsService.create(courseId, userId, userRole, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Put(':lessonId')
  update(
    @Param('lessonId') lessonId: string,
    @GetUser('id') userId: string,
    @GetUser('role') userRole: string,
    @Body() body: {
      title?: string;
      videoUrl?: string;
      duration?: number;
      order?: number;
    },
  ) {
    return this.lessonsService.update(lessonId, userId, userRole, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':lessonId')
  delete(
    @Param('lessonId') lessonId: string,
    @GetUser('id') userId: string,
    @GetUser('role') userRole: string,
  ) {
    return this.lessonsService.delete(lessonId, userId, userRole);
  }
}