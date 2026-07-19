import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { GradesRepository } from './grades.repository';
import { CoursesModule } from '../courses/courses.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule, CoursesModule],
  controllers: [GradesController],
  providers: [GradesService, GradesRepository],
  exports: [GradesService],
})
export class GradesModule {}