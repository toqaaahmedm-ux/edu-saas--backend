import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Sentry integration test — verified working on 2026-07-19.
  // To re-test after any Sentry config changes, temporarily add:
  //
  //   @Public()
  //   @Get('debug-sentry')
  //   getError() {
  //     throw new Error('Sentry test error — should appear in dashboard');
  //   }
  //
  // then visit /api/debug-sentry and check the Sentry issues dashboard.
  // Remove it again afterward — this endpoint should never exist in a
  // running app since it's an unauthenticated way to throw a 500.
}