import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Notifications (.kiro/specs/device-features DF-20, DF-21): alerts shown on the phone
 * while Afterglow is in the background, sending nothing; following the area subscribes
 * this browser for its cell, renews at most daily, and unsubscribes when turned off.
 */

const posts = vi.hoisted(
  () => [] as { path: string; body: { cells?: string[]; endpoint?: string; nonce?: string } }[],
);
vi.mock('../public/api', () => ({
  postJson: async (path: string, body: never) => {
    posts.push({ path, body });
    return { status: path.endsWith('/subscribe') ? 201 : 200, json: null };
  },
}));
vi.mock('../public/deviceKey', () => ({ proofOfWorkOver: async () => '12345' }));

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc';

interface Env {
  permission?: 'granted' | 'denied' | 'default';
  answer?: 'granted' | 'denied';
  visibility?: 'visible' | 'hidden';
  supported?: boolean;
  stored?: Record<string, string>;
}

/** A fresh copy of the module in a browser with these abilities. */
async function fresh(env: Env = {}) {
  const shown: { title: string; body: string; tag: string }[] = [];
  const unsubscribed = vi.fn(async () => true);
  const sub = {
    endpoint: ENDPOINT,
    toJSON: () => ({ endpoint: ENDPOINT, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: unsubscribed,
  };
  const reg = {
    showNotification: async (title: string, o: { body: string; tag: string }) => {
      shown.push({ title, body: o.body, tag: o.tag });
    },
    pushManager: { getSubscription: async () => sub, subscribe: async () => sub },
  };
  const data = new Map(Object.entries(env.stored ?? {}));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => data.set(k, v),
  });
  const Notification = {
    permission: env.permission ?? 'granted',
    requestPermission: async () => env.answer ?? 'granted',
  };
  vi.stubGlobal('Notification', Notification);
  vi.stubGlobal('window', env.supported === false ? {} : { Notification, PushManager: class {} });
  vi.stubGlobal(
    'navigator',
    env.supported === false
      ? {}
      : { serviceWorker: { ready: Promise.resolve(reg), getRegistration: async () => reg } },
  );
  vi.stubGlobal('document', { visibilityState: env.visibility ?? 'hidden' });
  vi.stubGlobal('fetch', () => {
    throw new Error('notifications made on the phone send nothing');
  });
  posts.length = 0;
  vi.resetModules();
  const m = await import('./notify');
  return { m, shown, data, unsubscribed };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Alert notifications (DF-20)', () => {
  it('DF-20 an alert is shown on the phone only while notifications are on, allowed, and the app is in the background; nothing is sent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.constantFrom('granted' as const, 'denied' as const, 'default' as const),
        fc.constantFrom('visible' as const, 'hidden' as const),
        async (on, permission, visibility) => {
          const { m, shown } = await fresh({
            permission,
            visibility,
            stored: on
              ? { 'afterglow.notify.v1': JSON.stringify({ alerts: true, area: null }) }
              : {},
          });
          await m.notifyInBackground('Fridge: 1 h left', 'Keep the door shut.', 'alert-1');
          const expected = on && permission === 'granted' && visibility === 'hidden';
          expect(shown).toEqual(
            expected
              ? [{ title: 'Fridge: 1 h left', body: 'Keep the door shut.', tag: 'alert-1' }]
              : [],
          );
          expect(posts).toEqual([]);
        },
      ),
      { numRuns: 24 },
    );
  });

  it('DF-20 turning alerts on asks for permission and says when it is blocked or impossible', async () => {
    expect(await (await fresh({ supported: false })).m.setAlertNotifications(true)).toBe(
      'unsupported',
    );
    expect(await (await fresh({ permission: 'denied' })).m.setAlertNotifications(true)).toBe(
      'denied',
    );
    expect(
      await (await fresh({ permission: 'default', answer: 'denied' })).m.setAlertNotifications(
        true,
      ),
    ).toBe('denied');
    const { m, data } = await fresh({ permission: 'default', answer: 'granted' });
    expect(await m.setAlertNotifications(true)).toBe('on');
    expect(JSON.parse(data.get('afterglow.notify.v1') ?? '{}').alerts).toBe(true);
    expect(await m.setAlertNotifications(false)).toBe('off');
    for (const o of ['denied', 'unsupported', 'failed'] as const)
      expect(m.outcomeText(o)).toBeTruthy();
    expect(m.outcomeText('on')).toBeNull();
  });
});

describe('Following the area (DF-21)', () => {
  it('DF-21 following a cell subscribes for that cell only, and moving to another unsubscribes the old one first', async () => {
    const { m, data } = await fresh();
    expect(await m.followArea('u4pruy')).toBe('on');
    expect(posts.map((p) => [p.path, p.body.cells])).toEqual([['/v1/push/subscribe', ['u4pruy']]]);
    expect(posts[0]?.body.nonce).toBe('12345');
    posts.length = 0;
    expect(await m.followArea('u4pruv')).toBe('on');
    expect(posts.map((p) => [p.path, p.body.cells])).toEqual([
      ['/v1/push/unsubscribe', ['u4pruy']],
      ['/v1/push/subscribe', ['u4pruv']],
    ]);
    expect(JSON.parse(data.get('afterglow.notify.v1') ?? '{}').area).toBe('u4pruv');
  });

  it('DF-21 turning it off unsubscribes the cell and the browser', async () => {
    const { m, data, unsubscribed } = await fresh({
      stored: { 'afterglow.notify.v1': JSON.stringify({ alerts: false, area: 'u4pruy' }) },
    });
    await m.unfollowArea();
    expect(posts.map((p) => [p.path, p.body.cells, p.body.endpoint])).toEqual([
      ['/v1/push/unsubscribe', ['u4pruy'], ENDPOINT],
    ]);
    expect(unsubscribed).toHaveBeenCalledOnce();
    expect(JSON.parse(data.get('afterglow.notify.v1') ?? '{}').area).toBeNull();
  });

  it('DF-21 a stored area that is not a cell is ignored, never followed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (area) => {
        const { m } = await fresh({
          stored: { 'afterglow.notify.v1': JSON.stringify({ alerts: false, area }) },
        });
        await m.renewArea();
        const isCell = /^[0-9b-hjkmnp-z]{6}$/.test(area);
        expect(posts.length).toBe(isCell ? 1 : 0);
      }),
      { numRuns: 30 },
    );
  });

  it('DF-21 the subscription is renewed at most once a day while the app is used', async () => {
    const DAY = 86_400_000;
    const now = Date.UTC(2026, 10, 27, 12, 0, 0);
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 3 * DAY }), async (since) => {
        const { m, data } = await fresh({
          stored: {
            'afterglow.notify.v1': JSON.stringify({ alerts: false, area: 'u4pruy' }),
            'afterglow.notify.v1.renewed': String(now - since),
          },
        });
        vi.useFakeTimers({ toFake: ['Date'], now });
        await m.renewArea();
        vi.useRealTimers();
        expect(posts.length).toBe(since >= DAY ? 1 : 0);
        expect(data.get('afterglow.notify.v1.renewed')).toBe(
          String(since >= DAY ? now : now - since),
        );
        if (posts.length) expect(posts[0]?.body.cells).toEqual(['u4pruy']);
      }),
      { numRuns: 30 },
    );
  });
});
