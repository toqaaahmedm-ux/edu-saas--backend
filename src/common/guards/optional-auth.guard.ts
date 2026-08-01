import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Sprint 2 bugfix: @Public() skips JWT verification entirely, so req.user
// is never populated even for a logged-in student — that's why lesson
// completion state was invisible right after marking a lesson done.
// This guard actually tries to verify the JWT (from cookie or bearer
// header), but never rejects the request if it's missing or invalid —
// it just leaves req.user unset, so anonymous visitors still get through.
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any) {
    return user || undefined;
  }
}
