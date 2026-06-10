import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  // ARCH-02: Cache للـ sessions في الـ memory
  private sessionCache = new Map<string, { userId: string; expiresAt: Date; user: any }>();

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already exists');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        hashedPassword,
      },
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: { userId: user.id, token, expiresAt },
    });

    // DB-07: مسح كل الـ sessions المنتهية لهذا الـ user عند الـ login
    // بيمنع إن الـ Session table تكبر للأبد
    await this.prisma.session.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lt: new Date() },
      },
    });

    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // حفظ في الـ cache
    this.sessionCache.set(token, { userId: user.id, expiresAt, user: userData });

    return {
      accessToken: token,
      data: userData,
    };
  }

  async refresh(oldToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { token: oldToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) await this.prisma.session.delete({ where: { token: oldToken } });
      this.sessionCache.delete(oldToken);
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.session.delete({ where: { token: oldToken } });
    this.sessionCache.delete(oldToken);

    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.session.create({
      data: { userId: session.user.id, token: newToken, expiresAt },
    });

    const userData = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    };

    this.sessionCache.set(newToken, { userId: session.user.id, expiresAt, user: userData });

    return { accessToken: newToken, data: userData };
  }

  async logout(token: string) {
    await this.prisma.session.deleteMany({ where: { token } });
    this.sessionCache.delete(token);
    return { message: 'Logged out successfully' };
  }

  async getMe(token: string) {
    // تحقق من الـ cache أولاً
    const cached = this.sessionCache.get(token);
    if (cached && cached.expiresAt > new Date()) {
      return cached.user;
    }

    // لو مش في الـ cache — اجيب من الـ DB
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid session');
    }

    // DL-04: whitelist بدل spread — أي field جديد مش هيتبعت تلقائياً
    const user = {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      avatar: session.user.avatar,
      createdAt: session.user.createdAt,
    };

    // حفظ في الـ cache
    this.sessionCache.set(token, {
      userId: user.id,
      expiresAt: session.expiresAt,
      user,
    });

    return user;
  }
}