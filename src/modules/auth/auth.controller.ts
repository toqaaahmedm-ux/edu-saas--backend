import {
  Controller, Post, Get, Body, Param,
  Req, Res, UnauthorizedException, Headers, UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { TenantId } from '../../common/decorators/tenant-id.decorator';
import { Role } from '@prisma/client';
import { ApiHeader, ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { Public } from '../../common/decorators/public.decorator';
import { AuditAction } from '../../common/interceptors/audit.interceptor';
import type { Request, Response } from 'express';

const ACCESS_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 15 * 60 * 1000,
};

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  // FIX (AUTH-09): the global prefix ('api') means the real refresh
  // endpoint is /api/auth/refresh, but this cookie was scoped to
  // /auth/refresh -- a path the browser never actually hits, so it
  // never sent the cookie back and refresh always failed with
  // 'No refresh token'. Scoping it to the real endpoint fixes that.
  path: '/api/auth/refresh',
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Public()
  @Post('register')
  @AuditAction('USER_REGISTERED')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: 'Tenant UUID' })
  async register(
    @Body() dto: RegisterDto,
    @TenantId() tenantId: string | null,
  ) {
    if (!tenantId) throw new UnauthorizedException('Tenant not specified');
    return this.authService.register(dto, tenantId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // SEC-02: stricter than the global 100/min, to make login brute-force impractical
  @Post('login')
  @AuditAction('USER_LOGIN')
  @ApiHeader({
    name: 'x-tenant-id',
    required: false,
    description: 'Tenant UUID — required for tenant users (Admin/Teacher/Student). Leave empty only for SuperAdmin login.',
  })
  @ApiOperation({ summary: 'Login — provide x-tenant-id for tenant users; leave empty for SuperAdmin' })
  async login(
    @Body() dto: LoginDto,
    @TenantId() tenantId: string | null,
    @Res() res: Response,
  ) {
    const result = tenantId
      ? await this.authService.login(dto, tenantId)
      : await this.authService.loginSuperAdmin(dto);

    res.cookie('session-token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refresh-token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    // BE-H04 FIX: we don't return accessToken or refreshToken in the body —
    // they're exposed to logging proxies. Both only live in httpOnly cookies.
    return res.json({
      success: true,
      data: result.data,
    });
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies?.['refresh-token'];
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const newAccessToken = await this.authService.refreshAccessToken(refreshToken);

    res.cookie('session-token', newAccessToken, ACCESS_COOKIE_OPTIONS);
    return res.json({ success: true });
  }

  @Post('logout')
  @AuditAction('USER_LOGOUT')
  async logout(@Res() res: Response) {
    res.clearCookie('session-token');
    res.clearCookie('refresh-token', { path: '/api/auth/refresh' });
    return res.json({ success: true });
  }
// Returns the token directly instead of setting a cookie — the caller
  // (SuperAdmin, on localhost:3000) and the target (tenant subdomain)
  // are different origins, so a cookie set here would land on the wrong
  // domain. The frontend carries this token to the tenant's own
  // subdomain and converts it to a cookie there instead.
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  @Post('impersonate/:userId')
  @AuditAction('TENANT_IMPERSONATED')
  async impersonate(
    @Param('userId') userId: string,
    @GetUser('id') superAdminId: string,
  ) {
    const result = await this.authService.impersonateTenantAdmin(userId, superAdminId);
    return { success: true, accessToken: result.accessToken, data: result.data };
  }

  // BE-L04: GET /auth/me removed from here — the richer route (returns from DB)
  // lives in UsersController at GET /me
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // SEC-02: stricter than the global 100/min, to make login brute-force impractical
  @Post('superadmin/login')
  @AuditAction('SUPERADMIN_LOGIN')
  @ApiOperation({ summary: 'SuperAdmin login — بدون x-tenant-id' })
  async loginSuperAdmin(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.loginSuperAdmin(dto);

    res.cookie('session-token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refresh-token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    return res.json({
      success: true,
      data: result.data,
    });
  }

  // Email infrastructure fix: password reset flow didn't exist at all.
  @Public()
  @Post('forgot-password')
  @AuditAction('PASSWORD_RESET_REQUESTED')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  @AuditAction('PASSWORD_RESET_COMPLETED')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // Email infrastructure fix: email verification is informational only -
  // it does not block login (see the "optional verification" decision).
  @Public()
  @Post('verify-email')
  @AuditAction('EMAIL_VERIFIED')
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Public()
  @Post('resend-verification')
  @AuditAction('EMAIL_VERIFICATION_RESENT')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationEmail(dto.email);
  }
}