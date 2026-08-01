import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Role } from '@prisma/client';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('admin')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getPlatformStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('analytics')
  getPlatformAnalytics() {
    return this.adminService.getPlatformAnalytics();
  }

  @Roles(Role.ADMIN)
  @Get('analytics/tenant')
  getTenantAnalytics(@GetUser() user: any) {
    return this.adminService.getTenantAnalytics(user.tenantId);
  }

  @Roles(Role.ADMIN)
  @Get('tenant-analytics')
  getTenantAnalyticsAlias(@GetUser() user: any) {
    return this.adminService.getTenantAnalytics(user.tenantId);
  }

  @Roles(Role.ADMIN)
  @Get('analytics/academic')
  getAcademicOverview(@GetUser() user: any) {
    return this.adminService.getAcademicOverview(user.tenantId);
  }

  @Roles(Role.ADMIN)
  @Get('usage/me')
  getMyUsage(@GetUser() user: any) {
    return this.adminService.getTenantUsage(user.tenantId);
  }

  @Get('tenants')
  findAllTenants(
    @Query('page') page = '1',
    @Query('limit') limit = '10',
  ) {
    return this.adminService.findAllTenants(+page, +limit);
  }

  @Get('tenants/:id')
  findTenantById(@Param('id') id: string) {
    return this.adminService.findTenantById(id);
  }

  @AuditAction('TENANT_CREATED')
  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @AuditAction('TENANT_UPDATED')
  @Patch('tenants/:id')
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.adminService.updateTenant(id, dto);
  }

  @AuditAction('TENANT_SUSPENDED')
  @Patch('tenants/:id/suspend')
  suspendTenant(
    @Param('id') id: string,
    @GetUser() user: any,
  ) {
    return this.adminService.suspendTenant(id, user.id);
  }

  @Patch('tenants/:id/extend-trial')
  extendTrial(
    @Param('id') id: string,
    @Body() body: { days: number },
    @GetUser() user: any,
  ) {
    return this.adminService.extendTrial(id, body.days, user.id);
  }

  @AuditAction('PLAN_ASSIGNED')
  @Patch('tenants/:id/plan')
  assignPlan(
    @Param('id') id: string,
    @Body() body: { planId: string },
    @GetUser() user: any,
  ) {
    return this.adminService.assignPlan(id, body.planId, user.id);
  }

  @Get('tenants/:id/usage')
  getTenantUsage(@Param('id') id: string) {
    return this.adminService.getTenantUsage(id);
  }

  @Get('audit-logs')
  getAuditLogs(
    @Query('tenantId') tenantId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.adminService.getAuditLogs(tenantId, +page, +limit);
  }

  @Get('plans')
  findAllPlans() {
    return this.adminService.findAllPlans();
  }
}
