import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '../common/tenant-context';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();

    const modelsWithTenant = [
      'Course', 'Enrollment', 'QuizAttempt', 'Certificate', 'User', 'Lesson' // ✅ BE-M02
    ];

    this.$use(async (params, next) => {
      const tenantId = getCurrentTenantId();
      if (tenantId) {
        // await this.$executeRawUnsafe(
        //   `SET LOCAL app.tenant_id = '${tenantId}'`
        // );
      }

      if (
        params.action === 'create' &&
        params.model &&
        modelsWithTenant.includes(params.model) &&
        params.args?.data &&
        !params.args.data.tenantId
      ) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            `[Prisma] ${params.model}.create called without tenantId — blocked in production`
          );
        } else {
          console.warn(
            `[Prisma Warning] ${params.model}.create called without tenantId!`
          );
        }
      }

      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}