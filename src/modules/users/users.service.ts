// src/modules/users/users.service.ts
import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  async findAll(page: number, limit: number) {
    const { users, total } = await this.usersRepository.findAll(page, limit);
    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(id: string, data: { name?: string }) {
    await this.findById(id); // يتحقق إن المستخدم موجود
    return this.usersRepository.updateProfile(id, data);
  }

  async updatePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ) {
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

  async updateRole(id: string, role: Role) {
    await this.findById(id);
    return this.usersRepository.updateRole(id, role);
  }

  async delete(id: string) {
    await this.findById(id);
    await this.usersRepository.delete(id);
    return { message: 'User deleted successfully' };
  }
}