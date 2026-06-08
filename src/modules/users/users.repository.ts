import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

const safeUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(page: number, limit: number): Promise<{ users: SafeUser[]; total: number }> {
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        skip,
        take: limit,
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count(),
    ]);
    return { users, total };
  }

  async findById(id: string): Promise<SafeUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: safeUserSelect,
    });
  }

  async findByIdWithPassword(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async updateProfile(id: string, data: { name?: string }): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: safeUserSelect,
    });
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { hashedPassword },
    });
  }

  async updateRole(id: string, role: Role): Promise<SafeUser> {
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: safeUserSelect,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({ where: { id } });
  }

  // ── SEC-03: عدد الـ Admins ──
  async countByRole(role: Role): Promise<number> {
    return this.prisma.user.count({ where: { role } });
  }
}