import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { MailService } from '../mail/mail.service';
import { randomBytes } from 'crypto';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private mailService: MailService,
  ) {}

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  private signRefreshToken(userId: string): string {
    return this.jwtService.sign(
      { sub: userId },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as any,
      },
    );
  }

  private buildPayload(user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
    name: string;
  }): JwtPayload {
    return {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      name: user.name,
    };
  }

  async register(dto: RegisterDto, tenantId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // FIX (Admin Report Bug #1): role now actually gets saved — previously
    // it was accepted by the DTO (after this same fix) but never passed to
    // Prisma, so every registration silently became a STUDENT no matter
    // what was requested.
    //
    // FIX (Admin Report Bug #2): a self-registered TEACHER starts PENDING
    // and cannot log in until an admin approves them (see login() below and
    // users.service.ts for the approval endpoint). STUDENT accounts need
    // no approval and go straight to ACTIVE — the schema default already
    // covers that, so we only need to special-case TEACHER here.
    const role = dto.role ?? 'STUDENT';
    const status = role === 'TEACHER' ? 'PENDING' : 'ACTIVE';

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        hashedPassword,
        role,
        status,
      },
    });

    // let the tenant's admins know a teacher is waiting on them, instead of
    // this sitting invisibly in the database until someone happens to check
    if (role === 'TEACHER') {
      const admins = await this.prisma.user.findMany({
        where: { tenantId, role: 'ADMIN' },
        select: { id: true },
      });
      if (admins.length) {
        await this.prisma.notification.createMany({
          data: admins.map((admin) => ({
            tenantId,
            userId: admin.id,
            title: 'New teacher registration',
            message: `${user.name} registered as a teacher and is waiting for approval.`,
            type: 'TEACHER_PENDING_APPROVAL',
          })),
        });
      }
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    };
  }

  async login(dto: LoginDto, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // FIX (Admin Report Bug #2): this is the actual gate — without it, a
    // PENDING teacher could already log in immediately after registering
    // even though role/status were being saved correctly, because nothing
    // ever checked status at login time.
    if (user.status === 'PENDING') {
      throw new ForbiddenException(
        'Your account is pending admin approval. You will be notified once approved.',
      );
    }
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenException('This account has been suspended. Please contact your admin.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });
    if (tenant?.status === 'SUSPENDED') {
      throw new UnauthorizedException('This account has been suspended. Please contact support.');
    }

    const payload = this.buildPayload(user);
    const accessToken = this.signToken(payload);
    const refreshToken = this.signRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      data: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async loginSuperAdmin(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: null, role: 'SUPER_ADMIN' },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = this.buildPayload(user);
    const accessToken = this.signToken(payload);
    const refreshToken = this.signRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      data: {
        id: user.id,
        tenantId: null,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, role: true, tenantId: true, name: true },
      });
      if (!user) throw new UnauthorizedException();

      return this.signToken(this.buildPayload(user));
    } catch {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
  }

  reissueToken(user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
    name: string;
  }): string {
    return this.signToken(this.buildPayload(user));
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (user) {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await this.prisma.verificationToken.create({
        data: { userId: user.id, token, type: 'PASSWORD_RESET', expiresAt },
      });

      const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      await this.mailService.sendPasswordReset(user.email, {
        name: user.name,
        resetUrl: `${frontendUrl}/reset-password?token=${token}`,
      });
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const record = await this.prisma.verificationToken.findUnique({ where: { token } });

    if (
      !record ||
      record.type !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { hashedPassword },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }
}