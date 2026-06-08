import { Module } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { EnrollmentsController } from './enrollments.controller';
import { EnrollmentsRepository } from './enrollments.repository';
import { CoursesRepository } from '../courses/courses.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EnrollmentsController],
  providers: [EnrollmentsService, EnrollmentsRepository, CoursesRepository],
})
export class EnrollmentsModule {}