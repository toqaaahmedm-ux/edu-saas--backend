import { Controller, Get, Post, Put, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { LessonsService } from './lessons.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { SaveProgressDto } from './dto/save-progress.dto';

@Controller('courses/:courseId/lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  getLessons(
    @Param('courseId') courseId: string,
    @GetUser() user: any,
    @Query('moduleId') moduleId?: string,
  ) {
    return this.lessonsService.getLessons(courseId, user.id, user.role, user.tenantId, moduleId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  create(
    @Param('courseId') courseId: string,
    @GetUser() user: any,
    @Body() body: {
      title: string;
      videoUrl?: string;
      duration?: number;
      order: number;
      moduleId: string;
      availableAt?: string | null;
    },
  ) {
    return this.lessonsService.create(courseId, user.id, user.role, user.tenantId, body);
  }

  @Post(':lessonId/complete')
  completeLesson(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
  ) {
    return this.lessonsService.completeLesson(lessonId, user.id, user.tenantId);
  }

  // student saves their current video position — called on a debounced
  // interval while watching, not on every timeupdate event
  @Patch(':lessonId/progress')
  saveProgress(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
    @Body() body: SaveProgressDto,
  ) {
    return this.lessonsService.saveProgress(lessonId, user.id, user.tenantId, body.positionSeconds);
  }

  // frontend calls this when the lesson loads, to know where to seek to
  @Get(':lessonId/progress/me')
  getProgress(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
  ) {
    return this.lessonsService.getProgress(lessonId, user.id, user.tenantId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Put(':lessonId')
  update(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
    @Body() body: {
      title?: string;
      videoUrl?: string;
      duration?: number;
      order?: number;
      moduleId?: string;
      availableAt?: string | null;
    },
  ) {
    return this.lessonsService.update(lessonId, user.id, user.role, user.tenantId, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':lessonId')
  delete(
    @Param('lessonId') lessonId: string,
    @GetUser() user: any,
  ) {
    return this.lessonsService.delete(lessonId, user.id, user.role, user.tenantId);
  }
}