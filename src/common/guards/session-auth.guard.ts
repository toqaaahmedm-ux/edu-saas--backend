import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { createHash } from 'crypto';

interface CacheEntry {
  user: any;
  expiresAt: number;
}

// Week 7: renamed from JwtAuthGuard → SessionAuthGuard
// اسم أوضح — الـ guard ده بيستخدم session cookies مش JWT
@Injectable()
export class SessionAuthGuard implements CanActivate {
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  // SEC-01: helper لعمل hash للـ token
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    let token = request.cookies?.['session-token'];

    if (!token) {
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token) throw new UnauthorizedException();

    // QE-04: دور في الـ cache بالـ raw token
    const cached = this.cache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      (request as any).user = cached.user;
      return true;
    }

    if (cached) this.cache.delete(token);

    // SEC-01: hash الـ token قبل البحث في الـ DB
    const tokenHash = this.hashToken(token);

    const session = await this.prisma.session.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { token: tokenHash } });
      }
      throw new UnauthorizedException();
    }

    // احفظ في الـ cache بالـ raw token
    this.cache.set(token, {
      user: session.user,
      expiresAt: Date.now() + this.TTL_MS,
    });

    (request as any).user = session.user;
    return true;
  }

  invalidateToken(token: string) {
    this.cache.delete(token);
  }
}