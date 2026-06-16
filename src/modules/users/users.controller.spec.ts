import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Role } from '@prisma/client';

const mockUsersService = {
  findById: jest.fn(),
  updateProfile: jest.fn(),
  updatePassword: jest.fn(),
  findAll: jest.fn(),
  delete: jest.fn(),
  updateRole: jest.fn(),
};

const mockUser = {
  id: 'user-123',
  name: 'Omar Ali',
  email: 'omar@edusaas.com',
  role: Role.STUDENT,
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(SessionAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UsersController>(UsersController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMe', () => {
    it('يرجع بيانات المستخدم الحالي', async () => {
      mockUsersService.findById.mockResolvedValue(mockUser);
      const result = await controller.getMe('user-123');
      expect(result).toEqual(mockUser);
    });
  });

  describe('updateMe', () => {
    it('يعدل الـ profile', async () => {
      mockUsersService.updateProfile.mockResolvedValue({ ...mockUser, name: 'New Name' });
      const result = await controller.updateMe('user-123', { name: 'New Name' });
      expect(result.name).toBe('New Name');
    });
  });

  describe('updatePassword', () => {
    it('يغير الباسورد', async () => {
      mockUsersService.updatePassword.mockResolvedValue({ message: 'Password updated successfully' });
      const result = await controller.updatePassword('user-123', {
        oldPassword: 'old_pass',
        newPassword: 'new_pass_123',
      });
      expect(result.message).toBe('Password updated successfully');
    });
  });

  describe('findAll', () => {
    it('يرجع قائمة المستخدمين', async () => {
      mockUsersService.findAll.mockResolvedValue({ users: [mockUser], meta: { total: 1 } });
      const result = await controller.findAll('1', '10');
      expect(result.users).toHaveLength(1);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(undefined, 10, 10);
    });
  });

  describe('delete', () => {
    it('يحذف مستخدم', async () => {
      mockUsersService.delete.mockResolvedValue({ message: 'User deleted successfully' });
      const result = await controller.delete('user-123', 'admin-999');
      expect(result.message).toBe('User deleted successfully');
      expect(mockUsersService.delete).toHaveBeenCalledWith(undefined, 'user-123', undefined);
    });
  });

  describe('updateRole', () => {
    it('يغير الـ role', async () => {
      mockUsersService.updateRole.mockResolvedValue({ ...mockUser, role: Role.ADMIN });
      const result = await controller.updateRole('user-123', 'admin-999', { role: Role.ADMIN });
      expect(result.role).toBe(Role.ADMIN);
      expect(mockUsersService.updateRole).toHaveBeenCalledWith('user-123', Role.ADMIN, undefined);
    });
  });
});