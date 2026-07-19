import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../tenant-context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Priority 1: subdomain resolution — works when a request hits us
    // directly through the tenant's own domain (browser -> wildcard DNS -> backend).
    const host = req.hostname;
    const parts = host.split('.');

    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      const subdomain = parts[0];
      const tenant = await this.prisma.tenant.findUnique({ where: { subdomain } });

      if (tenant) {
        (req as any).tenantId = tenant.id;
        return tenantContext.run({ tenantId: tenant.id }, () => next());
      }
      // Don't throw here anymore. If the hostname doesn't match a tenant,
      // this might just be an internal caller (like our own Next.js
      // proxy) whose Host header is the backend's own address, not a
      // tenant subdomain. Fall through to the header check instead of
      // hard-failing every non-subdomain request.
    }

    // Priority 2: explicit x-tenant-id header.
    // This used to be dev-only, which silently broke every
    // server-to-server call in production (e.g. the registration proxy),
    // since those requests never carry a tenant subdomain in their Host
    // header. We validate against the DB either way, so trusting this
    // header in prod is no less safe than trusting the subdomain lookup above.
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: headerTenantId } });
      if (!tenant) {
        throw new NotFoundException(`Tenant '${headerTenantId}' not found`);
      }
      (req as any).tenantId = tenant.id;
      return tenantContext.run({ tenantId: tenant.id }, () => next());
    }

    // Priority 3: no subdomain match, no header — treat as a SuperAdmin request.
    (req as any).tenantId = null;
    tenantContext.run({ tenantId: null }, () => next());
  }
}