import { Injectable, MessageEvent } from '@nestjs/common';
import { interval, map, merge, Observable, of, Subject } from 'rxjs';

export type RealtimeChangeSource = 'admin' | 'mobile';
export type RealtimeChangeScope =
  | 'all'
  | 'content'
  | 'gifts'
  | 'members'
  | 'notifications'
  | 'orders'
  | 'products'
  | 'scans'
  | 'settings'
  | 'support'
  | 'wallet';

export type RealtimeChangeEvent = {
  id: number;
  type: 'change';
  source: RealtimeChangeSource;
  scope: RealtimeChangeScope;
  at: string;
};

@Injectable()
export class RealtimeService {
  private readonly changes = new Subject<RealtimeChangeEvent>();
  private sequence = Date.now();

  publish(source: RealtimeChangeSource, scope: RealtimeChangeScope) {
    this.changes.next({
      id: ++this.sequence,
      type: 'change',
      source,
      scope,
      at: new Date().toISOString(),
    });
  }

  stream(): Observable<MessageEvent> {
    return merge(
      of({ data: { type: 'ready', at: new Date().toISOString() }, retry: 2_000 }),
      this.changes.pipe(map((change) => ({ id: String(change.id), data: change }))),
      interval(15_000).pipe(
        map(() => ({ data: { type: 'heartbeat', at: new Date().toISOString() } })),
      ),
    );
  }
}
