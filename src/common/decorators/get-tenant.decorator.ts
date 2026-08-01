import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// @GetTenant() decorator — pulls the tenantId off the request
export const GetTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId ?? null;
  },
);