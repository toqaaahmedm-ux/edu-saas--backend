import { Module } from '@nestjs/common';
import { AttendanceController, CourseAttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRepository } from './attendance.repository';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AttendanceController, CourseAttendanceController],
  providers: [AttendanceService, AttendanceRepository],
  exports: [AttendanceService],
})
export class AttendanceModule {}