import {
  Controller, Get, Post, Patch, Param, Body,
  UseGuards, Req, Headers, RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { DunningService } from './dunning.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '@prisma/client';
import { AuditAction } from '../../common/interceptors/audit.interceptor';

@Controller('billing')
export class BillingController {
  constructor(
    private billingService: BillingService,
    private dunningService: DunningService,
  ) {}

  // ── Public: plan list ──────────────────────────────────────
  @Public()
  @Get('plans')
  getAllPlans() {
    return this.billingService.getAllPlans();
  }

  // ── SuperAdmin: plan management ──────────────────────────────
  // Audit fix: these three mutate global pricing/plan data, which every
  // tenant's billing depends on — they were previously silent, so a
  // plan change had no paper trail at all.
  @AuditAction('PLAN_CREATED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post('plans')
  createPlan(@Body() body: any) {
    return this.billingService.createPlan(body);
  }

  @AuditAction('PLAN_UPDATED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch('plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: any) {
    return this.billingService.updatePlan(id, body);
  }

  @AuditAction('PLAN_ARCHIVED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Patch('plans/:id/archive')
  archivePlan(@Param('id') id: string) {
    return this.billingService.archivePlan(id);
  }

  // ── Tenant: subscription info ─────────────────────────────────
  @UseGuards(SessionAuthGuard)
  @Get('my-plan')
  getMyPlan(@GetUser() user: any) {
    return this.billingService.getTenantPlanInfo(user.tenantId);
  }

  @UseGuards(SessionAuthGuard)
  @Get('invoices')
  getInvoices(@GetUser() user: any) {
    return this.billingService.getTenantInvoices(user.tenantId);
  }

  // ── SuperAdmin: subscribe a tenant to a plan (manual, no Stripe) ─────
  // Audit fix: this changes what a tenant is actually billed/entitled
  // to, same sensitivity as PLAN_ASSIGNED on the admin controller —
  // it just lived on a different controller and got missed.
  @AuditAction('TENANT_SUBSCRIBED')
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post('tenants/:tenantId/subscribe/:planId')
  subscribeTenant(
    @Param('tenantId') tenantId: string,
    @Param('planId') planId: string,
  ) {
    return this.billingService.subscribeTenant(tenantId, planId);
  }

  // ── BILL-02: Stripe Checkout Session ─────────────────────────
  @UseGuards(SessionAuthGuard)
  @Post('checkout/:planId')
  createCheckout(
    @GetUser() user: any,
    @Param('planId') planId: string,
  ) {
    return this.billingService.createCheckoutSession(user.tenantId, planId);
  }

  // ── BILL-02: Stripe Webhook ───────────────────────────────────
  @Public()
  @Post('webhook')
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      return { error: 'Raw body not available — enable rawBody in NestFactory' };
    }
    return this.billingService.handleStripeWebhook(rawBody, signature);
  }

  // ── Feature check ─────────────────────────────────────────────
  @UseGuards(SessionAuthGuard)
  @Get('feature/:featureKey')
  checkFeature(@GetUser() user: any, @Param('featureKey') featureKey: string) {
    return this.billingService.checkFeatureAccess(user.tenantId, featureKey);
  }

  // ── BILL-03: Dunning manual trigger (SuperAdmin only) ─────────
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post('dunning/run')
  runDunning() {
    return this.dunningService.runManually();
  }
}