import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { QuizRepository } from './quiz.repository';
import { PrismaModule } from '../../prisma/prisma.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, CertificatesModule, NotificationsModule],
  controllers: [QuizController],
  providers: [QuizService, QuizRepository],
  exports: [QuizService],
})
export class QuizModule {}