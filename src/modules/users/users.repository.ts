import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';

export type SafeUser = {
  id: string;
  tenantId: string | null;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
  updatedAt: Date;
};

const safeUserSelect = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Multi-tenant: كل query بتفلتر بـ tenantId
  async findAll(tenantId: string, page: number, limit: number): Promise<{ users: SafeUser[]; total: number }> {
    const skip = (page - 1) * limit;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where: { tenantId },
        skip,
        take: limit,
        select: safeUserSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: { tenantId } }),
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

  // Multi-tenant: email unique per tenant — لازم tenantId + email مع بعض
  async findByEmail(tenantId: string, email: string) {
    return this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
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

  // Multi-tenant: عد الـ users بـ role داخل الـ tenant
  async countByRole(tenantId: string, role: Role): Promise<number> {
    return this.prisma.user.count({ where: { tenantId, role } });
  }
}