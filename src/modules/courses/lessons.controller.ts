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
    @GetUser('id') userId: string,
    @GetUser('role') userRole: string,
  ) {
    return this.lessonsService.getLessons(courseId, userId, userRole);
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
      availableAt?: string | null; // FEAT-03: ISO date string e.g. "2026-07-01T00:00:00Z"
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
      availableAt?: string | null; // FEAT-03
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