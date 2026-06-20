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
    const tenantId = req.user?.tenantId ?? null;
    const target = req.params?.id ?? null;

    return next.handle().pipe(
      tap(async () => {
        try {
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