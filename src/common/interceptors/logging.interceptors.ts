import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();

    // BE-L02: strip query params from the log so PII doesn't get logged
    const cleanUrl = url.split('?')[0];

    return next.handle().pipe(
      tap(() => {
        this.logger.log(`${method} ${cleanUrl} — ${Date.now() - now}ms`);
      }),
    );
  }
}