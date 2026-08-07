import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Reads the tenant id that TenantMiddleware already resolved (from
// subdomain OR x-tenant-id header) and stored on req.tenantId.
// Do NOT read the x-tenant-id header directly here — that misses the
// subdomain-resolved case entirely, which was the root cause of the
// SuperAdmin-branch bug (login falling through to loginSuperAdmin for
// normal tenant users hitting the site via subdomain with no explicit
// x-tenant-id header).
export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.tenantId ?? null;
  },
);
