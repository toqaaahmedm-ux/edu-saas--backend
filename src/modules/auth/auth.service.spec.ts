import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';

// HIGH-13 FIX: bcryptjs بيستخدم ES Module، فـ jest.spyOn مش قادر يعيد تعريف
// الـ property وبيرمي "Cannot redefine property: compare". الحل هو mock
// للـ module كاملاً على مستوى الـ file قبل أي import تاني.
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

import * as bcrypt from 'bcryptjs';

// ── Mocks ────────────────────────────────────────────────────────────────────

const HASHED = '$2b$10$hashedpassword';
const TENANT_ID = 'tenant-123';
const ACCESS_TOKEN = 'signed.jwt.token';

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
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue(ACCESS_TOKEN),
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    // إعادة تعيين الـ default values بعد clearAllMocks
    (bcrypt.hash as jest.Mock).mockResolvedValue(HASHED);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    mockJwtService.sign.mockReturnValue(ACCESS_TOKEN);
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
    it('يرجع accessToken وبيانات المستخدم عند تسجيل دخول صحيح', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.login(makeDto(), TENANT_ID);

      expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);
      expect(result.data).toEqual({
        id: mockUser.id,
        tenantId: TENANT_ID,
        name: mockUser.name,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          tenantId: TENANT_ID,
        }),
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
    it('يرجع accessToken للـ superadmin بدون tenantId', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockSuperAdmin);

      const result = await service.loginSuperAdmin({
        email: 'superadmin@platform.com',
        password: 'password123',
      });

      expect(result).toHaveProperty('accessToken', ACCESS_TOKEN);
      expect(result.data.tenantId).toBeNull();
      expect(result.data.role).toBe('SUPER_ADMIN');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
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
      expect(mockJwtService.sign).toHaveBeenCalledWith(
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