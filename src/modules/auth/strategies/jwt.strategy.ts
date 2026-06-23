import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../auth.service';

// PERF-18 FIX: قبل كده validate() كانت بتعمل prisma.user.findUnique() على
// كل request موثّق — ده معناه استعلام DB إضافي على كل API call حتى لو
// الـ JWT نفسه stateless وموقّع ومش محتاج تحقق. مع 1000 request/second
// ده 1000 استعلام DB زيادة في الثانية من غير أي فايدة.
//
// الحل: نرجع بيانات الـ payload مباشرة بعد ما passport يتحقق من التوقيع —
// الـ payload موثوق لأنه موقّع بالـ JWT_SECRET ومش منتهي الصلاحية
// (passport بيتحقق من ده تلقائياً بسبب ignoreExpiration: false).
//
// ملاحظة: لو محتاجة تتأكد إن الـ user لسه موجود في الداتابيز (مثلاً بعد
// حذف الحساب)، ممكن تضيفي DB lookup هنا — لكن اعرفي إن ده بيكسر الـ
// stateless design وبيضيف latency. البديل الأفضل هو token revocation list
// في Redis لو الأمر ده مهم عندك.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // يقرأ من httpOnly cookie أولاً، لو مش موجود يجرب Bearer header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.['session-token'] ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  validate(payload: JwtPayload) {
    // passport اتحقق من التوقيع والـ expiry قبل ما يوصل هنا —
    // بنرجع الـ payload مباشرة وده بيبقى req.user
    return {
      id:       payload.sub,
      email:    payload.email,
      role:     payload.role,
      tenantId: payload.tenantId,
      name:     payload.name,
    };
  }
}