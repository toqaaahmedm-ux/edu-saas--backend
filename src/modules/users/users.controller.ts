import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(SessionAuthGuard)
  @Get('me')
  async getMe(@GetUser() tokenUser: any) {
    const dbUser = await this.usersService.findById(tokenUser.id);
    return {
      ...dbUser,
      impersonatedBy: tokenUser.impersonatedBy ?? null,
    };
  }

  @UseGuards(SessionAuthGuard)
  @Patch('me')
  updateMe(
    @GetUser('id') id: string,
    @Body() body: { name?: string; avatar?: string },
  ) {
    return this.usersService.updateProfile(id, body);
  }

  @UseGuards(SessionAuthGuard)
  @Patch('me/password')
  updatePassword(
    @GetUser('id') id: string,
    @Body() body: { oldPassword: string; newPassword: string },
  ) {
    return this.usersService.updatePassword(id, body.oldPassword, body.newPassword);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAll(
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.usersService.findAll(user.tenantId, +page, +limit);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/:id')
  delete(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.usersService.delete(user.tenantId, id, user.id);
  }

  @AuditAction('USER_ROLE_UPDATED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/role')
  updateRole(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: { role: Role },
  ) {
    return this.usersService.updateRole(id, user.tenantId, body.role, user.id);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/pending')
  getPendingTeachers(@GetUser() user: any) {
    return this.usersService.getPendingTeachers(user.tenantId);
  }

  @AuditAction('TEACHER_APPROVED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/approve')
  approveTeacher(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.usersService.approveTeacher(id, user.tenantId, user.id);
  }

  @AuditAction('TEACHER_REJECTED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/reject')
  rejectTeacher(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.usersService.rejectTeacher(id, user.tenantId);
  }


  @AuditAction('USER_CREATED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin')
  createUser(@GetUser() user: any, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(user.tenantId, dto);
  }
}