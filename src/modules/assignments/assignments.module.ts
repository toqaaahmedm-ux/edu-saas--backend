import { Module } from '@nestjs/common';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';
import { CoursesModule } from '../courses/courses.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { GradesModule } from '../grades/grades.module';

@Module({
  imports: [PrismaModule, CoursesModule, GradesModule], // عشان نستخدم CoursesService في فحص الملكية + GradesService لإعادة الحساب التلقائي
  controllers: [AssignmentsController],
  providers: [AssignmentsService, AssignmentsRepository],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}