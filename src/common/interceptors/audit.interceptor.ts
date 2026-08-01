import {
  Injectable, NestInterceptor, ExecutionContext, CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

export const AUDIT_ACTION_KEY = 'audit_action';

// Decorator to specify the action
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

    // if no action is specified — don't log
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

          // for a regular admin: their own tenantId. For SUPER_ADMIN doing createTenant
          // on a new tenant, the user itself has no tenantId, so we use the target as the tenantId
          // in this case, since it's the same tenant the action was performed on.
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