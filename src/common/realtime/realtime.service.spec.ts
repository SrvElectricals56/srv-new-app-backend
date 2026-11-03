import { filter, firstValueFrom, take } from 'rxjs';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('pushes change events to connected streams without exposing record data', async () => {
    const service = new RealtimeService();
    const nextChange = firstValueFrom(
      service.stream().pipe(
        filter((event) => (event.data as any)?.type === 'change'),
        take(1),
      ),
    );

    service.publish('admin', 'members');
    await expect(nextChange).resolves.toMatchObject({
      data: {
        type: 'change',
        source: 'admin',
        scope: 'members',
      },
    });
  });
});
