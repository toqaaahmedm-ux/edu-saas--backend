import { Controller, Post, Get, Body, Req, Res, UnauthorizedException, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import type { Request, Response } from 'express';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  domain: 'localhost',
  maxAge: 7 * 24 * 60 * 60 * 1000,
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
    if (!tenantId) {
      const result = await this.authService.loginSuperAdmin(dto);
      res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
      return res.json({ success: true, accessToken: result.accessToken, data: result.data });
    }

    const result = await this.authService.login(dto, tenantId);
    res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
    return res.json({ success: true, accessToken: result.accessToken, data: result.data });
  }

  @Public()
  @Post('refresh')
  async refresh(@Req() req: Request, @Res() res: Response) {
    const oldToken = req.cookies['session-token'];
    if (!oldToken) throw new UnauthorizedException();

    const result = await this.authService.refresh(oldToken);
    res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
    return res.json({ success: true, accessToken: result.accessToken, data: result.data });
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    const token = req.cookies['session-token'];
    if (token) await this.authService.logout(token);
    res.clearCookie('session-token', { domain: 'localhost' });
    return res.json({ success: true });
  }

  @Get('me')
  async getMe(@Req() req: Request) {
    const token = req.cookies['session-token'];
    if (!token) throw new UnauthorizedException();
    return this.authService.getMe(token);
  }

  @Public()
  @Post('superadmin/login')
  async loginSuperAdmin(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.loginSuperAdmin(dto);
    res.cookie('session-token', result.accessToken, COOKIE_OPTIONS);
    return res.json({ success: true, accessToken: result.accessToken, data: result.data });
  }
}