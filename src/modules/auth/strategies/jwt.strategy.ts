// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';
// import { PrismaService } from '../../../prisma/prisma.service';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(private prisma: PrismaService) {
//     super({
//       jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
//       ignoreExpiration: false,
//       secretOrKey: process.env.JWT_SECRET as string,
//     });
//   }

//   async validate(payload: { sub: string; role: string }) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: payload.sub },
//     });
//     if (!user) throw new UnauthorizedException();
//     return { id: user.id, email: user.email, role: user.role };
//   }
// // }
// import { Injectable, UnauthorizedException } from '@nestjs/common';
// import { PassportStrategy } from '@nestjs/passport';
// import { ExtractJwt, Strategy } from 'passport-jwt';
// import { PrismaService } from '../../../prisma/prisma.service';
// import { Request } from 'express';

// @Injectable()
// export class JwtStrategy extends PassportStrategy(Strategy) {
//   constructor(private prisma: PrismaService) {
//     super({
//       jwtFromRequest: ExtractJwt.fromExtractors([
//         (req: Request) => req?.cookies?.['access_token'] ?? null,
//       ]),
//       ignoreExpiration: false,
//       secretOrKey: process.env.JWT_SECRET!,
//     });
//   }

//   async validate(payload: { sub: string; email: string; role: string }) {
//     const user = await this.prisma.user.findUnique({
//       where: { id: payload.sub },
//     });
//     if (!user) throw new UnauthorizedException();
//     return { id: user.id, email: user.email, role: user.role, name: user.name };
//   }
// }
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { Request } from 'express';
import { JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      //  يقرأ من httpOnly cookie أولاً، لو مش موجود يجرب Bearer header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['session-token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    //  مفيش DB lookup — stateless
    // بس نتأكد إن الـ user لسه موجود (optional — ممكن تشيلها لو performance مهم)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, tenantId: true, email: true, role: true, name: true },
    });
    if (!user) throw new UnauthorizedException();
    return user; // ده بيبقى req.user
  }
}