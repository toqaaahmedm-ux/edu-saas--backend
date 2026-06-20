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
  httpOnly: true,                                      //  XSS-safe
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 20 * 24 * 60 * 60 * 1000,                  // 20 يوم (زي الـ JWT expiry)
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
  //  رجّع accessToken في الـ body عشان Next.js route يقدر يحطه في cookie
  return res.json({ success: true, accessToken: result.accessToken, data: result.data });
}

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    // مع JWT مفيش refresh من DB — بس نجدد الـ cookie بـ token جديد
    // لو عايز refresh token حقيقي هنضيفه في مرحلة تانية
    const token = req.cookies['session-token'];
    if (!token) throw new UnauthorizedException();
    res.cookie('session-token', token, COOKIE_OPTIONS); // تجديد الـ maxAge
    return res.json({ success: true });
  }

  @Post('logout')
  async logout(@Res() res: Response) {
    //  مع JWT مفيش DB delete — بس امسح الـ cookie
    res.clearCookie('session-token');
    return res.json({ success: true });
  }

  @Get('me')
  async getMe(@Req() req: Request & { user: any }) {
    // req.user بييجي من JwtStrategy.validate() — مفيش DB lookup تاني
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