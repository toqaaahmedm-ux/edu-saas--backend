import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { LiveSessionsService } from './live-sessions.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(SessionAuthGuard, RolesGuard)
@Controller('live-sessions')
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Roles(Role.STUDENT, Role.TEACHER, Role.ADMIN)
  @Get()
  getSessions(@GetUser() user: any, @Query('courseId') courseId?: string) {
    return this.liveSessionsService.getSessions(user.tenantId, courseId);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  createSession(@GetUser() user: any, @Body() body: any) {
    return this.liveSessionsService.createSession(user.tenantId, user.id, user.role, body);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':id')
  updateSession(@Param('id') id: string, @GetUser() user: any, @Body() body: any) {
    return this.liveSessionsService.updateSession(id, user.tenantId, user.id, user.role, body);
  }

  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':id')
  deleteSession(@Param('id') id: string, @GetUser() user: any) {
    return this.liveSessionsService.deleteSession(id, user.tenantId, user.id, user.role);
  }
}