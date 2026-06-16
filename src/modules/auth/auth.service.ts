import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  private sessionCache = new Map<string, { userId: string; expiresAt: Date; user: any }>();

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Multi-tenant: محتاجين tenantId مع كل عملية
  async register(dto: RegisterDto, tenantId: string) {
    // email unique per tenant مش globally
    const existing = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email,
        hashedPassword,
      },
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto, tenantId: string) {
    // البحث بـ tenantId + email مع بعض
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    // DB-07: مسح الـ sessions المنتهية
    await this.prisma.session.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } },
    });

    const userData = {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    this.sessionCache.set(rawToken, { userId: user.id, expiresAt, user: userData });

    return { accessToken: rawToken, data: userData };
  }

  async refresh(oldToken: string) {
    const oldTokenHash = this.hashToken(oldToken);

    const session = await this.prisma.session.findUnique({
      where: { token: oldTokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await this.prisma.session.delete({ where: { token: oldTokenHash } });
      this.sessionCache.delete(oldToken);
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.session.delete({ where: { token: oldTokenHash } });
    this.sessionCache.delete(oldToken);

    const newRawToken = crypto.randomBytes(32).toString('hex');
    const newTokenHash = this.hashToken(newRawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: { userId: session.user.id, token: newTokenHash, expiresAt },
    });

    const userData = {
      id: session.user.id,
      tenantId: session.user.tenantId,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    };

    this.sessionCache.set(newRawToken, { userId: session.user.id, expiresAt, user: userData });

    return { accessToken: newRawToken, data: userData };
  }

  async logout(token: string) {
    const tokenHash = this.hashToken(token);
    await this.prisma.session.deleteMany({ where: { token: tokenHash } });
    this.sessionCache.delete(token);
    return { message: 'Logged out successfully' };
  }

  async getMe(token: string) {
    const cached = this.sessionCache.get(token);
    if (cached && cached.expiresAt > new Date()) {
      return cached.user;
    }

    const tokenHash = this.hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }

    const user = {
      id: session.user.id,
      tenantId: session.user.tenantId,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      avatar: session.user.avatar,
      createdAt: session.user.createdAt,
    };

    this.sessionCache.set(token, { userId: user.id, expiresAt: session.expiresAt, user });

    return user;
  }

  // SuperAdmin login — بدون tenantId
  async loginSuperAdmin(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId: null, role: 'SUPER_ADMIN' },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: { userId: user.id, token: tokenHash, expiresAt },
    });

    const userData = {
      id: user.id,
      tenantId: null,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    this.sessionCache.set(rawToken, { userId: user.id, expiresAt, user: userData });

    return { accessToken: rawToken, data: userData };
  }
}