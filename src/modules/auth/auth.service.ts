import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

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
  ) {}

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
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
    const user = await this.prisma.user.create({
      data: { tenantId, name: dto.name, email: dto.email, hashedPassword },
    });

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  async login(dto: LoginDto, tenantId: string) {
    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId, email: dto.email } },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = this.buildPayload(user);
    const accessToken = this.signToken(payload);

    return {
      accessToken,
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

    return {
      accessToken,
      data: {
        id: user.id,
        tenantId: null,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  // SEC-01 FIX: دالة جديدة لإعادة توقيع توكن من مستخدم تم التحقق منه بالفعل
  // بتُستخدم فقط من الـ refresh endpoint، بعد ما الـ JWT guard يتحقق من صحة التوكن القديم
  reissueToken(user: {
    id: string;
    email: string;
    role: string;
    tenantId: string | null;
    name: string;
  }): string {
    const payload = this.buildPayload({
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      name: user.name,
    });
    return this.signToken(payload);
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
}