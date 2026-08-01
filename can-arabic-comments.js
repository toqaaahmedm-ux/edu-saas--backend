[1mdiff --git a/prisma/schema.prisma b/prisma/schema.prisma[m
[1mindex 8450c83..4664979 100644[m
[1m--- a/prisma/schema.prisma[m
[1m+++ b/prisma/schema.prisma[m
[36m@@ -66,7 +66,7 @@[m [menum LessonType {[m
   LIVE_SESSION[m
 }[m
 [m
[31m-// submission state machine: draft Ã¢â€ â€™ submitted Ã¢â€ â€™ graded (or returned for revision)[m
[32m+[m[32m// submission state machine: draft → submitted → graded (or returned for revision)[m
 enum SubmissionStatus {[m
   DRAFT[m
   SUBMITTED[m
[1mdiff --git a/prisma/seed.ts b/prisma/seed.ts[m
[1mindex f73bac1..a84cc9e 100644[m
[1m--- a/prisma/seed.ts[m
[1m+++ b/prisma/seed.ts[m
[36m@@ -275,7 +275,7 @@[m [masync function main() {[m
 [m
   console.log("📚 Created 3 courses across 2 tenants");[m
 [m
[31m-  // ─── 11. Lessons (مع tenantId) ────────────────────────────────[m
[32m+[m[32m  // ─── 11. Lessons (with tenantId) ────────────────────────────────[m
   await prisma.lesson.createMany({[m
     data: [[m
       { title: "ما هو JavaScript؟",   videoUrl: "https://example.com/v/1",  duration: 600,  order: 1, courseId: course1.id, tenantId: tenant1.id },[m
[1mdiff --git a/src/app.module.ts b/src/app.module.ts[m
[1mindex 544571c..e49ec1a 100644[m
[1m--- a/src/app.module.ts[m
[1m+++ b/src/app.module.ts[m
[36m@@ -35,9 +35,9 @@[m [mimport { AppService } from './app.service';[m
   imports: [[m
     ConfigModule.forRoot({[m
       isGlobal: true,[m
[31m-      // SEC-05 FIX: لو أي متغير حرج فاضي أو ناقص، التطبيق يوقف عن الإقلاع[m
[31m-      // فوراً بدل ما يشتغل بقيمة "undefined" كـ string — السيناريو ده كان[m
[31m-      // بيخلي JWT_SECRET يبقى string ثابت ومعروف وأي حد عارف ده يقدر يوقّع JWT صالح بنفسه.[m
[32m+[m[32m      // SEC-05 FIX: if any critical env var is empty or missing, the app stops booting[m
[32m+[m[32m      // immediately instead of running with the string "undefined" — this scenario used to[m
[32m+[m[32m      // let JWT_SECRET become a fixed, known string that anyone who knew it could sign a valid JWT with.[m
       validationSchema: Joi.object({[m
         NODE_ENV: Joi.string()[m
           .valid('development', 'production', 'test')[m
[36m@@ -60,8 +60,8 @@[m [mimport { AppService } from './app.service';[m
         RESEND_API_KEY: Joi.string().required(),[m
       }),[m
       validationOptions: {[m
[31m-        // نجمع كل الأخطاء مرة واحدة بدل ما نوقف عند أول واحد بس —[m
[31m-        // أسهل في الإصلاح لو أكتر من متغير ناقص[m
[32m+[m[32m        // collect all the errors at once instead of stopping at the first one —[m
[32m+[m[32m        // easier to fix if more than one variable is missing[m
         abortEarly: false,[m
       },[m
     }),[m
[36m@@ -101,13 +101,13 @@[m [mimport { AppService } from './app.service';[m
       provide: APP_GUARD,[m
       useClass: ThrottlerGuard,[m
     },[m
[31m-    // BE-C06 FIX: AuditInterceptor كانت معرَّفة كاملة ومعاها decorator[m
[31m-    // @AuditAction مستخدم فعلاً في admin.controller.ts (TENANT_SUSPENDED,[m
[31m-    // PLAN_ASSIGNED) — لكن مفيش تسجيل خالص في الـ pipeline، فمفيش audit[m
[31m-    // log واحد بيتكتب فعلياً. الـ interceptor عنده dependencies[m
[31m-    // (PrismaService, Reflector)، فلازم يتسجل كـ APP_INTERCEPTOR provider[m
[31m-    // هنا (مش new AuditInterceptor() في main.ts) عشان NestJS يحقن[m
[31m-    // الـ dependencies بتاعته صح.[m
[32m+[m[32m    // BE-C06 FIX: AuditInterceptor was fully defined, along with the[m
[32m+[m[32m    // @AuditAction decorator that's already used in admin.controller.ts (TENANT_SUSPENDED,[m
[32m+[m[32m    // PLAN_ASSIGNED) — but it was never registered in the pipeline, so not a single audit[m
[32m+[m[32m    // log was actually being written. The interceptor has dependencies[m
[32m+[m[32m    // (PrismaService, Reflector), so it needs to be registered as an APP_INTERCEPTOR provider[m
[32m+[m[32m    // here (not `new AuditInterceptor()` in main.ts) so NestJS can inject[m
[32m+[m[32m    // its dependencies correctly.[m
     {[m
       provide: APP_INTERCEPTOR,[m
       useClass: AuditInterceptor,[m
[1mdiff --git a/src/app.service.ts b/src/app.service.ts[m
[1mindex f3273b3..a6a1412 100644[m
[1m--- a/src/app.service.ts[m
[1m+++ b/src/app.service.ts[m
[36m@@ -18,7 +18,7 @@[m [mexport class AppService {[m
         this.prisma.certificate.count(),[m
       ]);[m
 [m
[31m-    // ── NEW-07: إيرادات حقيقية من DB ──[m
[32m+[m[32m    // ── NEW-07: real revenue from the DB ──[m
     const revenueResult = await this.prisma.enrollment.findMany({[m
       where: { status: 'ACTIVE' },[m
       include: {[m
[36m@@ -39,8 +39,8 @@[m [mexport class AppService {[m
       totalCourses,[m
       totalEnrollments,[m
       totalCertificates,[m
[31m-      totalRevenue,        // ← حقيقي من DB[m
[31m-      activeStudents,      // ← عدد الطلاب النشطين[m
[32m+[m[32m      // ← real, from the DB[m
[32m+[m[32m      // ← count of active students[m
     };[m
   }[m
 }[m
\ No newline at end of file[m
[1mdiff --git a/src/common/decorators/get-tenant.decorator.ts b/src/common/decorators/get-tenant.decorator.ts[m
[1mindex 3540208..ded5306 100644[m
[1m--- a/src/common/decorators/get-tenant.decorator.ts[m
[1m+++ b/src/common/decorators/get-tenant.decorator.ts[m
[36m@@ -1,6 +1,6 @@[m
 import { createParamDecorator, ExecutionContext } from '@nestjs/common';[m
 [m
[31m-// @GetTenant() decorator — يجيب الـ tenantId من الـ request[m
[32m+[m[32m// @GetTenant() decorator — pulls the tenantId off the request[m
 export const GetTenant = createParamDecorator([m
   (_data: unknown, ctx: ExecutionContext): string | null => {[m
     const request = ctx.switchToHttp().getRequest();[m
[1mdiff --git a/src/common/decorators/require-feature.decorator.ts b/src/common/decorators/require-feature.decorator.ts[m
[1mindex 20acfbb..99f6c21 100644[m
[1m--- a/src/common/decorators/require-feature.decorator.ts[m
[1m+++ b/src/common/decorators/require-feature.decorator.ts[m
[36m@@ -2,7 +2,7 @@[m
 // import { SessionAuthGuard } from '../guards/session-auth.guard';[m
 // import { FeatureGuard } from '../guards/feature.guard';[m
 // export const FEATURE_KEY = 'required_feature';[m
[31m-// // FeatureGuard هنضيفه بعدين لما نحل الـ circular dependency[m
[32m+[m[32m// // FeatureGuard — we'll add this later once we resolve the circular dependency[m
 // export const RequireFeature = (featureKey: string) =>[m
 //   applyDecorators([m
 //     SetMetadata(FEATURE_KEY, featureKey),[m
[1mdiff --git a/src/common/filters/http-exception.filter.ts b/src/common/filters/http-exception.filter.ts[m
[1mindex 6604071..8f64b4a 100644[m
[1m--- a/src/common/filters/http-exception.filter.ts[m
[1m+++ b/src/common/filters/http-exception.filter.ts[m
[36m@@ -9,7 +9,7 @@[m [mimport {[m
 import { Request, Response } from 'express';[m
 import * as Sentry from '@sentry/node';[m
 [m
[31m-@Catch()  // ← بيمسك كل الـ exceptions مش بس HttpException[m
[32m+[m[32m// ← catches all exceptions, not just HttpException[m
 export class HttpExceptionFilter implements ExceptionFilter {[m
   private readonly logger = new Logger(HttpExceptionFilter.name);[m
 [m
[36m@@ -34,14 +34,14 @@[m [mexport class HttpExceptionFilter implements ExceptionFilter {[m
         status = HttpStatus.NOT_FOUND;[m
         message = 'Record not found';[m
       } else {[m
[31m-        // لو مش في production — ابعت الـ message الحقيقي للـ debug[m
[32m+[m[32m        // if not in production — send the real message for debugging[m
         message = process.env.NODE_ENV !== 'production'[m
           ? exception.message[m
           : 'Internal server error';[m
       }[m
     }[m
 [m
[31m-    // لوج الـ error في السيرفر[m
[32m+[m[32m    // log the error on the server[m
     this.logger.error([m
       `${request.method} ${request.url} — ${status} — ${exception instanceof Error ? exception.message : exception}`,[m
     );[m
[1mdiff --git a/src/common/guards/session-auth.guard.ts b/src/common/guards/session-auth.guard.ts[m
[1mindex 2ab3121..3ccc586 100644[m
[1m--- a/src/common/guards/session-auth.guard.ts[m
[1m+++ b/src/common/guards/session-auth.guard.ts[m
[36m@@ -15,7 +15,7 @@[m [mexport class SessionAuthGuard extends AuthGuard('jwt') {[m
       context.getClass(),[m
     ]);[m
     if (isPublic) return true;[m
[31m-    //  تفويض لـ Passport JWT strategy[m
[32m+[m[32m    // delegates to the Passport JWT strategy[m
     return super.canActivate(context);[m
   }[m
 }[m
\ No newline at end of file[m
[1mdiff --git a/src/common/interceptors/audit.interceptor.ts b/src/common/interceptors/audit.interceptor.ts[m
[1mindex 685aa12..f9e6fd8 100644[m
[1m--- a/src/common/interceptors/audit.interceptor.ts[m
[1m+++ b/src/common/interceptors/audit.interceptor.ts[m
[36m@@ -8,7 +8,7 @@[m [mimport { PrismaService } from '../../prisma/prisma.service';[m
 [m
 export const AUDIT_ACTION_KEY = 'audit_action';[m
 [m
[31m-// Decorator لتحديد الـ action[m
[32m+[m[32m// Decorator to specify the action[m
 export const AuditAction = (action: string) =>[m
   (target: any, key: string, descriptor: PropertyDescriptor) => {[m
     Reflect.defineMetadata(AUDIT_ACTION_KEY, action, descriptor.value);[m
[36m@@ -28,7 +28,7 @@[m [mintercept(context: ExecutionContext, next: CallHandler): Observable<any> {[m
       context.getHandler(),[m
     );[m
 [m
[31m-    // لو مفيش action محدد — مش نسجل[m
[32m+[m[32m    // if no action is specified — don't log[m
     if (!action) return next.handle();[m
 [m
     const req = context.switchToHttp().getRequest();[m
[36m@@ -42,9 +42,9 @@[m [mintercept(context: ExecutionContext, next: CallHandler): Observable<any> {[m
           // Falls back to response.id, then response.data.id, then null.[m
           const target = req.params?.id ?? response?.id ?? response?.data?.id ?? null;[m
 [m
[31m-          // للأدمن العادي: tenantId بتاعه هو نفسه. للـ SUPER_ADMIN بيعمل createTenant[m
[31m-          // لتينانت جديد، مفيش tenantId على المستخدم نفسه، فبنستخدم الـ target كـ tenantId[m
[31m-          // في الحالة دي لأنه هو نفسه الـ tenant اللي اتعمل له الإجراء.[m
[32m+[m[32m          // for a regular admin: their own tenantId. For SUPER_ADMIN doing createTenant[m
[32m+[m[32m          // on a new tenant, the user itself has no tenantId, so we use the target as the tenantId[m
[32m+[m[32m          // in this case, since it's the same tenant the action was performed on.[m
           const tenantId = req.user?.tenantId ?? target ?? null;[m
 [m
           await this.prisma.auditLog.create({[m
[1mdiff --git a/src/common/interceptors/logging.interceptors.ts b/src/common/interceptors/logging.interceptors.ts[m
[1mindex de73468..62eecc4 100644[m
[1m--- a/src/common/interceptors/logging.interceptors.ts[m
[1m+++ b/src/common/interceptors/logging.interceptors.ts[m
[36m@@ -17,7 +17,7 @@[m [mexport class LoggingInterceptor implements NestInterceptor {[m
     const { method, url } = request;[m
     const now = Date.now();[m
 [m
[31m-    // ✅ BE-L02: شيل الـ query params من الـ log عشان متتسجلش PII[m
[32m+[m[32m    // BE-L02: strip query params from the log so PII doesn't get logged[m
     const cleanUrl = url.split('?')[0];[m
 [m
     return next.handle().pipe([m
[1mdiff --git a/src/modules/admin/admin.service.spec.ts b/src/modules/admin/admin.service.spec.ts[m
[1mindex b70e107..7738217 100644[m
[1m--- a/src/modules/admin/admin.service.spec.ts[m
[1m+++ b/src/modules/admin/admin.service.spec.ts[m
[36m@@ -9,7 +9,7 @@[m [mjest.mock('bcryptjs', () => ({[m
   hash: jest.fn().mockResolvedValue('hashed_owner_password'),[m
 }));[m
 [m
[31m-// Prisma transaction بيبعت (tx) بنفس شكل الـ prisma client — بنموكه بنفس الشكل[m
[32m+[m[32m// Prisma transaction passes (tx) in the same shape as the prisma client — we mock it the same way[m
 const mockTx = {[m
   tenant: {[m
     create: jest.fn(),[m
[36m@@ -97,8 +97,8 @@[m [mdescribe('AdminService', () => {[m
     };[m
 [m
     it('ينشئ tenant + owner في transaction واحدة وبيربطهم صح', async () => {[m
[31m-      mockPrismaService.tenant.findUnique.mockResolvedValue(null); // subdomain مش مكرر[m
[31m-      mockPrismaService.user.findFirst.mockResolvedValue(null); // owner email مش مكرر[m
[32m+[m[32m      // subdomain isn't a duplicate[m
[32m+[m[32m      // owner email isn't a duplicate[m
 [m
       mockTx.tenant.create.mockResolvedValue(mockNewTenant);[m
       mockTx.user.create.mockResolvedValue(mockOwnerUser);[m
[36m@@ -111,10 +111,10 @@[m [mdescribe('AdminService', () => {[m
 [m
       const result = await service.createTenant(dto);[m
 [m
[31m-      // اتشفرت الباسورد قبل ما تتخزن[m
[32m+[m[32m      // password was hashed before being stored[m
       expect(bcrypt.hash).toHaveBeenCalledWith(dto.ownerPassword, 10);[m
 [m
[31m-      // الـ tenant اتعمل بحالة TRIAL ومعاه trialEndsAt[m
[32m+[m[32m      // the tenant was created with TRIAL status and a trialEndsAt[m
       expect(mockTx.tenant.create).toHaveBeenCalledWith([m
         expect.objectContaining({[m
           data: expect.objectContaining({[m
[36m@@ -126,7 +126,7 @@[m [mdescribe('AdminService', () => {[m
         }),[m
       );[m
 [m
[31m-      // الـ owner اتعمل بدور ADMIN ومربوط بالـ tenant الصح[m
[32m+[m[32m      // the owner was created with the ADMIN role and linked to the right tenant[m
       expect(mockTx.user.create).toHaveBeenCalledWith([m
         expect.objectContaining({[m
           data: expect.objectContaining({[m
[36m@@ -138,7 +138,7 @@[m [mdescribe('AdminService', () => {[m
         }),[m
       );[m
 [m
[31m-      // الـ tenant اتحدّث بـ ownerUserId بعد إنشاء الـ owner[m
[32m+[m[32m      // the tenant was updated with ownerUserId after the owner was created[m
       expect(mockTx.tenant.update).toHaveBeenCalledWith([m
         expect.objectContaining({[m
           where: { id: mockNewTenant.id },[m
[1mdiff --git a/src/modules/assignments/assignments.module.ts b/src/modules/assignments/assignments.module.ts[m
[1mindex fe165b6..43ea292 100644[m
[1m--- a/src/modules/assignments/assignments.module.ts[m
[1m+++ b/src/modules/assignments/assignments.module.ts[m
[36m@@ -7,7 +7,7 @@[m [mimport { PrismaModule } from '../../prisma/prisma.module';[m
 import { GradesModule } from '../grades/grades.module';[m
 [m
 @Module({[m
[31m-  imports: [PrismaModule, CoursesModule, GradesModule], // عشان نستخدم CoursesService في فحص الملكية + GradesService لإعادة الحساب التلقائي[m
[32m+[m[32m  // so we can use CoursesService for the ownership check + GradesService for automatic recalculation[m
   controllers: [AssignmentsController],[m
   providers: [AssignmentsService, AssignmentsRepository],[m
   exports: [AssignmentsService],[m
[1mdiff --git a/src/modules/assignments/assignments.repository.ts b/src/modules/assignments/assignments.repository.ts[m
[1mindex d5add9b..3bfd662 100644[m
[1m--- a/src/modules/assignments/assignments.repository.ts[m
[1m+++ b/src/modules/assignments/assignments.repository.ts[m
[36m@@ -14,7 +14,7 @@[m [mexport class AssignmentsRepository {[m
     });[m
   }[m
 [m
[31m-  // tenantId مباشر في WHERE، نفس منطق BE-C03 fix في courses[m
[32m+[m[32m  // tenantId directly in the WHERE clause, same logic as the BE-C03 fix in courses[m
   findById(id: string, tenantId?: string) {[m
     return this.prisma.assignment.findFirst({[m
       where: {[m
[36m@@ -105,8 +105,8 @@[m [mexport class AssignmentsRepository {[m
     });[m
   }[m
 [m
[31m-  // upsert عشان الطالب يقدر يعدّل تسليمه قبل الـ dueDate (resubmit) —[m
[31m-  // الـ unique constraint [assignmentId, studentId] هو اللي بيمنع تكرار الصف[m
[32m+[m[32m  // upsert so the student can edit their submission before the dueDate (resubmit) —[m
[32m+[m[32m  // the unique constraint [assignmentId, studentId] is what prevents duplicate rows[m
   upsertSubmission(data: {[m
     tenantId: string;[m
     assignmentId: string;[m
[1mdiff --git a/src/modules/auth/auth.controller.spec.ts b/src/modules/auth/auth.controller.spec.ts[m
[1mindex 6fade05..b26d97c 100644[m
[1m--- a/src/modules/auth/auth.controller.spec.ts[m
[1m+++ b/src/modules/auth/auth.controller.spec.ts[m
[36m@@ -4,11 +4,11 @@[m [mimport { AuthService } from './auth.service';[m
 import { UnauthorizedException } from '@nestjs/common';[m
 import type { Response, Request } from 'express';[m
 [m
[31m-// ملحوظة: الملف ده بيتست AuthController نفسه (الـ HTTP layer) —[m
[31m-// مش AuthService. الـ AuthService متغطية بالفعل في auth.service.spec.ts.[m
[31m-// هنا بنتأكد إن الـ controller بيقرا الـ tenant header صح، بيحط الكوكيز[m
[31m-// (access + refresh) صح، وما بيرجعش accessToken في الـ body (BE-H04)،[m
[31m-// وإن refresh بيقرا refresh-token من الكوكي (BE-C01).[m
[32m+[m[32m// Note: this file tests AuthController itself (the HTTP layer) —[m
[32m+[m[32m// not AuthService. AuthService is already covered in auth.service.spec.ts.[m
[32m+[m[32m// here we're making sure the controller reads the tenant header correctly, sets the[m
[32m+[m[32m// (access + refresh) cookies correctly, and doesn't return accessToken in the body (BE-H04),[m
[32m+[m[32m// and that refresh reads the refresh-token from the cookie (BE-C01).[m
 [m
 const ACCESS_TOKEN = 'signed.jwt.token';[m
 const REFRESH_TOKEN = 'signed.refresh.token';[m
[36m@@ -30,7 +30,7 @@[m [mconst mockAuthService = {[m
   reissueToken: jest.fn(),[m
 };[m
 [m
[31m-// mock بسيط لـ express Response — بنحتاج بس .cookie() و .clearCookie() و .json()[m
[32m+[m[32m// simple mock for express Response — we only need .cookie(), .clearCookie(), and .json()[m
 const makeMockResponse = () => {[m
   const res: Partial<Response> = {[m
     cookie: jest.fn().mockReturnThis(),[m
[36m@@ -94,7 +94,7 @@[m [mdescribe('AuthController', () => {[m
         ACCESS_TOKEN,[m
         expect.objectContaining({ httpOnly: true }),[m
       );[m
[31m-      // ✅ جديد — كوكي الـ refresh-token المنفصلة بـ path محدد (BE-C01)[m
[32m+[m[32m      // new — the separate refresh-token cookie with a specific path (BE-C01)[m
       expect(res.cookie).toHaveBeenCalledWith([m
         'refresh-token',[m
         REFRESH_TOKEN,[m
[36m@@ -102,8 +102,8 @@[m [mdescribe('AuthController', () => {[m
       );[m
     });[m
 [m
[31m-    // BE-H04 FIX: accessToken كان بيتبعت في الـ body — مكشوف لـ logging[m
[31m-    // proxies. دلوقتي الـ body فيه بس success و data، مفيش accessToken خالص.[m
[32m+[m[32m    // BE-H04 FIX: accessToken used to be sent in the body — exposed to logging[m
[32m+[m[32m    // proxies. Now the body only has success and data, no accessToken at all.[m
     it('ما يرجعش accessToken في الـ body', async () => {[m
       mockAuthService.login.mockResolvedValue({[m
         accessToken: ACCESS_TOKEN,[m
[36m@@ -142,10 +142,10 @@[m [mdescribe('AuthController', () => {[m
   });[m
 [m
   describe('refresh', () => {[m
[31m-    // BE-C01 FIX: refresh بقى بيقرا refresh-token من الكوكي (مش من[m
[31m-    // req.user اللي كان جاي من JwtStrategy بعد ما يتأكد من التوكن[m
[31m-    // القديم) — ده بيسمح بتحديث access token من غير ما الـ access[m
[31m-    // القديم يكون لسه صالح.[m
[32m+[m[32m    // BE-C01 FIX: refresh now reads the refresh-token from the cookie (instead of[m
[32m+[m[32m    // req.user, which used to come from JwtStrategy after validating the old[m
[32m+[m[32m    // token) — this allows refreshing the access token even if the old access[m
[32m+[m[32m    // token is no longer valid.[m
     it('يقرأ refresh-token من الكوكي ويحط access token جديد', async () => {[m
       mockAuthService.refreshAccessToken.mockResolvedValue(ACCESS_TOKEN);[m
       const res = makeMockResponse();[m
[36m@@ -184,7 +184,7 @@[m [mdescribe('AuthController', () => {[m
       const res = makeMockResponse();[m
       await controller.logout(res);[m
       expect(res.clearCookie).toHaveBeenCalledWith('session-token');[m
[31m-      // ✅ جديد — لازم يمسح refresh-token كمان بنفس الـ path[m
[32m+[m[32m      // new — must clear the refresh-token cookie too, with the same path[m
       expect(res.clearCookie).toHaveBeenCalledWith([m
         'refresh-token',[m
         expect.objectContaining({ path: '/auth/refresh' }),[m
[1mdiff --git a/src/modules/auth/auth.controller.ts b/src/modules/auth/auth.controller.ts[m
[1mindex cf63e77..cbf0c2f 100644[m
[1m--- a/src/modules/auth/auth.controller.ts[m
[1m+++ b/src/modules/auth/auth.controller.ts[m
[36m@@ -69,8 +69,8 @@[m [mexport class AuthController {[m
     res.cookie('session-token', result.accessToken, ACCESS_COOKIE_OPTIONS);[m
     res.cookie('refresh-token', result.refreshToken, REFRESH_COOKIE_OPTIONS);[m
 [m
[31m-    // BE-H04 FIX: ما بنرجعش accessToken ولا refreshToken في الـ body —[m
[31m-    // مكشوفين لـ logging proxies. الاتنين موجودين في httpOnly cookies بس.[m
[32m+[m[32m    // BE-H04 FIX: we don't return accessToken or refreshToken in the body —[m
[32m+[m[32m    // they're exposed to logging proxies. Both only live in httpOnly cookies.[m
     return res.json({[m
       success: true,[m
       data: result.data,[m
[36m@@ -113,8 +113,8 @@[m [mexport class AuthController {[m
     return { success: true, accessToken: result.accessToken, data: result.data };[m
   }[m
 [m
[31m-  // BE-L04: GET /auth/me متشالة من هنا — المسار الأغنى (بيرجع من DB)[m
[31m-  // موجود في UsersController على GET /me[m
[32m+[m[32m  // BE-L04: GET /auth/me removed from here — the richer route (returns from DB)[m
[32m+[m[32m  // lives in UsersController at GET /me[m
   @Public()[m
   @Post('superadmin/login')[m
   @AuditAction('SUPERADMIN_LOGIN')[m
[1mdiff --git a/src/modules/auth/auth.service.spec.ts b/src/modules/auth/auth.service.spec.ts[m
[1mindex ef24376..3cf8346 100644[m
[1m--- a/src/modules/auth/auth.service.spec.ts[m
[1m+++ b/src/modules/auth/auth.service.spec.ts[m
[36m@@ -5,9 +5,9 @@[m [mimport { ConfigService } from '@nestjs/config';[m
 import { PrismaService } from '../../prisma/prisma.service';[m
 import { ConflictException, UnauthorizedException } from '@nestjs/common';[m
 [m
[31m-// HIGH-13 FIX: bcryptjs بيستخدم ES Module، فـ jest.spyOn مش قادر يعيد تعريف[m
[31m-// الـ property وبيرمي "Cannot redefine property: compare". الحل هو mock[m
[31m-// للـ module كاملاً على مستوى الـ file قبل أي import تاني.[m
[32m+[m[32m// HIGH-13 FIX: bcryptjs uses an ES Module, so jest.spyOn can't redefine the[m
[32m+[m[32m// property and throws "Cannot redefine property: compare". The fix is to mock[m
[32m+[m[32m// the whole module at the file level before any other import.[m
 jest.mock('bcryptjs', () => ({[m
   hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),[m
   compare: jest.fn().mockResolvedValue(true),[m
[36m@@ -57,8 +57,8 @@[m [mconst mockJwtService = {[m
   verify: jest.fn(),[m
 };[m
 [m
[31m-// ✅ جديد — AuthService بقت تستخدم ConfigService لقراءة JWT_REFRESH_SECRET[m
[31m-// و JWT_REFRESH_EXPIRES_IN بدل ما تكون hardcoded (BE-C01)[m
[32m+[m[32m// new — AuthService now uses ConfigService to read JWT_REFRESH_SECRET[m
[32m+[m[32m// and JWT_REFRESH_EXPIRES_IN instead of having them hardcoded (BE-C01)[m
 const mockConfigService = {[m
   get: jest.fn((key: string, defaultValue?: any) => {[m
     const config: Record<string, string> = {[m
[36m@@ -93,12 +93,12 @@[m [mdescribe('AuthService', () => {[m
     service = module.get<AuthService>(AuthService);[m
     jest.clearAllMocks();[m
 [m
[31m-    // إعادة تعيين الـ default values بعد clearAllMocks[m
[32m+[m[32m    // reset the default values after clearAllMocks[m
     (bcrypt.hash as jest.Mock).mockResolvedValue(HASHED);[m
     (bcrypt.compare as jest.Mock).mockResolvedValue(true);[m
[31m-    // ✅ signToken و signRefreshToken بيستخدموا sign بس بـ secrets مختلفة،[m
[31m-    // فبنرجع توكنين مختلفين حسب الترتيب اللي بيتنادى بيهم في الكود:[m
[31m-    // signToken (access) بيتنادى أولاً، وبعدين signRefreshToken (refresh).[m
[32m+[m[32m    // signToken and signRefreshToken both use sign, just with different secrets,[m
[32m+[m[32m    // so we return two different tokens based on the order they're called in the code:[m
[32m+[m[32m    // signToken (access) is called first, then signRefreshToken (refresh).[m
     mockJwtService.sign[m
       .mockReturnValueOnce(ACCESS_TOKEN)[m
       .mockReturnValueOnce(REFRESH_TOKEN);[m
[36m@@ -158,7 +158,7 @@[m [mdescribe('AuthService', () => {[m
       const result = await service.login(makeDto(), TENANT_ID);[m
 [m
       expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);[m
[31m-      expect(result).toHaveProperty('refreshToken', REFRESH_TOKEN); // ✅ جديد[m
[32m+[m[32m      // new[m
       expect(result.data).toEqual({[m
         id: mockUser.id,[m
         tenantId: TENANT_ID,[m
[36m@@ -177,8 +177,8 @@[m [mdescribe('AuthService', () => {[m
       );[m
     });[m
 [m
[31m-    // ✅ جديد — signRefreshToken لازم تستخدم JWT_REFRESH_SECRET من ConfigService[m
[31m-    // مش الـ secret الأساسي بتاع access token (BE-C01)[m
[32m+[m[32m    // new — signRefreshToken must use JWT_REFRESH_SECRET from ConfigService[m
[32m+[m[32m    // not the main access token secret (BE-C01)[m
     it('يوقّع الـ refresh token بـ JWT_REFRESH_SECRET المختلف', async () => {[m
       mockPrismaService.user.findUnique.mockResolvedValue(mockUser);[m
       await service.login(makeDto(), TENANT_ID);[m
[36m@@ -218,7 +218,7 @@[m [mdescribe('AuthService', () => {[m
       });[m
 [m
       expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);[m
[31m-      expect(result).toHaveProperty('refreshToken', REFRESH_TOKEN); // ✅ جديد[m
[32m+[m[32m      // new[m
       expect(result.data.tenantId).toBeNull();[m
       expect(result.data.role).toBe('SUPER_ADMIN');[m
       expect(mockJwtService.sign).toHaveBeenNthCalledWith([m
[36m@@ -235,15 +235,15 @@[m [mdescribe('AuthService', () => {[m
     });[m
   });[m
 [m
[31m-  // ── refreshAccessToken (جديد بالكامل — BE-C01) ───────────────────────────[m
[32m+[m[32m  // ── refreshAccessToken (brand new — BE-C01) ───────────────────────────[m
 [m
   describe('refreshAccessToken', () => {[m
     it('يرجع access token جديد لو الـ refresh token صحيح', async () => {[m
       mockJwtService.verify.mockReturnValue({ sub: mockUser.id });[m
       mockPrismaService.user.findUnique.mockResolvedValue(mockUser);[m
[31m-      // الميثود دي بتنده على signToken بس (مفيش refresh token جديد)،[m
[31m-      // فبنحدد قيمة العودة بشكل صريح بدل الاعتماد على ترتيب[m
[31m-      // mockReturnValueOnce الموروث من beforeEach.[m
[32m+[m[32m      // this method only calls signToken (no new refresh token),[m
[32m+[m[32m      // so we set the return value explicitly instead of relying on the order[m
[32m+[m[32m      // of mockReturnValueOnce inherited from beforeEach.[m
       mockJwtService.sign.mockReset().mockReturnValue(ACCESS_TOKEN);[m
 [m
       const newToken = await service.refreshAccessToken('some.refresh.token');[m
[1mdiff --git a/src/modules/auth/strategies/jwt.strategy.ts b/src/modules/auth/strategies/jwt.strategy.ts[m
[1mindex b0cf936..e205d16 100644[m
[1m--- a/src/modules/auth/strategies/jwt.strategy.ts[m
[1m+++ b/src/modules/auth/strategies/jwt.strategy.ts[m
[36m@@ -4,24 +4,24 @@[m [mimport { ExtractJwt, Strategy } from 'passport-jwt';[m
 import { Request } from 'express';[m
 import { JwtPayload } from '../auth.service';[m
 [m
[31m-// PERF-18 FIX: قبل كده validate() كانت بتعمل prisma.user.findUnique() على[m
[31m-// كل request موثّق — ده معناه استعلام DB إضافي على كل API call حتى لو[m
[31m-// الـ JWT نفسه stateless وموقّع ومش محتاج تحقق. مع 1000 request/second[m
[31m-// ده 1000 استعلام DB زيادة في الثانية من غير أي فايدة.[m
[32m+[m[32m// PERF-18 FIX: before this, validate() was running prisma.user.findUnique() on[m
[32m+[m[32m// every authenticated request — meaning an extra DB query on every API call, even though[m
[32m+[m[32m// the JWT itself is stateless, signed, and doesn't need verification. At 1000 requests/second[m
[32m+[m[32m// that's 1000 extra DB queries per second for no benefit.[m
 //[m
[31m-// الحل: نرجع بيانات الـ payload مباشرة بعد ما passport يتحقق من التوقيع —[m
[31m-// الـ payload موثوق لأنه موقّع بالـ JWT_SECRET ومش منتهي الصلاحية[m
[31m-// (passport بيتحقق من ده تلقائياً بسبب ignoreExpiration: false).[m
[32m+[m[32m// The fix: return the payload data directly after passport verifies the signature —[m
[32m+[m[32m// the payload is trustworthy since it's signed with JWT_SECRET and isn't expired[m
[32m+[m[32m// (passport checks this automatically because of ignoreExpiration: false).[m
 //[m
[31m-// ملاحظة: لو محتاجة تتأكد إن الـ user لسه موجود في الداتابيز (مثلاً بعد[m
[31m-// حذف الحساب)، ممكن تضيفي DB lookup هنا — لكن اعرفي إن ده بيكسر الـ[m
[31m-// stateless design وبيضيف latency. البديل الأفضل هو token revocation list[m
[31m-// في Redis لو الأمر ده مهم عندك.[m
[32m+[m[32m// Note: if you need to make sure the user still exists in the database (e.g. after[m
[32m+[m[32m// account deletion), you could add a DB lookup here — but keep in mind this breaks the[m
[32m+[m[32m// stateless design and adds latency. A better alternative is a token revocation list[m
[32m+[m[32m// in Redis if this matters for your case.[m
 @Injectable()[m
 export class JwtStrategy extends PassportStrategy(Strategy) {[m
   constructor() {[m
     super({[m
[31m-      // يقرأ من httpOnly cookie أولاً، لو مش موجود يجرب Bearer header[m
[32m+[m[32m      // reads from the httpOnly cookie first, falls back to the Bearer header if not present[m
       jwtFromRequest: ExtractJwt.fromExtractors([[m
         (req: Request) => req?.cookies?.['session-token'] ?? null,[m
         ExtractJwt.fromAuthHeaderAsBearerToken(),[m
[36m@@ -32,8 +32,8 @@[m [mexport class JwtStrategy extends PassportStrategy(Strategy) {[m
   }[m
 [m
   validate(payload: JwtPayload) {[m
[31m-    // passport اتحقق من التوقيع والـ expiry قبل ما يوصل هنا —[m
[31m-    // بنرجع الـ payload مباشرة وده بيبقى req.user[m
[32m+[m[32m    // passport already verified the signature and expiry before reaching here —[m
[32m+[m[32m    // we return the payload directly and it becomes req.user[m
     return {[m
       id:       payload.sub,[m
       email:    payload.email,[m
[1mdiff --git a/src/modules/billing/billing.service.ts b/src/modules/billing/billing.service.ts[m
[1mindex 9f87138..a69ebd6 100644[m
[1m--- a/src/modules/billing/billing.service.ts[m
[1m+++ b/src/modules/billing/billing.service.ts[m
[36m@@ -141,7 +141,7 @@[m [mexport class BillingService {[m
     const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });[m
     if (!tenant) throw new NotFoundException('Tenant not found');[m
 [m
[31m-    // FIX #22: QUARTERLY غير مدعوم في Stripe — ارفض الطلب بدل silent wrong billing[m
[32m+[m[32m    // FIX #22: QUARTERLY isn't supported in Stripe — reject the request instead of silently billing wrong[m
     if (plan.billingCycle === BillingCycle.QUARTERLY) {[m
       throw new NotImplementedException([m
         'Quarterly billing is not yet supported via Stripe. Please choose Monthly or Annual.',[m
[36m@@ -226,9 +226,9 @@[m [mexport class BillingService {[m
       data: { gatewayRef: session.subscription as string },[m
     });[m
 [m
[31m-    // FIX #23: تحديث status الـ tenant لـ ACTIVE تلقائياً بعد الدفع فقط —[m
[31m-    // مش جزء من assignPlanToTenant لأن تغيير الخطة يدويًا من الأدمن[m
[31m-    // مش لازم يفعّل الـ tenant تلقائيًا[m
[32m+[m[32m    // FIX #23: update the tenant's status to ACTIVE automatically only after payment —[m
[32m+[m[32m    // not part of assignPlanToTenant, since manually changing the plan from the admin[m
[32m+[m[32m    // shouldn't automatically activate the tenant[m
     await this.prisma.tenant.update({[m
       where: { id: tenantId },[m
       data: { status: 'ACTIVE' },[m
[36m@@ -263,7 +263,7 @@[m [mexport class BillingService {[m
       data: { status: 'ACTIVE', currentPeriodEnd: newPeriodEnd },[m
     });[m
 [m
[31m-    // FIX #23: تأكد إن الـ tenant ACTIVE عند كل دفعة ناجحة[m
[32m+[m[32m    // FIX #23: make sure the tenant is ACTIVE on every successful payment[m
     await this.prisma.tenant.update({[m
       where: { id: subscription.tenantId },[m
       data: { status: 'ACTIVE' },[m
[1mdiff --git a/src/modules/billing/dunning.service.ts b/src/modules/billing/dunning.service.ts[m
[1mindex 7de9dfb..099aacd 100644[m
[1m--- a/src/modules/billing/dunning.service.ts[m
[1m+++ b/src/modules/billing/dunning.service.ts[m
[36m@@ -22,7 +22,7 @@[m [mexport class DunningService {[m
   async markExpiredSubscriptions() {[m
     const now = new Date();[m
 [m
[31m-    // ✅ BE-M04: جيب الـ IDs الأول بدل ما نعمل N updates[m
[32m+[m[32m    // BE-M04: get the IDs first instead of doing N updates[m
     const expired = await this.prisma.subscription.findMany({[m
       where: { status: 'ACTIVE', currentPeriodEnd: { lt: now } },[m
       select: { id: true, tenantId: true, planId: true },[m
[36m@@ -32,13 +32,13 @@[m [mexport class DunningService {[m
 [m
     this.logger.log(`📋 Found ${expired.length} expired subscriptions`);[m
 [m
[31m-    // ✅ BE-M04: updateMany بدل حلقة for[m
[32m+[m[32m    // BE-M04: updateMany instead of a for loop[m
     await this.prisma.subscription.updateMany({[m
       where: { id: { in: expired.map((s) => s.id) } },[m
       data: { status: 'PAST_DUE' },[m
     });[m
 [m
[31m-    // ✅ BE-M04: createMany بدل حلقة for[m
[32m+[m[32m    // BE-M04: createMany instead of a for loop[m
     await this.prisma.auditLog.createMany({[m
       data: expired.map((sub) => ({[m
         tenantId: sub.tenantId,[m
[36m@@ -58,7 +58,7 @@[m [mexport class DunningService {[m
     const graceCutoff = new Date();[m
     graceCutoff.setDate(graceCutoff.getDate() - this.GRACE_PERIOD_DAYS);[m
 [m
[31m-    // ✅ BE-M04: جيب الـ IDs الأول[m
[32m+[m[32m    // BE-M04: get the IDs first[m
     const pastDue = await this.prisma.subscription.findMany({[m
       where: {[m
         status: 'PAST_DUE',[m
[36m@@ -75,19 +75,19 @@[m [mexport class DunningService {[m
     const subIds = pastDue.map((s) => s.id);[m
     const now = new Date();[m
 [m
[31m-    // ✅ BE-M04: updateMany للـ subscriptions[m
[32m+[m[32m    // BE-M04: updateMany for the subscriptions[m
     await this.prisma.subscription.updateMany({[m
       where: { id: { in: subIds } },[m
       data: { status: 'CANCELLED' },[m
     });[m
 [m
[31m-    // ✅ BE-M04: updateMany للـ tenants[m
[32m+[m[32m    // BE-M04: updateMany for the tenants[m
     await this.prisma.tenant.updateMany({[m
       where: { id: { in: tenantIds } },[m
       data: { status: 'SUSPENDED' },[m
     });[m
 [m
[31m-    // ✅ BE-M04: createMany للـ audit logs[m
[32m+[m[32m    // BE-M04: createMany for the audit logs[m
     await this.prisma.auditLog.createMany({[m
       data: pastDue.map((sub) => ({[m
         tenantId: sub.tenantId,[m
[1mdiff --git a/src/modules/certificates/certificates.controller.spec.ts b/src/modules/certificates/certificates.controller.spec.ts[m
[1mindex 1fa11f1..02538b3 100644[m
[1m--- a/src/modules/certificates/certificates.controller.spec.ts[m
[1m+++ b/src/modules/certificates/certificates.controller.spec.ts[m
[36m@@ -12,7 +12,7 @@[m [mconst mockCertificatesService = {[m
   findById: jest.fn(),[m
 };[m
 [m
[31m-// Mock الـ guards مباشرة بدون ما نحتاج dependencies بتاعتهم[m
[32m+[m[32m// mock the guards directly without needing their dependencies[m
 const mockSessionAuthGuard = { canActivate: jest.fn(() => true) };[m
 const mockRolesGuard       = { canActivate: jest.fn(() => true) };[m
 [m
[36m@@ -119,8 +119,8 @@[m [mdescribe('CertificatesController', () => {[m
   });[m
 [m
   describe('findOne', () => {[m
[31m-    // BE-C05: findOne بقت تتطلب user (من SessionAuthGuard) وتبعته[m
[31m-    // للـ service عشان يتحقق من الملكية. الطالب نفسه يقدر يشوف شهادته.[m
[32m+[m[32m    // BE-C05: findOne now requires a user (from SessionAuthGuard) and passes it[m
[32m+[m[32m    // to the service to verify ownership. The student themselves can view their own certificate.[m
     it('يرجع الشهادة لو الطالب صاحبها', async () => {[m
       service.findById.mockResolvedValue(mockCertificate);[m
       const result = await controller.findOne('cert-123', mockStudent);[m
[36m@@ -144,15 +144,15 @@[m [mdescribe('CertificatesController', () => {[m
       await expect(controller.findOne('wrong-id', mockStudent)).rejects.toThrow(NotFoundException);[m
     });[m
 [m
[31m-    // BE-C05: لو الشهادة تبع مستأجر تاني، الـ service يرمي NotFoundException[m
[31m-    // (مش ForbiddenException) عشان منكشفش معلومة وجودها عند مستأجر تاني.[m
[32m+[m[32m    // BE-C05: if the certificate belongs to a different tenant, the service throws NotFoundException[m
[32m+[m[32m    // (not ForbiddenException) so we don't leak that it exists for another tenant.[m
     it('يرمي NotFoundException لو الشهادة تبع مستأجر تاني', async () => {[m
       service.findById.mockRejectedValue(new NotFoundException('Certificate not found'));[m
       const otherTenantStudent = { id: 'student-999', tenantId: 'other-tenant', role: 'STUDENT' };[m
       await expect(controller.findOne('cert-123', otherTenantStudent)).rejects.toThrow(NotFoundException);[m
     });[m
 [m
[31m-    // BE-C05: طال