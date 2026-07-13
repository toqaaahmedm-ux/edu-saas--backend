import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BillingService } from '../billing/billing.service';
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_owner_password'),
}));

// Prisma transaction بيبعت (tx) بنفس شكل الـ prisma client — بنموكه بنفس الشكل
const mockTx = {
  tenant: {
    create: jest.fn(),
    update: jest.fn(),
  },
  user: {
    create: jest.fn(),
  },
};

const mockPrismaService = {
  tenant: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },

  user: {
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  plan: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  course: { count: jest.fn() },
  enrollment: { count: jest.fn() },
  $transaction: jest.fn((callback) => callback(mockTx)),
};

const mockNewTenant = {
  id: 'tenant-new-1',
  name: 'Cairo Tutoring Center',
  subdomain: 'cairo-tutoring',
  status: TenantStatus.TRIAL,
  ownerUserId: null,
};

const mockOwnerUser = {
  id: 'user-owner-1',
  tenantId: 'tenant-new-1',
  name: 'Ahmed Owner',
  email: 'owner@cairo-tutoring.com',
  role: Role.ADMIN,
};

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BillingService, useValue: mockBillingService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  const mockBillingService = {
    assignPlanToTenant: jest.fn(),
  };
  
  // ── createTenant (SA-C01 fix) ────────────────────────────────────────────
  describe('createTenant', () => {
    const dto = {
      name: 'Cairo Tutoring Center',
      subdomain: 'cairo-tutoring',
      ownerName: 'Ahmed Owner',
      ownerEmail: 'owner@cairo-tutoring.com',
      ownerPassword: 'SecurePass123',
    };

    it('ينشئ tenant + owner في transaction واحدة وبيربطهم صح', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null); // subdomain مش مكرر
      mockPrismaService.user.findFirst.mockResolvedValue(null); // owner email مش مكرر

      mockTx.tenant.create.mockResolvedValue(mockNewTenant);
      mockTx.user.create.mockResolvedValue(mockOwnerUser);
      mockTx.tenant.update.mockResolvedValue({
        ...mockNewTenant,
        ownerUserId: mockOwnerUser.id,
        owner: mockOwnerUser,
        plan: null,
      });

      const result = await service.createTenant(dto);

      // اتشفرت الباسورد قبل ما تتخزن
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.ownerPassword, 10);

      // الـ tenant اتعمل بحالة TRIAL ومعاه trialEndsAt
      expect(mockTx.tenant.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: dto.name,
            subdomain: dto.subdomain,
            status: TenantStatus.TRIAL,
            trialEndsAt: expect.any(Date),
          }),
        }),
      );

      // الـ owner اتعمل بدور ADMIN ومربوط بالـ tenant الصح
      expect(mockTx.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockNewTenant.id,
            email: dto.ownerEmail,
            hashedPassword: 'hashed_owner_password',
            role: Role.ADMIN,
          }),
        }),
      );

      // الـ tenant اتحدّث بـ ownerUserId بعد إنشاء الـ owner
      expect(mockTx.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockNewTenant.id },
          data: { ownerUserId: mockOwnerUser.id },
        }),
      );

      expect(result.ownerUserId).toBe(mockOwnerUser.id);
    });

    it('يرمي BadRequestException لو الـ subdomain مكرر', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockNewTenant);

      await expect(service.createTenant(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });

    it('يرمي BadRequestException لو الـ owner email مستخدم بالفعل', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      mockPrismaService.user.findFirst.mockResolvedValue(mockOwnerUser);

      await expect(service.createTenant(dto)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── findTenantById ────────────────────────────────────────────────────────
  describe('findTenantById', () => {
    it('يرجع tenant لو موجود', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockNewTenant);
      const result = await service.findTenantById('tenant-new-1');
      expect(result).toEqual(mockNewTenant);
    });

    it('يرمي NotFoundException لو مش موجود', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      await expect(service.findTenantById('not-found')).rejects.toThrow(NotFoundException);
    });
  });
});