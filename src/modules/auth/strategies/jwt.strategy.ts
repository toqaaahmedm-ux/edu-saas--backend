import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../auth.service';

// PERF-18 FIX: before this, validate() was running prisma.user.findUnique() on
// every authenticated request — meaning an extra DB query on every API call, even though
// the JWT itself is stateless, signed, and doesn't need verification. At 1000 requests/second
// that's 1000 extra DB queries per second for no benefit.
//
// The fix: return the payload data directly after passport verifies the signature —
// the payload is trustworthy since it's signed with JWT_SECRET and isn't expired
// (passport checks this automatically because of ignoreExpiration: false).
//
// Note: if you need to make sure the user still exists in the database (e.g. after
// account deletion), you could add a DB lookup here — but keep in mind this breaks the
// stateless design and adds latency. A better alternative is a token revocation list
// in Redis if this matters for your case.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // reads from the httpOnly cookie first, falls back to the Bearer header if not present
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['session-token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: JwtPayload) {
    // passport already verified the signature and expiry before reaching here —
    // we return the payload directly and it becomes req.user
    return {
      id:       payload.sub,
      email:    payload.email,
      role:     payload.role,
      tenantId: payload.tenantId,
      name:     payload.name,
    };
  }
}