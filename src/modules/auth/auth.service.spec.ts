import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  session: {
    create: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

const mockUser = {
  id: 'user-123',
  name: 'Omar Ali',
  email: 'omar@edusaas.com',
  hashedPassword: 'hashed_password',
  role: 'STUDENT',
  tenantId: 'tenant-123',
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const registerDto = { name: 'Omar Ali', email: 'omar@edusaas.com', password: 'password123' };
const loginDto    = { email: 'omar@edusaas.com', password: 'password123' };

// ✅ ثابت للـ tenantId
const TENANT_ID = 'tenant-123';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();

    mockPrismaService.session.create.mockResolvedValue({});
    mockPrismaService.session.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('ينشئ مستخدم جديد بنجاح', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      // بنمرر (dto, tenantId)
      const result = await service.register(registerDto, TENANT_ID);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { tenantId_email: { email: registerDto.email, tenantId: TENANT_ID } } });
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 10);
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('email', mockUser.email);
    });

    it('يرمي ConflictException لو الإيميل موجود', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      // بنمرر (dto, tenantId)
      await expect(service.register(registerDto, TENANT_ID)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('يشفر كلمة المرور قبل الحفظ', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      // بنمرر (dto, tenantId)
      await service.register(registerDto, TENANT_ID);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
    });
  });

  describe('login', () => {
    it('يرجع accessToken عند تسجيل دخول صح', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      // بنمرر (dto, tenantId)
      const result = await service.login(loginDto, TENANT_ID);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('email', mockUser.email);
      expect(mockPrismaService.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: mockUser.id, expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('يرمي UnauthorizedException لو الإيميل مش موجود', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      //  بنمرر (dto, tenantId)
      await expect(service.login(loginDto, TENANT_ID)).rejects.toThrow(UnauthorizedException);
    });

    it('يرمي UnauthorizedException لو كلمة المرور غلط', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      // بنمرر (dto, tenantId)
      await expect(service.login(loginDto, TENANT_ID)).rejects.toThrow(UnauthorizedException);
    });

    it('مش بيرجع hashedPassword في الـ response', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      // بنمرر (dto, tenantId)
      const result = await service.login(loginDto, TENANT_ID);
      expect(result.data).not.toHaveProperty('hashedPassword');
    });
  });
});