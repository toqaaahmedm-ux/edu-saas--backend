import { Controller, Get, Patch, Param, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

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