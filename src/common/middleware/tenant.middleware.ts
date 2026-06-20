import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Priority 1: explicit header (for development/testing)
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
      (req as any).tenantId = headerTenantId;
      return next();
    }

    // Priority 2: subdomain resolution (production)
    // e.g. "ainshams.platform.com" → subdomain = "ainshams"
    const host = req.hostname; // e.g. "ainshams.localhost" or "ainshams.platform.com"
    const parts = host.split('.');

    // لو في subdomain (مش localhost بس أو platform.com بس)
    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      const subdomain = parts[0];
      const tenant = await this.prisma.tenant.findUnique({
        where: { subdomain },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant '${subdomain}' not found`);
      }

      (req as any).tenantId = tenant.id;
      return next();
    }

    // Priority 3: no tenant (SuperAdmin requests)
    (req as any).tenantId = null;
    next();
  }
}