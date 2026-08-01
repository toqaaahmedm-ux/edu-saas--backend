import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { BillingCycle } from '@prisma/client';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.stripe = new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
      apiVersion: '2026-05-27.dahlia',
    });
  }

  async getAllPlans() {
    return this.prisma.plan.findMany({
      where: { isArchived: false },
      include: { features: true },
      orderBy: { price: 'asc' },
    });
  }

  async getPlanById(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { features: true },
    });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async createPlan(data: {
    name: string;
    price: number;
    currency?: string;
    billingCycle?: BillingCycle;
    maxStudents?: number;
    maxCourses?: number;
    maxStorageGb?: number;
    maxLiveHours?: number;
    features?: { featureKey: string; enabled: boolean; limitValue?: number }[];
  }) {
    const { features, ...planData } = data;
    return this.prisma.plan.create({
      data: {
        ...planData,
        features: features ? { create: features } : undefined,
      },
      include: { features: true },
    });
  }

  async updatePlan(
    id: string,
    data: Partial<{
      name: string;
      price: number;
      maxStudents: number;
      maxCourses: number;
      maxStorageGb: number;
      maxLiveHours: number;
      isArchived: boolean;
    }>,
  ) {
    await this.getPlanById(id);
    return this.prisma.plan.update({
      where: { id },
      data,
      include: { features: true },
    });
  }

  async archivePlan(id: string) {
    return this.updatePlan(id, { isArchived: true });
  }

  async getTenantSubscription(tenantId: string) {
    return this.prisma.subscription.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      include: { plan: { include: { features: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // SA-C02 fix: single source of truth for changing a tenant's plan.
  // Before this, admin.service's assignPlan touched only tenant.planId, and
  // subscribeTenant touched only Subscription — so a tenant could be billed
  // for one plan while feature-gating read a different one. This method is
  // now the only place that updates both, inside one transaction.
  async assignPlanToTenant(tenantId: string, planId: string) {
    await this.getPlanById(planId); // throws NotFoundException if missing

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    return this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { tenantId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });

      const subscription = await tx.subscription.create({
        data: { tenantId, planId, status: 'ACTIVE', currentPeriodEnd },
        include: { plan: { include: { features: true } } },
      });

      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { planId },
        include: { plan: { select: { id: true, name: true } } },
      });

      return { tenant: updatedTenant, subscription };
    });
  }

  // Kept for backward compatibility with any existing caller —
  // delegates to the canonical method above instead of updating
  // Subscription alone.
  async subscribeTenant(tenantId: string, planId: string) {
    const { subscription } = await this.assignPlanToTenant(tenantId, planId);
    return subscription;
  }

  async createCheckoutSession(tenantId: string, planId: string) {
    const plan = await this.getPlanById(planId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    // FIX #22: QUARTERLY غير مدعوم في Stripe — ارفض الطلب بدل silent wrong billing
    if (plan.billingCycle === BillingCycle.QUARTERLY) {
      throw new NotImplementedException(
        'Quarterly billing is not yet supported via Stripe. Please choose Monthly or Annual.',
      );
    }

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const unitAmount = Math.round(Number(plan.price) * 100);

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: plan.currency.toLowerCase(),
            product_data: {
              name: `EduSaaS — ${plan.name} Plan`,
              description: `${plan.maxStudents} students · ${plan.maxCourses} courses`,
            },
            unit_amount: unitAmount,
            recurring: {
              // FIX #22: ANNUAL → year, MONTHLY → month, QUARTERLY blocked above
              interval: plan.billingCycle === BillingCycle.ANNUAL ? 'year' : 'month',
            },
          },
          quantity: 1,
        },
      ],
      metadata: { tenantId, planId },
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing/cancel`,
    });

    return { url: session.url, sessionId: session.id };
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string) {
    const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature invalid: ${err.message}`);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_succeeded':
        await this.onInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.onInvoiceFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }

    return { received: true };
  }

  // SA-C02 fix: now delegates to assignPlanToTenant so tenant.planId and
  // Subscription are updated together, then layers on the Stripe-specific
  // bits (gatewayRef, forcing tenant ACTIVE, invoice) on top.
  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { tenantId, planId } = session.metadata ?? {};
    if (!tenantId || !planId) return;

    const { subscription } = await this.assignPlanToTenant(tenantId, planId);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { gatewayRef: session.subscription as string },
    });

    // FIX #23: تحديث status الـ tenant لـ ACTIVE تلقائياً بعد الدفع فقط —
    // مش جزء من assignPlanToTenant لأن تغيير الخطة يدويًا من الأدمن
    // مش لازم يفعّل الـ tenant تلقائيًا
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE' },
    });

    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  }

  private async onInvoicePaid(stripeInvoice: Stripe.Invoice) {
    const gatewayRef = (stripeInvoice as any).subscription as string;
    if (!gatewayRef) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { gatewayRef },
      include: { plan: true },
    });
    if (!subscription) return;

    const newPeriodEnd = new Date();
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE', currentPeriodEnd: newPeriodEnd },
    });

    // FIX #23: تأكد إن الـ tenant ACTIVE عند كل دفعة ناجحة
    await this.prisma.tenant.update({
      where: { id: subscription.tenantId },
      data: { status: 'ACTIVE' },
    });

    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  }

  private async onInvoiceFailed(stripeInvoice: Stripe.Invoice) {
    const gatewayRef = (stripeInvoice as any).subscription as string;
    if (!gatewayRef) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { gatewayRef },
      include: { plan: true },
    });
    if (!subscription) return;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'PAST_DUE' },
    });

    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: 'FAILED',
      },
    });
  }

  private async onSubscriptionCancelled(stripeSub: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { gatewayRef: stripeSub.id },
      data: { status: 'CANCELLED' },
    });
  }

  async checkFeatureAccess(tenantId: string, featureKey: string): Promise<boolean> {
    const subscription = await this.getTenantSubscription(tenantId);
    if (!subscription) return false;
    const feature = subscription.plan.features.find((f) => f.featureKey === featureKey);
    return feature?.enabled ?? false;
  }

  async assertFeatureAccess(tenantId: string, featureKey: string) {
    const hasAccess = await this.checkFeatureAccess(tenantId, featureKey);
    if (!hasAccess) {
      throw new ForbiddenException(
        `Your current plan does not include ${featureKey}. Please upgrade.`,
      );
    }
  }

  async getTenantPlanInfo(tenantId: string) {
    const subscription = await this.getTenantSubscription(tenantId);
    if (!subscription) return { plan: null, features: [], limits: null, usage: null };

    const [enrollmentCount, courseCount] = await Promise.all([
      this.prisma.enrollment.count({ where: { tenantId } }),
      this.prisma.course.count({ where: { tenantId } }),
    ]);

    return {
      plan: subscription.plan,
      features: subscription.plan.features,
      usage: { students: enrollmentCount, courses: courseCount },
      limits: {
        maxStudents: subscription.plan.maxStudents,
        maxCourses: subscription.plan.maxCourses,
        maxStorageGb: subscription.plan.maxStorageGb,
        maxLiveHours: subscription.plan.maxLiveHours,
      },
      currentPeriodEnd: subscription.currentPeriodEnd,
    };
  }

  // SuperAdmin-facing: every subscription across every tenant, for the
  // platform billing overview page. Distinct from getTenantInvoices,
  // which is scoped to a single tenant.
  async getAllSubscriptions() {
    return this.prisma.subscription.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: { select: { id: true, name: true, subdomain: true, status: true } },
        plan: { select: { id: true, name: true, price: true, currency: true } },
      },
    });
  }

  async getAllInvoices(limit: number = 50) {
    return this.prisma.invoice.findMany({
      orderBy: { issuedAt: 'desc' },
      take: limit,
      include: {
        subscription: {
          include: {
            tenant: { select: { id: true, name: true, subdomain: true } },
            plan: { select: { name: true } },
          },
        },
      },
    });
  }
  
  async getTenantInvoices(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { subscription: { tenantId } },
      orderBy: { issuedAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
    });
  }
}