import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';

// ← catches all exceptions, not just HttpException
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || message;
    } else if (exception instanceof Error) {
      // Prisma errors
      if ((exception as any).code === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'Record already exists';
      } else if ((exception as any).code === 'P2025') {
        status = HttpStatus.NOT_FOUND;
        message = 'Record not found';
      } else {
        // if not in production — send the real message for debugging
        message = process.env.NODE_ENV !== 'production'
          ? exception.message
          : 'Internal server error';
      }
    }

    // log the error on the server
    this.logger.error(
      `${request.method} ${request.url} — ${status} — ${exception instanceof Error ? exception.message : exception}`,
    );

    // Report real, unexpected errors to Sentry (5xx only — a 404 for
    // a wrong URL or a 401 from a bad login isn't a bug in our code,
    // it's just this filter had to catch it too). This is the one place
    // in the app that sees every exception, since @Catch() with no
    // argument catches everything, not just HttpException.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR && process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}