import {
  Controller, Post, Get, Body,
  Req, Res, UnauthorizedException, Headers,
} from '@nestjs/common';
import { ApiHeader, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
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
  path: '/auth/refresh',
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  @AuditAction('USER_REGISTERED')
  @ApiHeader({ name: 'x-tenant-id', required: true, description: 'Tenant UUID' })
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new UnauthorizedException('Tenant not specified');
    return this.authService.register(dto, tenantId);
  }

  @Public()
  @Post('login')
  @AuditAction('USER_LOGIN')
  @ApiHeader({
    name: 'x-tenant-id',
    required: false,
    description: 'Tenant UUID — اتركيه فاضي لتسجيل دخول SuperAdmin',
  })
  @ApiOperation({ summary: 'Login — اتركي x-tenant-id فاضي للـ SuperAdmin' })
  async login(
    @Body() dto: LoginDto,
    @Headers('x-tenant-id') tenantId: string,
    @Res() res: Response,
  ) {
    const result = tenantId
      ? await this.authService.login(dto, tenantId)
      : await this.authService.loginSuperAdmin(dto);

    res.cookie('session-token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refresh-token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    // BE-H04 FIX: ما بنرجعش accessToken ولا refreshToken في الـ body —
    // مكشوفين لـ logging proxies. الاتنين موجودين في httpOnly cookies بس.
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
    res.clearCookie('refresh-token', { path: '/auth/refresh' });
    return res.json({ success: true });
  }

  // BE-L04: GET /auth/me متشالة من هنا — المسار الأغنى (بيرجع من DB)
  // موجود في UsersController على GET /me

  @Public()
  @Post('superadmin/login')
  @AuditAction('SUPERADMIN_LOGIN')
  @ApiOperation({ summary: 'SuperAdmin login — بدون x-tenant-id' })
  async loginSuperAdmin(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.loginSuperAdmin(dto);

    res.cookie('session-token', result.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie('refresh-token', result.refreshToken, REFRESH_COOKIE_OPTIONS);

    // BE-H04 FIX: نفس الإصلاح هنا
    return res.json({
      success: true,
      data: result.data,
    });
  }
}