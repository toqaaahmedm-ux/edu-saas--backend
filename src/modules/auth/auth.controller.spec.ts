import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import type { Response, Request } from 'express';

// Note: this file tests AuthController itself (the HTTP layer) —
// not AuthService. AuthService is already covered in auth.service.spec.ts.
// here we're making sure the controller reads the tenant header correctly, sets the
// (access + refresh) cookies correctly, and doesn't return accessToken in the body (BE-H04),
// and that refresh reads the refresh-token from the cookie (BE-C01).

const ACCESS_TOKEN = 'signed.jwt.token';
const REFRESH_TOKEN = 'signed.refresh.token';
const TENANT_ID = 'tenant-123';

const mockUserData = {
  id: 'user-123',
  tenantId: TENANT_ID,
  name: 'Omar Ali',
  email: 'omar@edusaas-academy.com',
  role: 'STUDENT',
};

const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
  loginSuperAdmin: jest.fn(),
  refreshAccessToken: jest.fn(),
  reissueToken: jest.fn(),
};

// simple mock for express Response — we only need .cookie(), .clearCookie(), and .json()
const makeMockResponse = () => {
  const res: Partial<Response> = {
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response & { cookie: jest.Mock; clearCookie: jest.Mock; json: jest.Mock };
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('يبعت tenantId من الـ header للـ service', async () => {
      mockAuthService.register.mockResolvedValue({ id: 'user-123', email: 'a@b.com' });
      const dto = { name: 'Omar', email: 'omar@edusaas-academy.com', password: 'pass123' };
      await controller.register(dto as any, TENANT_ID);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto, TENANT_ID);
    });

    it('يرمي UnauthorizedException لو الـ tenant header مش موجود', async () => {
      const dto = { name: 'Omar', email: 'omar@edusaas-academy.com', password: 'pass123' };
      await expect(controller.register(dto as any, undefined as any))
        .rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.register).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('يسجل دخول تينانت عادي ويحط كوكي الـ access والـ refresh', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        data: mockUserData,
      });
      const res = makeMockResponse();
      const dto = { email: 'omar@edusaas-academy.com', password: 'pass123' };

      await controller.login(dto as any, TENANT_ID, res);

      expect(mockAuthService.login).toHaveBeenCalledWith(dto, TENANT_ID);
      expect(mockAuthService.loginSuperAdmin).not.toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalledWith(
        'session-token',
        ACCESS_TOKEN,
        expect.objectContaining({ httpOnly: true }),
      );
      // new — the separate refresh-token cookie with a specific path (BE-C01)
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh-token',
        REFRESH_TOKEN,
        expect.objectContaining({ httpOnly: true, path: '/auth/refresh' }),
      );
    });

    // BE-H04 FIX: accessToken used to be sent in the body — exposed to logging
    // proxies. Now the body only has success and data, no accessToken at all.
    it('ما يرجعش accessToken في الـ body', async () => {
      mockAuthService.login.mockResolvedValue({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        data: mockUserData,
      });
      const res = makeMockResponse();
      const dto = { email: 'omar@edusaas-academy.com', password: 'pass123' };

      await controller.login(dto as any, TENANT_ID, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockUserData,
      });
      const jsonArg = (res.json as jest.Mock).mock.calls[0][0];
      expect(jsonArg).not.toHaveProperty('accessToken');
    });

    it('يستخدم loginSuperAdmin لو مفيش tenant header', async () => {
      const superAdminData = { ...mockUserData, role: 'SUPER_ADMIN', tenantId: null };
      mockAuthService.loginSuperAdmin.mockResolvedValue({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        data: superAdminData,
      });
      const res = makeMockResponse();
      const dto = { email: 'superadmin@platform.com', password: 'pass123' };

      await controller.login(dto as any, undefined as any, res);

      expect(mockAuthService.loginSuperAdmin).toHaveBeenCalledWith(dto);
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    // BE-C01 FIX: refresh now reads the refresh-token from the cookie (instead of
    // req.user, which used to come from JwtStrategy after validating the old
    // token) — this allows refreshing the access token even if the old access
    // token is no longer valid.
    it('يقرأ refresh-token من الكوكي ويحط access token جديد', async () => {
      mockAuthService.refreshAccessToken.mockResolvedValue(ACCESS_TOKEN);
      const res = makeMockResponse();
      const req = { cookies: { 'refresh-token': REFRESH_TOKEN } } as unknown as Request;

      await controller.refresh(req, res);

      expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith(REFRESH_TOKEN);
      expect(res.cookie).toHaveBeenCalledWith(
        'session-token',
        ACCESS_TOKEN,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('يرمي UnauthorizedException لو مفيش refresh-token cookie', async () => {
      const res = makeMockResponse();
      const req = { cookies: {} } as unknown as Request;

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.refreshAccessToken).not.toHaveBeenCalled();
    });

    it('يمرر UnauthorizedException من الـ service لو الـ refresh token غير صالح', async () => {
      mockAuthService.refreshAccessToken.mockRejectedValue(new UnauthorizedException('Refresh token invalid or expired'));
      const res = makeMockResponse();
      const req = { cookies: { 'refresh-token': 'bad-token' } } as unknown as Request;

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('يمسح كوكي الـ access والـ refresh ويرجع success', async () => {
      const res = makeMockResponse();
      await controller.logout(res);
      expect(res.clearCookie).toHaveBeenCalledWith('session-token');
      // new — must clear the refresh-token cookie too, with the same path
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh-token',
        expect.objectContaining({ path: '/auth/refresh' }),
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });


  describe('loginSuperAdmin', () => {
    it('يسجل دخول superadmin ويحط الكوكيز بدون accessToken في الـ body', async () => {
      const superAdminData = { ...mockUserData, role: 'SUPER_ADMIN', tenantId: null };
      mockAuthService.loginSuperAdmin.mockResolvedValue({
        accessToken: ACCESS_TOKEN,
        refreshToken: REFRESH_TOKEN,
        data: superAdminData,
      });
      const res = makeMockResponse();
      const dto = { email: 'superadmin@platform.com', password: 'pass123' };

      await controller.loginSuperAdmin(dto as any, res);

      expect(mockAuthService.loginSuperAdmin).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'session-token', ACCESS_TOKEN, expect.objectContaining({ httpOnly: true }),
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'refresh-token', REFRESH_TOKEN, expect.objectContaining({ path: '/auth/refresh' }),
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: superAdminData,
      });
    });
  });
});