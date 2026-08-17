import { Module } from '@nestjs/common';
import { LiveSessionsController } from './live-sessions.controller';
import { LiveSessionsService } from './live-sessions.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [LiveSessionsController],
  providers: [LiveSessionsService],
  exports: [LiveSessionsService],
})
export class LiveSessionsModule {}