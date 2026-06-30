import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
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
    private configService: ConfigService,
  ) {}

  private signToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  // ✅ جديد — بيعمل refresh token بـ secret مختلف وعمر 7 أيام
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
    const refreshToken = this.signRefreshToken(user.id); // ✅ جديد

    return {
      accessToken,
      refreshToken, // ✅ جديد
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
    const refreshToken = this.signRefreshToken(user.id); // ✅ جديد

    return {
      accessToken,
      refreshToken, // ✅ جديد
      data: {
        id: user.id,
        tenantId: null,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ✅ جديد — بيتحقق من الـ refresh token ويرجع access token جديد
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
}