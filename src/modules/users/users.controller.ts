import {
  Controller,
  Get,
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

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(SessionAuthGuard)
  @Get('me')
  getMe(@GetUser('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(SessionAuthGuard)
  @Patch('me')
  updateMe(
    @GetUser('id') id: string,
    @Body() body: { name?: string },
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
  @Get('admin/users')
  findAll(
    @GetUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    // بنمرر (tenantId, page, limit)
    return this.usersService.findAll(user.tenantId, +page, +limit);
  }

  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Delete('admin/users/:id')
  delete(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    //  بنمرر (tenantId, id, requestUserId)
    return this.usersService.delete(user.tenantId, id, user.id);
  }
@UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/users/:id/role')
  updateRole(
    @Param('id') id: string,
    @GetUser() user: any,
    @Body() body: { role: Role },
  ) {
    // passing tenantId now so the service can enforce same-tenant scope
    return this.usersService.updateRole(id, user.tenantId, body.role, user.id);
  }
}