import { Module } from '@nestjs/common';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CoursesRepository } from './courses.repository';
import { LessonsController } from './lessons.controller';
import { LessonsService } from './lessons.service';
import { LessonsRepository } from './lessons.repository';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CoursesController, LessonsController],
  providers: [
    CoursesService, CoursesRepository,
    LessonsService, LessonsRepository,
  ],
  exports: [CoursesService, CoursesRepository],
})
export class CoursesModule {}