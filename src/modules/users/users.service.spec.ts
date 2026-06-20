import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const mockUsersRepository = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByIdWithPassword: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  updateRole: jest.fn(),
  delete: jest.fn(),
  countByRole: jest.fn(),
};

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('new_hashed_password'),
}));

const mockUser = {
  id: 'user-123',
  name: 'Omar Ali',
  email: 'omar@edusaas.com',
  role: Role.STUDENT,
  hashedPassword: 'hashed_password',
  avatar: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: mockUsersRepository },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── findAll ───────────────────────────────────────────────────────────────
  describe('findAll', () => {
    it('يرجع users مع meta', async () => {
      mockUsersRepository.findAll.mockResolvedValue({ users: [mockUser], total: 1 });

      const result = await service.findAll('tenant-123', 1, 10);

      expect(result.users).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });
  });

  // ── findById ──────────────────────────────────────────────────────────────
  describe('findById', () => {
    it('يرجع user لو موجود', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUser);
      const result = await service.findById('user-123');
      expect(result).toEqual(mockUser);
    });

    it('يرمي NotFoundException لو مش موجود', async () => {
      mockUsersRepository.findById.mockResolvedValue(null);
      await expect(service.findById('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────
  describe('updateProfile', () => {
    it('يعدل الـ profile بنجاح', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockUsersRepository.updateProfile.mockResolvedValue({ ...mockUser, name: 'New Name' });

      const result = await service.updateProfile('user-123', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  // ── updatePassword ────────────────────────────────────────────────────────
  describe('updatePassword', () => {
    it('يغير الباسورد بنجاح', async () => {
      mockUsersRepository.findByIdWithPassword.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockUsersRepository.updatePassword.mockResolvedValue(undefined);

      const result = await service.updatePassword('user-123', 'old_pass', 'new_pass_123');
      expect(result).toEqual({ message: 'Password updated successfully' });
    });

    it('يرمي NotFoundException لو المستخدم مش موجود', async () => {
      mockUsersRepository.findByIdWithPassword.mockResolvedValue(null);
      await expect(service.updatePassword('x', 'old', 'new_pass_123')).rejects.toThrow(NotFoundException);
    });

    it('يرمي ForbiddenException لو الباسورد القديم غلط', async () => {
      mockUsersRepository.findByIdWithPassword.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.updatePassword('user-123', 'wrong', 'new_pass_123')).rejects.toThrow(ForbiddenException);
    });

    it('يرمي BadRequestException لو الباسورد الجديد أقل من 8 حروف', async () => {
      mockUsersRepository.findByIdWithPassword.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      await expect(service.updatePassword('user-123', 'old', 'short')).rejects.toThrow(BadRequestException);
    });
  });

  // ── updateRole ────────────────────────────────────────────────────────────
  describe('updateRole', () => {
    it('يغير الـ role بنجاح', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockUsersRepository.updateRole.mockResolvedValue({ ...mockUser, role: Role.ADMIN });

      const result = await service.updateRole('user-123', Role.ADMIN, 'admin-999');
      expect(result.role).toBe(Role.ADMIN);
    });

    it('يرمي ForbiddenException لو حاول يغير role نفسه', async () => {
      await expect(service.updateRole('user-123', Role.ADMIN, 'user-123')).rejects.toThrow(ForbiddenException);
    });
  });

  // ── delete ────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('يحذف user بنجاح', async () => {
      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockUsersRepository.delete.mockResolvedValue(undefined);

      const result = await service.delete('tenant-123', 'user-123', 'admin-999');
      expect(result).toEqual({ message: 'User deleted successfully' });
    });

    it('يرمي ForbiddenException لو حاول يحذف نفسه', async () => {
      await expect(service.delete('tenant-123', 'user-123', 'user-123')).rejects.toThrow(ForbiddenException);
    });

    it('يرمي ForbiddenException لو آخر admin', async () => {
      mockUsersRepository.findById.mockResolvedValue({ ...mockUser, role: Role.ADMIN });
      mockUsersRepository.countByRole.mockResolvedValue(1);

      await expect(service.delete('tenant-123', 'user-123', 'admin-999')).rejects.toThrow(ForbiddenException);
    });
  });
});