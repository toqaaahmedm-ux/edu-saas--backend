import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ModulesService } from './modules.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { Role } from '@prisma/client';
import { CreateModuleDto } from './dto/create-module.dto';

@Controller('courses/:courseId/modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  // Sprint 2 bugfix: @Public() alone made req.user always undefined, even
  // for a logged-in student, because SessionAuthGuard skips JWT
  // verification entirely when the route is public. OptionalAuthGuard
  // actually attempts verification but never blocks the request either
  // way, so logged-in students get req.user populated while anonymous
  // visitors still get through.
  @Public()
  @UseGuards(OptionalAuthGuard)
  @Get()
  findAll(@Param('courseId') courseId: string, @GetUser() user: any) {
    const studentId = user?.role === Role.STUDENT ? user.id : undefined;
    return this.modulesService.findAllByCourse(courseId, user?.tenantId, studentId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Post()
  @AuditAction('MODULE_CREATED')
  create(
    @Param('courseId') courseId: string,
    @GetUser() user: any,
    @Body() body: CreateModuleDto,
  ) {
    return this.modulesService.create(courseId, user.tenantId, user.id, user.role, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Patch(':moduleId')
  @AuditAction('MODULE_UPDATED')
  update(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @GetUser() user: any,
    @Body() body: Partial<CreateModuleDto>,
  ) {
    return this.modulesService.update(moduleId, courseId, user.tenantId, user.id, user.role, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.TEACHER, Role.ADMIN)
  @Delete(':moduleId')
  @AuditAction('MODULE_DELETED')
  delete(
    @Param('courseId') courseId: string,
    @Param('moduleId') moduleId: string,
    @GetUser() user: any,
  ) {
    return this.modulesService.delete(moduleId, courseId, user.tenantId, user.id, user.role);
  }
}
