import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
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

  // ── Plans ────────────────────────────────────────────────────

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

  // ── Subscriptions ────────────────────────────────────────────

  async getTenantSubscription(tenantId: string) {
    return this.prisma.subscription.findFirst({
      where: { tenantId, status: 'ACTIVE' },
      include: { plan: { include: { features: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** SuperAdmin: اشتراك مباشر بدون Stripe (تجريبي / يدوي) */
  async subscribeTenant(tenantId: string, planId: string) {
    await this.getPlanById(planId);

    await this.prisma.subscription.updateMany({
      where: { tenantId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    return this.prisma.subscription.create({
      data: { tenantId, planId, status: 'ACTIVE', currentPeriodEnd },
      include: { plan: { include: { features: true } } },
    });
  }

  // ── BILL-02: Stripe Checkout ──────────────────────────────────

  /**
   * ينشئ Stripe Checkout Session للـ tenant عشان يدفع خطة معينة.
   * بيرجع { url } — الفرونت يعمل redirect عليه.
   */
  async createCheckoutSession(tenantId: string, planId: string) {
    const plan = await this.getPlanById(planId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    // السعر بالـ piastres (Stripe بيتعامل بأصغر وحدة عملة)
    // EGP: 1 جنيه = 100 قرش
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
              interval:
                plan.billingCycle === BillingCycle.ANNUAL
                  ? 'year'
                  : plan.billingCycle === BillingCycle.QUARTERLY
                    ? 'month' // Stripe مش عنده quarter — هنتعامل معاه يدوي
                    : 'month',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        tenantId,
        planId,
      },
      success_url: `${frontendUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/billing/cancel`,
    });

    return { url: session.url, sessionId: session.id };
  }

  // ── BILL-02: Stripe Webhook ───────────────────────────────────

  /**
   * بيستقبل webhook events من Stripe ويعالجهم.
   * لازم الـ request يوصل كـ raw buffer — مش parsed JSON.
   */
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
        // نتجاهل الـ events التانية
        break;
    }

    return { received: true };
  }

  /** checkout.session.completed — ننشئ subscription + invoice في DB */
  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const { tenantId, planId } = session.metadata ?? {};
    if (!tenantId || !planId) return;

    // نلغي أي subscription قديمة
    await this.prisma.subscription.updateMany({
      where: { tenantId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });

    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    const plan = await this.getPlanById(planId);

    const subscription = await this.prisma.subscription.create({
      data: {
        tenantId,
        planId,
        status: 'ACTIVE',
        currentPeriodEnd,
        gatewayRef: session.subscription as string,
      },
    });

    // نحدّث status الـ tenant
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', planId },
    });

    // ننشئ Invoice
    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: plan.price,
        currency: plan.currency,
        status: 'PAID',
        paidAt: new Date(),
      },
    });
  }

  /** invoice.payment_succeeded — نحدّث Invoice الموجود أو ننشئ واحد جديد */
  private async onInvoicePaid(stripeInvoice: Stripe.Invoice) {
    const gatewayRef = (stripeInvoice as any).subscription as string;
    if (!gatewayRef) return;

    const subscription = await this.prisma.subscription.findFirst({
      where: { gatewayRef },
      include: { plan: true },
    });
    if (!subscription) return;

    // نمدد الـ period
    const newPeriodEnd = new Date();
    newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'ACTIVE', currentPeriodEnd: newPeriodEnd },
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

  /** invoice.payment_failed — نحط الـ subscription على PAST_DUE */
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

    // نسجل فاتورة فاشلة
    await this.prisma.invoice.create({
      data: {
        subscriptionId: subscription.id,
        amount: subscription.plan.price,
        currency: subscription.plan.currency,
        status: 'FAILED',
      },
    });

    // BILL-03: dunning — نعلق الـ tenant لو فاشل أكتر من مرة (هيتعمل في BullMQ job)
  }

  /** customer.subscription.deleted — نلغي الـ subscription */
  private async onSubscriptionCancelled(stripeSub: Stripe.Subscription) {
    await this.prisma.subscription.updateMany({
      where: { gatewayRef: stripeSub.id },
      data: { status: 'CANCELLED' },
    });
  }

  // ── Feature Gating ────────────────────────────────────────────

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

  // ── Plan Info + Invoices ──────────────────────────────────────

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

  async getTenantInvoices(tenantId: string) {
    return this.prisma.invoice.findMany({
      where: { subscription: { tenantId } },
      orderBy: { issuedAt: 'desc' },
      include: { subscription: { include: { plan: true } } },
    });
  }
}