import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { welcomeEmailTemplate, passwordResetEmailTemplate, emailVerificationTemplate } from './templates';

interface MailJob {
  to: string;
  subject: string;
  html: string;
  attempt: number;
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [5000, 10000, 20000]; // 5s, 10s, 20s

// Simple in-process queue with retry â€” no Redis/BullMQ dependency needed
// at this stage. Jobs are fire-and-forget from the caller's perspective;
// this class owns retry scheduling internally. If the process restarts,
// in-flight jobs are lost â€” acceptable for transactional emails right now.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend;

  constructor(private config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  private async enqueue(job: MailJob) {
    const from = this.config.get<string>('MAIL_FROM') || 'EduSaaS <onboarding@resend.dev>';
    const { error } = await this.resend.emails.send({
      from,
      to: job.to,
      subject: job.subject,
      html: job.html,
    });

    if (error) {
      this.logger.warn(`Email attempt ${job.attempt} failed for ${job.to}: ${error.message}`);
      if (job.attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_MS[job.attempt - 1] ?? 20000;
        setTimeout(() => this.enqueue({ ...job, attempt: job.attempt + 1 }), delay);
      } else {
        this.logger.error(`Email permanently failed after ${MAX_ATTEMPTS} attempts: ${job.to}`);
      }
      return;
    }

    this.logger.log(`Email sent to ${job.to}: "${job.subject}"`);
  }

  async sendTenantWelcome(to: string, params: { tenantName: string; ownerName: string; loginUrl: string }) {
    const { subject, html } = welcomeEmailTemplate(params);
    this.enqueue({ to, subject, html, attempt: 1 }); // not awaited â€” fire and forget
  }

  async sendPasswordReset(to: string, params: { name: string; resetUrl: string }) {
    const { subject, html } = passwordResetEmailTemplate(params);
    this.enqueue({ to, subject, html, attempt: 1 });
  }

  // NEW (REQ-02): sent when an admin creates a teacher/student account
  // directly and requests an invite email. Kept as inline HTML here
  // rather than a shared template file, to match this method's narrower
  // one-off purpose (temporary password + login link only).
  async sendUserInvite(
    to: string,
    params: { name: string; loginUrl: string; temporaryPassword: string },
  ) {
    const subject = 'You have been invited to EduSaaS';
    const html = `
      <div style="font-family: sans-serif; line-height: 1.6;">
        <h2>Hi ${params.name},</h2>
        <p>An admin has created an account for you on EduSaaS.</p>
        <p><strong>Temporary password:</strong> ${params.temporaryPassword}</p>
        <p>Please log in and change your password as soon as possible.</p>
        <p><a href="${params.loginUrl}">Log in here</a></p>
      </div>
    `;
    this.enqueue({ to, subject, html, attempt: 1 });
  }

  async sendEmailVerification(to: string, params: { name: string; verifyUrl: string }) {
    const { subject, html } = emailVerificationTemplate(params);
    this.enqueue({ to, subject, html, attempt: 1 });
  }
}