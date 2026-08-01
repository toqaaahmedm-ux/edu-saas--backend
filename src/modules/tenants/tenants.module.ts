import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TenantsController],
})
export class TenantsModule {}