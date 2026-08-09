import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as Joi from 'joi';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CoursesModule } from './modules/courses/courses.module';
import { BillingModule } from './modules/billing/billing.module';
import { AdminModule } from './modules/admin/admin.module';
import { UsersModule } from './modules/users/users.module';
import { EnrollmentsModule } from './modules/enrollments/enrollments.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { CertificatesModule } from './modules/certificates/certificates.module';
import { UploadModule } from './modules/upload/upload.module';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { MailModule } from './modules/mail/mail.module';
// NEW: Sprint 1 academic structure — course modules/chapters and
// assignments+submissions, added on top of the existing Courses feature.
import { ModulesModule } from './modules/modules/modules.module';
import { AssignmentsModule } from './modules/assignments/assignments.module';
// NEW: attendance roll-call and computed final grades
import { AttendanceModule } from './modules/attendance/attendance.module';
import { GradesModule } from './modules/grades/grades.module';
// NEW: admin-managed academic structure lookups (years, semesters, grade levels, sections)
import { AcademicModule } from './modules/academic/academic.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
@Module({
  controllers: [AppController],
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // SEC-05 FIX: if any critical env var is empty or missing, the app stops booting
      // immediately instead of running with the string "undefined" — this scenario used to
      // let JWT_SECRET become a fixed, known string that anyone who knew it could sign a valid JWT with.
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: Joi.number().default(4000),

        DATABASE_URL: Joi.string().uri().required(),

        JWT_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

        STRIPE_SECRET_KEY: Joi.string().required(),
        STRIPE_WEBHOOK_SECRET: Joi.string().required(),

        CLOUDINARY_CLOUD_NAME: Joi.string().required(),
        CLOUDINARY_API_KEY: Joi.string().required(),
        CLOUDINARY_API_SECRET: Joi.string().required(),
        RESEND_API_KEY: Joi.string().required(),
      }),
      validationOptions: {
        // collect all the errors at once instead of stopping at the first one —
        // easier to fix if more than one variable is missing
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([{
      name: 'default', // SEC-02: explicit name so per-route @Throttle({ default: {...} }) overrides actually match this throttler
      ttl: 60000,
      limit: 100,
    }]),
    PrismaModule,
    AuthModule,
    CoursesModule,
    BillingModule,
    AdminModule,
    UsersModule,
    EnrollmentsModule,
    QuizModule,
    CertificatesModule,
    UploadModule,
    NotificationsModule,
    MailModule,
    // NEW: registered after CoursesModule since both depend on it
    // (they inject CoursesService to check course ownership before
    // letting a teacher create/edit modules or assignments)
    ModulesModule,
    AssignmentsModule,
    AttendanceModule,
    GradesModule,
    AcademicModule,
    TenantsModule,
  ],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // BE-C06 FIX: AuditInterceptor was fully defined, along with the
    // @AuditAction decorator that's already used in admin.controller.ts (TENANT_SUSPENDED,
    // PLAN_ASSIGNED) — but it was never registered in the pipeline, so not a single audit
    // log was actually being written. The interceptor has dependencies
    // (PrismaService, Reflector), so it needs to be registered as an APP_INTERCEPTOR provider
    // here (not `new AuditInterceptor()` in main.ts) so NestJS can inject
    // its dependencies correctly.
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*'); // applies to all routes
  }
}