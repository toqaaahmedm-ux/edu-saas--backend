import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // SEC-05 FIX: لو أي متغير حرج فاضي أو ناقص، التطبيق يوقف عن الإقلاع
      // فوراً بدل ما يشتغل بقيمة "undefined" كـ string — السيناريو ده كان
      // بيخلي JWT_SECRET يبقى string ثابت ومعروف (=== process.env.JWT_SECRET
      // اللي مش موجود) وأي حد عارف ده يقدر يوقّع JWT صالح بنفسه.
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
      }),
      validationOptions: {
        // نجمع كل الأخطاء مرة واحدة بدل ما نوقف عند أول واحد بس —
        // أسهل في الإصلاح لو أكتر من متغير ناقص
        abortEarly: false,
      },
    }),
    ThrottlerModule.forRoot([{
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
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
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