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

@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

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

  // NEW (REQ-11): lets a logged-in ADMIN fetch their own tenant's branding
  // without needing to know their subdomain up front — used by the
  // admin Settings page.
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('me/branding-self')
  async getMyBranding(@GetUser() user: any) {
    if (!user.tenantId) {
      throw new NotFoundException('No tenant associated with this account');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { displayName: true, logoUrl: true, primaryColor: true, name: true, subdomain: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return {
      displayName: tenant.displayName ?? tenant.name,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor ?? '#2563EB',
      subdomain: tenant.subdomain,
    };
  }

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
