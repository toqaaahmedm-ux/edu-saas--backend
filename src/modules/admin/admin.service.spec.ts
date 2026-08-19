import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { BillingService } from '../billing/billing.service';
import { MailService } from '../mail/mail.service';
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_owner_password'),
}));

// Prisma transaction passes (tx) in the same shape as the prisma client — we mock it the same way
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
        { provide: MailService, useValue: mockMailService },
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

  // new -- AdminService now uses MailService to send the tenant-welcome
  // email right after createTenant(); tests don't exercise real mail
  // sending so every method is just a jest.fn() stub.
  const mockMailService = {
    sendTenantWelcome: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    sendUserInvite: jest.fn().mockResolvedValue(undefined),
    sendEmailVerification: jest.fn().mockResolvedValue(undefined),
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
      // subdomain isn't a duplicate
      // owner email isn't a duplicate

      mockTx.tenant.create.mockResolvedValue(mockNewTenant);
      mockTx.user.create.mockResolvedValue(mockOwnerUser);
      mockTx.tenant.update.mockResolvedValue({
        ...mockNewTenant,
        ownerUserId: mockOwnerUser.id,
        owner: mockOwnerUser,
        plan: null,
      });

      const result = await service.createTenant(dto);

      // password was hashed before being stored
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.ownerPassword, 10);

      // the tenant was created with TRIAL status and a trialEndsAt
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

      // the owner was created with the ADMIN role and linked to the right tenant
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

      // the tenant was updated with ownerUserId after the owner was created
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