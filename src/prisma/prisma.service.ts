import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();

    //  MT-01: تحذير لو create بدون tenantId
    const modelsWithTenant = [
      'Course', 'Enrollment', 'QuizAttempt', 'Certificate', 'User'
    ];

    this.$use(async (params, next) => {
      if (
        params.action === 'create' &&
        params.model &&
        modelsWithTenant.includes(params.model) &&
        params.args?.data &&
        !params.args.data.tenantId
      ) {
        console.warn(
          `[Prisma Warning] ${params.model}.create called without tenantId!`
        );
      }
      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}