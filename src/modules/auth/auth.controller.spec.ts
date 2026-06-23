import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';

// ملحوظة: الملف ده بيتست AuthController نفسه (الـ HTTP layer) —
// مش AuthService. الـ AuthService متغطية بالفعل في auth.service.spec.ts.
// هنا بنتأكد إن الـ controller بيقرا الـ tenant header صح، بيحط الكوكي
// صح، وبيتعامل مع superadmin / refresh / logout / getMe زي ما المفروض.

const ACCESS_TOKEN = 'signed.jwt.token';
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
  reissueToken: jest.fn(),
};

// mock بسيط لـ express Response — بنحتاج بس .cookie() و .clearCookie() و .json()
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
    it('يسجل دخول تينانت عادي ويحط الكوكي', async () => {
      mockAuthService.login.mockResolvedValue({ accessToken: ACCESS_TOKEN, data: mockUserData });
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
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: ACCESS_TOKEN,
        data: mockUserData,
      });
    });

    it('يستخدم loginSuperAdmin لو مفيش tenant header', async () => {
      const superAdminData = { ...mockUserData, role: 'SUPER_ADMIN', tenantId: null };
      mockAuthService.loginSuperAdmin.mockResolvedValue({ accessToken: ACCESS_TOKEN, data: superAdminData });
      const res = makeMockResponse();
      const dto = { email: 'superadmin@platform.com', password: 'pass123' };

      await controller.login(dto as any, undefined as any, res);

      expect(mockAuthService.loginSuperAdmin).toHaveBeenCalledWith(dto);
      expect(mockAuthService.login).not.toHaveBeenCalled();
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('يوقّع توكن جديد من req.user ويحط الكوكي', async () => {
      mockAuthService.reissueToken.mockReturnValue(ACCESS_TOKEN);
      const res = makeMockResponse();
      const req = { user: mockUserData } as any;

      await controller.refresh(req, res);

      expect(mockAuthService.reissueToken).toHaveBeenCalledWith(mockUserData);
      expect(res.cookie).toHaveBeenCalledWith(
        'session-token',
        ACCESS_TOKEN,
        expect.objectContaining({ httpOnly: true }),
      );
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('يرمي UnauthorizedException لو req.user مش موجود', async () => {
      const res = makeMockResponse();
      const req = { user: null } as any;

      await expect(controller.refresh(req, res)).rejects.toThrow(UnauthorizedException);
      expect(mockAuthService.reissueToken).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('يمسح الكوكي ويرجع success', async () => {
      const res = makeMockResponse();
      await controller.logout(res);
      expect(res.clearCookie).toHaveBeenCalledWith('session-token');
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  describe('getMe', () => {
    it('يرجع req.user مباشرة', async () => {
      const req = { user: mockUserData } as any;
      const result = await controller.getMe(req);
      expect(result).toEqual(mockUserData);
    });
  });

  describe('loginSuperAdmin', () => {
    it('يسجل دخول superadmin ويحط الكوكي', async () => {
      const superAdminData = { ...mockUserData, role: 'SUPER_ADMIN', tenantId: null };
      mockAuthService.loginSuperAdmin.mockResolvedValue({ accessToken: ACCESS_TOKEN, data: superAdminData });
      const res = makeMockResponse();
      const dto = { email: 'superadmin@platform.com', password: 'pass123' };

      await controller.loginSuperAdmin(dto as any, res);

      expect(mockAuthService.loginSuperAdmin).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: ACCESS_TOKEN,
        data: superAdminData,
      });
    });
  });
});