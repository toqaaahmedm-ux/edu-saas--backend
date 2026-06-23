import {
  Controller, Post, Get, Body,
  Req, Res, UnauthorizedException, Headers,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import type { Request, Response } from 'express';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 20 * 24 * 60 * 60 * 1000,
};

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    if (!tenantId) throw new UnauthorizedException('Tenant not specified');
    return this.authService.register(dto, tenantId);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Headers('x-tenant-id') tenantId: string,
    @Res() res: Response,
  ) {
    const result = tenantId
      ? await this.authService.login(dto, tenantId)
      : await this.authService.loginSuperAdmin(dto);

    res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
    return res.json({ success: true, accessToken: result.accessToken, data: result.data });
  }

  // SEC-01 FIX: شيلنا @Public() — دلوقتي الـ refresh لازم يعدي من نفس الـ JWT guard
  // العام زي أي route محمي. يعني التوكن القديم لازم يكون صحيح وموقّع بالسر الصح،
  // ومش منتهي الصلاحية، قبل ما نوصل للكود ده أصلاً.
  @Post('refresh')
  async refresh(@Req() req: Request & { user: any }, @Res() res: Response) {
    // req.user جاي من JwtStrategy.validate() بعد ما الـ guard اتأكد إن
    // الـ JWT القديم صحيح فعلاً — مفيش أي string عشوائي يقدر يوصل هنا
    if (!req.user) throw new UnauthorizedException();

    const newToken = this.authService.reissueToken(req.user);
    res.cookie('session-token', newToken, COOKIE_OPTIONS);
    return res.json({ success: true });
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    res.clearCookie('session-token');
    return res.json({ success: true });
  }

  @Get('me')
  async getMe(@Req() req: Request & { user: any }) {
    return req.user;
  }

  @Public()
  @Post('superadmin/login')
  async loginSuperAdmin(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.loginSuperAdmin(dto);
    res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
    return res.json({ success: true, accessToken: result.accessToken, data: result.data });
  }
}