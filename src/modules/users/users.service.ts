import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    // NEW: direct Prisma access for the teacher-approval flow below —
    // these are simple tenant-scoped queries that don't need a dedicated
    // repository method yet, same pattern already used elsewhere
    // (e.g. CoursesService injects PrismaService alongside its repository).
    private readonly prisma: PrismaService,
  ) {}

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

  // ─── Teacher approval workflow (Admin Report Bug #2) ──────────────────

  // the list behind the admin's "Pending Approvals" queue — teachers who
  // self-registered and are blocked from logging in until reviewed
  async getPendingTeachers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: Role.TEACHER, status: 'PENDING' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async approveTeacher(id: string, tenantId: string, approvedById: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id, tenantId, role: Role.TEACHER },
    });
    if (!teacher) throw new NotFoundException('Pending teacher not found');
    if (teacher.status !== 'PENDING') {
      throw new BadRequestException('This teacher is not awaiting approval');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        approvedAt: new Date(),
        approvedBy: approvedById,
      },
    });

    // in-app notification so the teacher actually finds out they can log
    // in now — matches the PENDING notification created at registration
    await this.prisma.notification.create({
      data: {
        tenantId,
        userId: id,
        title: 'Account approved',
        message: 'Your teacher account has been approved. You can now log in.',
        type: 'TEACHER_APPROVED',
      },
    });

    return { id: updated.id, name: updated.name, status: updated.status };
  }

  async rejectTeacher(id: string, tenantId: string) {
    const teacher = await this.prisma.user.findFirst({
      where: { id, tenantId, role: Role.TEACHER },
    });
    if (!teacher) throw new NotFoundException('Pending teacher not found');
    if (teacher.status !== 'PENDING') {
      throw new BadRequestException('This teacher is not awaiting approval');
    }

    // a rejected registration never had real access to anything, so we
    // remove the account outright rather than leaving a dead SUSPENDED
    // row behind — nothing else in the system references it yet
    await this.prisma.user.delete({ where: { id } });

    return { message: 'Teacher registration rejected' };
  }
}