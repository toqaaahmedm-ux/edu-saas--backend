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

// ── نوع الـ cache entry ───────────────────────────────
interface CacheEntry {
  user: any;
  expiresAt: number; // timestamp بالـ milliseconds
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  // QE-04: in-memory cache — بيمنع DB query على كل request
  private cache = new Map<string, CacheEntry>();
  private readonly TTL_MS = 60 * 1000; // 60 ثانية

  constructor(
    private prisma: PrismaService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // لو الـ route عليها @Public() — اسمح بدون token
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

    // ── 1. دور في الـ cache الأول ────────────────────────
    // QE-04: لو الـ token موجود في الـ cache وصالح — ارجع فوراً بدون DB query
    const cached = this.cache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      (request as any).user = cached.user;
      return true;
    }

    // لو الـ cache entry منتهية، امسحها
    if (cached) this.cache.delete(token);

    // ── 2. لو مش في الـ cache — اجيب من الـ DB ──────────
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        await this.prisma.session.delete({ where: { token } });
      }
      throw new UnauthorizedException();
    }

    // ── 3. احفظ في الـ cache لـ 60 ثانية ────────────────
    this.cache.set(token, {
      user: session.user,
      expiresAt: Date.now() + this.TTL_MS,
    });

    (request as any).user = session.user;
    return true;
  }

  // بتتستدعى عند الـ logout عشان تمسح الـ token من الـ cache فوراً
  invalidateToken(token: string) {
    this.cache.delete(token);
  }
}