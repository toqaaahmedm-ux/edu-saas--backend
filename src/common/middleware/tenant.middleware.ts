import { Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { tenantContext } from '../tenant-context'; 

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const isProduction = process.env.NODE_ENV === 'production';

    // Priority 1: subdomain resolution
    const host = req.hostname;
    const parts = host.split('.');

    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      const subdomain = parts[0];
      const tenant = await this.prisma.tenant.findUnique({
        where: { subdomain },
      });

      if (!tenant) {
        throw new NotFoundException(`Tenant '${subdomain}' not found`);
      }

      (req as any).tenantId = tenant.id;
      // ✅ حط الـ tenantId في AsyncLocalStorage عشان prisma.service يشوفه
      return tenantContext.run({ tenantId: tenant.id }, () => next());
    }

    // Priority 2: explicit header — DEVELOPMENT ONLY
    if (!isProduction) {
      const headerTenantId = req.headers['x-tenant-id'] as string;
      if (headerTenantId) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: headerTenantId },
        });
        if (!tenant) {
          throw new NotFoundException(`Tenant '${headerTenantId}' not found`);
        }
        (req as any).tenantId = tenant.id;
       
        return tenantContext.run({ tenantId: tenant.id }, () => next());
      }
    }

    // Priority 3: SuperAdmin requests
    (req as any).tenantId = null;
    // ✅ SuperAdmin — tenantId = null عشان يعدي الـ RLS
    tenantContext.run({ tenantId: null }, () => next());
  }
}