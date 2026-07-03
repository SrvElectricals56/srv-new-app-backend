import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let responseBody: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else {
        responseBody = { ...(res as Record<string, unknown>) };
        const rawMessage = (res as { message?: string | string[] }).message;
        if (Array.isArray(rawMessage)) {
          message = rawMessage.join(', ');
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      const err = exception as any;
      // PostgreSQL error codes
      if (err.code === '23505') {
        // Unique constraint violation
        status = HttpStatus.CONFLICT;
        const detail: string = err.detail || '';
        if (detail.includes('phone')) {
          message = 'This phone number is already registered';
        } else if (detail.includes('electricianCode')) {
          message = 'This electrician code already exists. Please generate a new one';
        } else if (detail.includes('dealerCode')) {
          message = 'This dealer code already exists';
        } else if (detail.includes('email')) {
          message = 'This email is already registered';
        } else if (detail.includes('sku')) {
          message = 'This SKU already exists';
        } else {
          message = `Duplicate entry: ${detail}`;
        }
      } else if (err.code === '23503') {
        // Foreign key violation
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced record does not exist (invalid ID)';
      } else if (err.code === '22P02') {
        // Invalid UUID
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid ID format';
      } else if (err.code === '23502') {
        // Not null violation
        status = HttpStatus.BAD_REQUEST;
        const column = err.column || 'field';
        message = `Required field missing: ${column}`;
      } else {
        this.logger.error(`DB Error ${err.code}: ${err.message}`);
        message = 'Database error occurred';
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      ...responseBody,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
