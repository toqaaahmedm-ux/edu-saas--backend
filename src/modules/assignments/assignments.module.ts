import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';
import { CoursesModule } from '../courses/courses.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GradesModule } from '../grades/grades.module';

@Module({
  // so we can use CoursesService for the ownership check + GradesService for automatic recalculation
  imports: [CoursesModule, PrismaModule, GradesModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}