import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(SessionAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('broadcast')
  broadcast(
    @GetUser() user: any,
    @Body() body: { title: string; message: string; type?: string },
  ) {
    return this.notificationsService.broadcastToTenant({
      tenantId: user.tenantId,
      title: body.title,
      message: body.message,
      type: body.type ?? 'ANNOUNCEMENT',
    });
  }

  @Get()
  getMyNotifications(@GetUser('id') userId: string) {
    return this.notificationsService.getUserNotifications(userId);
  }

  @Get('unread-count')
  getUnreadCount(@GetUser('id') userId: string) {
    return this.notificationsService.getUnreadCount(userId);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Patch('mark-all-read')
  markAllAsRead(@GetUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
