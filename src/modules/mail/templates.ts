// Plain string templates â€” no template engine dependency needed for
// just two emails right now.

export function welcomeEmailTemplate(params: { tenantName: string; ownerName: string; loginUrl: string }) {
  const { tenantName, ownerName, loginUrl } = params;
  return {
    subject: `Welcome to EduSaaS â€” ${tenantName} is ready`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome, ${ownerName} ðŸ‘‹</h2>
        <p>Your workspace <strong>${tenantName}</strong> has been created successfully.</p>
        <p>You can log in right away using the email and password you were given.</p>
        <p><a href="${loginUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Go to your dashboard</a></p>
      </div>
    `,
  };
}

export function passwordResetEmailTemplate(params: { name: string; resetUrl: string }) {
  const { name, resetUrl } = params;
  return {
    subject: 'Reset your password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>We received a request to reset your password. This link expires in 1 hour.</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Reset Password</a></p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };
}

export function emailVerificationTemplate(params: { name: string; verifyUrl: string }) {
  const { name, verifyUrl } = params;
  return {
    subject: 'Verify your email address',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Hi ${name},</h2>
        <p>Please confirm your email address to finish setting up your account.</p>
        <p><a href="${verifyUrl}" style="display:inline-block;background:#7c3aed;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Verify Email</a></p>
        <p>If you didn't create this account, you can safely ignore this email.</p>
      </div>
    `,
  };
}
