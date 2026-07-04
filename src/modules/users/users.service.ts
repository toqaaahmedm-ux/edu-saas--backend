import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(tenantId: string, page: number, limit: number) {
    const { users, total } = await this.usersRepository.findAll(tenantId, page, limit);
    return {
      users,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, data: { name?: string }) {
    await this.findById(id);
    return this.usersRepository.updateProfile(id, data);
  }

  async updatePassword(id: string, oldPassword: string, newPassword: string) {
    const user = await this.usersRepository.findByIdWithPassword(id);
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await bcrypt.compare(oldPassword, user.hashedPassword);
    if (!isMatch) throw new ForbiddenException('Old password is incorrect');

    if (newPassword.length < 8)
      throw new BadRequestException('Password must be at least 8 characters');

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.usersRepository.updatePassword(id, hashed);
    return { message: 'Password updated successfully' };
  }

  // Security fix (أ): this endpoint is tenant-scoped and admin-triggered, so it
  // should never be able to touch SUPER_ADMIN in either direction — not assign it,
  // and not modify an existing one. Also locking it to same-tenant users only,
  // since an ADMIN has no business reaching into another tenant's user table.
  async updateRole(id: string, tenantId: string, role: Role, requestUserId: string) {
    if (id === requestUserId) {
      throw new ForbiddenException('You cannot change your own role');
    }

    if (role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN cannot be assigned from this endpoint');
    }

    const targetUser = await this.findById(id);

    if (targetUser.tenantId !== tenantId) {
      throw new ForbiddenException('You cannot modify a user outside your tenant');
    }

    if (targetUser.role === Role.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot change a SUPER_ADMIN role');
    }

    return this.usersRepository.updateRole(id, role);
  }

  async delete(tenantId: string, id: string, requestUserId: string) {
    if (id === requestUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    const user = await this.findById(id);

    if (user.role === Role.ADMIN) {
      const adminCount = await this.usersRepository.countByRole(tenantId, Role.ADMIN);
      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last admin');
      }
    }

    await this.usersRepository.delete(id);
    return { message: 'User deleted successfully' };
  }
}