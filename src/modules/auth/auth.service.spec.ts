import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

// HIGH-13 FIX: bcryptjs uses an ES Module, so jest.spyOn can't redefine the
// property and throws "Cannot redefine property: compare". The fix is to mock
// the whole module at the file level before any other import.
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

import * as bcrypt from 'bcryptjs';

// ── Mocks ────────────────────────────────────────────────────────────────────

const HASHED = '$2b$10$hashedpassword';
const TENANT_ID = 'tenant-123';
const ACCESS_TOKEN = 'signed.jwt.token';
const REFRESH_TOKEN = 'signed.refresh.token';

const mockUser = {
  id: 'user-123',
  tenantId: TENANT_ID,
  name: 'Omar Ali',
  email: 'omar@edusaas-academy.com',
  hashedPassword: HASHED,
  role: 'STUDENT',
  avatar: null,
  createdAt: new Date(),
};

const mockSuperAdmin = {
  id: 'super-123',
  tenantId: null,
  name: 'Super Admin',
  email: 'superadmin@platform.com',
  hashedPassword: HASHED,
  role: 'SUPER_ADMIN',
  avatar: null,
  createdAt: new Date(),
};

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  // new -- login() now also checks the tenant isn't SUSPENDED before
  // issuing tokens; default to an active tenant so existing tests don't
  // need to know about this unless they're specifically testing it.
  tenant: {
    findUnique: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue(ACCESS_TOKEN),
  verify: jest.fn(),
};

// new — AuthService now uses ConfigService to read JWT_REFRESH_SECRET
// and JWT_REFRESH_EXPIRES_IN instead of having them hardcoded (BE-C01)
const mockConfigService = {
  get: jest.fn((key: string, defaultValue?: any) => {
    const config: Record<string, string> = {
      JWT_REFRESH_SECRET: 'refresh-secret-at-least-32-chars-long',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return config[key] ?? defaultValue;
  }),
};

// new -- AuthService now uses MailService to send the verification email
// on registration (email verification flow); tests don't exercise real
// mail sending so every method is just a jest.fn() stub.
const mockMailService = {
  sendTenantWelcome: jest.fn(),
  sendPasswordReset: jest.fn(),
  sendUserInvite: jest.fn(),
  sendEmailVerification: jest.fn(),
};

const makeDto = (overrides = {}) => ({
  email: 'omar@edusaas-academy.com',
  password: 'password123',
  ...overrides,
});

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    // reset the default values after clearAllMocks
    (bcrypt.hash as jest.Mock).mockResolvedValue(HASHED);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    // default: tenant is active, so login() doesn't reject unless a test
    // explicitly overrides this to simulate a suspended tenant.
    mockPrismaService.tenant.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    // signToken and signRefreshToken both use sign, just with different secrets,
    // so we return two different tokens based on the order they're called in the code:
    // signToken (access) is called first, then signRefreshToken (refresh).
    mockJwtService.sign
      .mockReturnValueOnce(ACCESS_TOKEN)
      .mockReturnValueOnce(REFRESH_TOKEN);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── register ──────────────────────────────────────────────────────────────

  describe('register', () => {
    it('ينشئ مستخدم جديد ويرجع بياناته بدون password', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.register(
        { name: 'Omar Ali', email: 'omar@edusaas-academy.com', password: 'password123' },
        TENANT_ID,
      );

      expect(result).toEqual({
        id: mockUser.id,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            email: 'omar@edusaas-academy.com',
            hashedPassword: HASHED,
          }),
        }),
      );
    });

    it('يرمي ConflictException لو الإيميل موجود في نفس الـ tenant', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      await expect(
        service.register(
          { name: 'Omar', email: 'omar@edusaas-academy.com', password: '123' },
          TENANT_ID,
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });
  });

  // ── login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('يرجع accessToken و refreshToken وبيانات المستخدم عند تسجيل دخول صحيح', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login(makeDto(), TENANT_ID);

      expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);
      // new
      expect(result.data).toEqual({
        id: mockUser.id,
        tenantId: TENANT_ID,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          tenantId: TENANT_ID,
        }),
      );
    });

    // new — signRefreshToken must use JWT_REFRESH_SECRET from ConfigService
    // not the main access token secret (BE-C01)
    it('يوقّع الـ refresh token بـ JWT_REFRESH_SECRET المختلف', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      await service.login(makeDto(), TENANT_ID);

      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: mockUser.id },
        expect.objectContaining({ secret: 'refresh-secret-at-least-32-chars-long' }),
      );
    });

    it('يرمي UnauthorizedException لو المستخدم مش موجود', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.login(makeDto(), TENANT_ID))
        .rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });

    it('يرمي UnauthorizedException لو الباسورد غلط', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login(makeDto({ password: 'wrongpass' }), TENANT_ID))
        .rejects.toThrow(UnauthorizedException);
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  // ── loginSuperAdmin ───────────────────────────────────────────────────────

  describe('loginSuperAdmin', () => {
    it('يرجع accessToken و refreshToken للـ superadmin بدون tenantId', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockSuperAdmin);

      const result = await service.loginSuperAdmin({
        email: 'superadmin@platform.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);
      // new
      expect(result.data.tenantId).toBeNull();
      expect(result.data.role).toBe('SUPER_ADMIN');
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ tenantId: null, role: 'SUPER_ADMIN' }),
      );
    });

    it('يرمي UnauthorizedException لو الحساب مش superadmin', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      await expect(
        service.loginSuperAdmin({ email: 'student@test.com', password: '123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── refreshAccessToken (brand new — BE-C01) ───────────────────────────

  describe('refreshAccessToken', () => {
    it('يرجع access token جديد لو الـ refresh token صحيح', async () => {
      mockJwtService.verify.mockReturnValue({ sub: mockUser.id });
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      // this method only calls signToken (no new refresh token),
      // so we set the return value explicitly instead of relying on the order
      // of mockReturnValueOnce inherited from beforeEach.
      mockJwtService.sign.mockReset().mockReturnValue(ACCESS_TOKEN);

      const newToken = await service.refreshAccessToken('some.refresh.token');

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        'some.refresh.token',
        expect.objectContaining({ secret: 'refresh-secret-at-least-32-chars-long' }),
      );
      expect(newToken).toBe(ACCESS_TOKEN);
    });

    it('يرمي UnauthorizedException لو الـ refresh token غير صالح', async () => {
      mockJwtService.verify.mockImplementation(() => { throw new Error('invalid signature'); });
      await expect(service.refreshAccessToken('bad.token'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('يرمي UnauthorizedException لو المستخدم بقى محذوف من الداتابيز', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'deleted-user-id' });
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.refreshAccessToken('valid.but.user.gone'))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // ── reissueToken ──────────────────────────────────────────────────────────

  describe('reissueToken', () => {
    it('يوقّع توكن جديد من بيانات المستخدم الحالي', () => {
      const token = service.reissueToken({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        tenantId: mockUser.tenantId,
        name: mockUser.name,
      });

      expect(token).toBe(ACCESS_TOKEN);
      expect(mockJwtService.sign).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          sub: mockUser.id,
          tenantId: TENANT_ID,
        }),
      );
    });
  });

  // ── getMe ─────────────────────────────────────────────────────────────────

  describe('getMe', () => {
    it('يرجع بيانات المستخدم من الداتابيز', async () => {
      const safeUser = {
        id: mockUser.id,
        tenantId: mockUser.tenantId,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
        avatar: null,
        createdAt: mockUser.createdAt,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(safeUser);

      const result = await service.getMe(mockUser.id);

      expect(result).toEqual(safeUser);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockUser.id } }),
      );
    });

    it('يرمي UnauthorizedException لو المستخدم مش موجود', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getMe('nonexistent-id'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
});