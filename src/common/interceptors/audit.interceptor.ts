import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

export const AUDIT_ACTION_KEY = 'audit_action';

// Decorator لتحديد الـ action
export const AuditAction = (action: string) =>
  (target: any, key: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(AUDIT_ACTION_KEY, action, descriptor.value);
    return descriptor;
  };

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const action = this.reflector.get<string>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    // لو مفيش action محدد — مش نسجل
    if (!action) return next.handle();

    const req = context.switchToHttp().getRequest();
    const actorId = req.user?.id ?? null;

    return next.handle().pipe(
      tap(async (response: any) => {
        try {
          // Sprint 1 fix: some actions (like createTenant) don't have an :id
          // route param — the target only exists in the response after creation.
          // Falls back to response.id, then response.data.id, then null.
          const target = req.params?.id ?? response?.id ?? response?.data?.id ?? null;

          // للأدمن العادي: tenantId بتاعه هو نفسه. للـ SUPER_ADMIN بيعمل createTenant
          // لتينانت جديد، مفيش tenantId على المستخدم نفسه، فبنستخدم الـ target كـ tenantId
          // في الحالة دي لأنه هو نفسه الـ tenant اللي اتعمل له الإجراء.
          const tenantId = req.user?.tenantId ?? target ?? null;

          await this.prisma.auditLog.create({
            data: { actorId, tenantId, action, target },
          });
        } catch (err) {
          console.error('[AuditInterceptor] Failed to log:', err);
        }
      }),
    );
  }
}