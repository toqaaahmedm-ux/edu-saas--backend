import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// @GetTenant() decorator — يجيب الـ tenantId من الـ request
export const GetTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId ?? null;
  },
);