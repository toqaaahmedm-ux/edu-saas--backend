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
import { AuditAction } from '../../common/interceptors/audit.interceptor';

// Bug #6 FIX (Admin Report): this controller used to sit at the API root
// (@Controller() with no prefix), producing routes like GET /api/me and
// GET /api/admin/users that implicitly clashed with AdminController's
// /api/admin/* namespace. Now scoped under /api/users/*, and the admin
// sub-routes drop the redundant "users" segment (GET /api/admin/users ->
// GET /api/users/admin) since it's already implied by the prefix.
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(SessionAuthGuard)
  @Get('me')
  async getMe(@GetUser() tokenUser: any) {
    const dbUser = await this.usersService.findById(tokenUser.id);
    // impersonatedBy only exists on the JWT payload (set by
    // /auth/impersonate), never in the User table itself — so we merge
    // it in here rather than trying to persist it anywhere.
    return {
      ...dbUser,
      impersonatedBy: tokenUser.impersonatedBy ?? null,
    };
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
  @Get('admin')
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
  @Delete('admin/:id')
  delete(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    //  بنمرر (tenantId, id, requestUserId)
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
    // passing tenantId now so the service can enforce same-tenant scope
    return this.usersService.updateRole(id, user.tenantId, body.role, user.id);
  }
}