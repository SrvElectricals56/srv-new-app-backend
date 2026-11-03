import { firstValueFrom, of } from 'rxjs';
import {
  classifyRealtimeMutation,
  RealtimeMutationInterceptor,
} from './realtime-mutation.interceptor';
import { RealtimeService } from './realtime.service';

describe('classifyRealtimeMutation', () => {
  it('publishes mobile scans for the admin panel', () => {
    expect(classifyRealtimeMutation('POST', '/api/v1/mobile/scan')).toEqual({
      source: 'mobile',
      scope: 'scans',
    });
  });

  it('publishes admin changes using a scoped event', () => {
    expect(classifyRealtimeMutation('PATCH', '/api/v1/electricians/member-id')).toEqual({
      source: 'admin',
      scope: 'members',
    });
    expect(classifyRealtimeMutation('PUT', '/api/v1/settings/bulk')).toEqual({
      source: 'admin',
      scope: 'settings',
    });
    expect(classifyRealtimeMutation('PATCH', '/api/v1/app-icons/icon-id/set-active')).toEqual({
      source: 'admin',
      scope: 'settings',
    });
    expect(classifyRealtimeMutation('PATCH', '/api/v1/product-orders/123')).toEqual({
      source: 'admin',
      scope: 'orders',
    });
  });

  it('ignores reads and noisy device activity', () => {
    expect(classifyRealtimeMutation('GET', '/api/v1/products')).toBeNull();
    expect(classifyRealtimeMutation('POST', '/api/v1/mobile/activity')).toBeNull();
    expect(classifyRealtimeMutation('POST', '/api/v1/mobile/auth/login/send-otp')).toBeNull();
  });

  it('publishes only after a successful mutation completes', async () => {
    const realtimeService = { publish: jest.fn() } as unknown as RealtimeService;
    const interceptor = new RealtimeMutationInterceptor(realtimeService);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', originalUrl: '/api/v1/mobile/scan' }),
      }),
    } as any;

    await firstValueFrom(interceptor.intercept(context, { handle: () => of({ ok: true }) }));
    expect(realtimeService.publish).toHaveBeenCalledWith('mobile', 'scans');
  });
});
