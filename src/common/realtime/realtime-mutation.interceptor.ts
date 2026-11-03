import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import {
  RealtimeChangeScope,
  RealtimeChangeSource,
  RealtimeService,
} from './realtime.service';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function classifyRealtimeMutation(
  method: string,
  requestPath: string,
): { source: RealtimeChangeSource; scope: RealtimeChangeScope } | null {
  if (!MUTATION_METHODS.has(String(method).toUpperCase())) return null;

  const path = String(requestPath ?? '').split('?')[0].toLowerCase();
  if (
    !path ||
    /\/realtime\/events$/.test(path) ||
    /\/mobile\/activity$/.test(path) ||
    /\/mobile\/assistant\//.test(path) ||
    /\/notifications\/push-token$/.test(path) ||
    /\/upload\//.test(path) ||
    /\/auth\/(?:login|refresh|logout|forgot-password|reset-password)/.test(path) ||
    /\/(?:send|verify)-otp$/.test(path)
  ) {
    return null;
  }

  const source: RealtimeChangeSource = /\/mobile(?:\/|$)/.test(path)
    ? 'mobile'
    : 'admin';

  let scope: RealtimeChangeScope = 'all';
  if (/\/settings|\/app-icons?/.test(path)) scope = 'settings';
  else if (/\/product-orders?|\/cart|\/delivery/.test(path)) scope = 'orders';
  else if (/\/products?|\/product-categories|\/points-config/.test(path)) scope = 'products';
  else if (/\/banners?|\/testimonials?|\/offers?|\/plays?/.test(path)) scope = 'content';
  else if (/\/gifts?/.test(path)) scope = 'gifts';
  else if (/\/redemptions?|\/wallet|\/finance|\/transfer/.test(path)) scope = 'wallet';
  else if (/\/scans?|\/qr-codes?/.test(path)) scope = 'scans';
  else if (/\/notifications?/.test(path)) scope = 'notifications';
  else if (/\/support/.test(path)) scope = 'support';
  else if (/\/electricians?|\/dealers?|\/app-users?|\/counterboys?|\/kyc/.test(path)) scope = 'members';

  return { source, scope };
}

@Injectable()
export class RealtimeMutationInterceptor implements NestInterceptor {
  constructor(private readonly realtimeService: RealtimeService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
    }>();
    const change = classifyRealtimeMutation(
      request?.method ?? '',
      request?.originalUrl ?? request?.url ?? '',
    );

    if (!change) return next.handle();

    return next.handle().pipe(
      tap(() => this.realtimeService.publish(change.source, change.scope)),
    );
  }
}
