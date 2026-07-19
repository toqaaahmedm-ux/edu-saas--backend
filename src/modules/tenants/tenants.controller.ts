import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { UpdateBrandingDto } from './dto/update-branding.dto';

// This controller is intentionally separate from AdminController.
// AdminController's tenant endpoints are all locked behind
// @Roles(Role.SUPER_ADMIN), but resolve/:subdomain has to be callable by
// anyone (specifically: our own Next.js server, before a user even has an
// account) so it can turn a subdomain into a real tenant UUID.
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  // Public on purpose — this only ever returns an id, nothing else.
  @Public()
  @Get('resolve/:subdomain')
  async resolveBySubdomain(@Param('subdomain') subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${subdomain}' not found`);
    }

    return { tenantId: tenant.id };
  }

  // Public branding lookup — used by the frontend to paint the right
  // logo/color before a visitor even logs in (e.g. on the login page).
  @Public()
  @Get(':subdomain/branding')
  async getBranding(@Param('subdomain') subdomain: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain },
      select: { displayName: true, logoUrl: true, primaryColor: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant '${subdomain}' not found`);
    }

    return {
      displayName: tenant.displayName ?? tenant.name,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor ?? '#2563EB',
    };
  }

  // Only an ADMIN can update branding, and only for their OWN tenant —
  // we deliberately ignore any tenantId that might come from the request
  // body/params and always use the tenantId baked into the caller's own
  // session token. Otherwise an admin could edit another school's branding
  // just by guessing or changing an id somewhere in the request.
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('branding')
  async updateBranding(
    @GetUser() user: any,
    @Body() dto: UpdateBrandingDto,
  ) {
    if (!user.tenantId) {
      throw new NotFoundException('No tenant associated with this account');
    }

    return this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
      },
      select: { id: true, displayName: true, logoUrl: true, primaryColor: true },
    });
  }
}