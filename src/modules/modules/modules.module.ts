import { Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';
import { ModulesRepository } from './modules.repository';
import { CoursesModule } from '../courses/courses.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  // so we can use CoursesService for the ownership check
  controllers: [ModulesController],
  providers: [ModulesService, ModulesRepository],
  exports: [ModulesService],
})
export class ModulesModule {}