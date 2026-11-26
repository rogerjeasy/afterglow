import { useSyncExternalStore } from 'react';
import raw from '../cloud/config.json';
import { postJson } from '../public/api';

/**
 * Notifications (product description 7.13 "channels: push"). Two kinds, each off
 * until the person turns it on:
 * - Alerts on this phone: when an alert appears while Afterglow is in the
 *   background, the phone shows it. Made on the phone; nothing is sent anywhere.
 * - My area: the server tells this phone when the crowd in its ~1 km cell goes dark
 *   or comes back, even when Afterglow is closed. That stores this browser's push
 *   address under the cell for 30 days (renewed while the app is used).
 */

export interface NotifyPrefs {
  readonly alerts: boolean;
  /** The cell followed for crowd changes, or null. */
  readonly area: string | null;
}

const KEY = 'afterglow.notify.v1';
const VAPID: string | null =
  typeof (raw as { vapidPublicKey?: unknown }).vapidPublicKey === 'string'
    ? ((raw as { vapidPublicKey: string }).vapidPublicKey ?? null)
    : null;

function load(): NotifyPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NotifyPrefs> | null;
    return {
      alerts: p?.alerts === true,
      area: typeof p?.area === 'string' && /^[0-9b-hjkmnp-z]{6}$/.test(p.area) ? p.area : null,
    };
  } catch {
    return { alerts: false, area: null };
  }
}

let prefs: NotifyPrefs =
  typeof localStorage === 'undefined' ? { alerts: false, area: null } : load();
const listeners = new Set<() => void>();
function save(next: NotifyPrefs): void {
  prefs = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // private mode
  }
  for (const l of listeners) l();
}

export function useNotify(): NotifyPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => prefs,
  );
}

export const canNotify = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
export const canPush = (): boolean => canNotify() && 'PushManager' in window && VAPID !== null;

async function permission(): Promise<boolean> {
  if (!canNotify()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export type NotifyOutcome = 'on' | 'off' | 'denied' | 'unsupported' | 'failed';

export async function setAlertNotifications(on: boolean): Promise<NotifyOutcome> {
  if (!on) {
    save({ ...prefs, alerts: false });
    return 'off';
  }
  if (!canNotify()) return 'unsupported';
  if (!(await permission())) return 'denied';
  save({ ...prefs, alerts: true });
  return 'on';
}

/** Show an alert while the app is in the background (the open app already shows it). */
export async function notifyInBackground(title: string, body: string, tag: string): Promise<void> {
  if (!prefs.alerts || !canNotify() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;
  const reg = await navigator.serviceWorker.getRegistration();
  await reg?.showNotification(title, { body, tag, icon: 'icon-192.png' });
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function subscription(): Promise<PushSubscription | null> {
  if (!canPush() || !VAPID) return null;
  const reg = await navigator.serviceWorker.ready;
  return (
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(VAPID),
    }))
  );
}

/** Follow one cell for crowd changes (and stop following any other). */
export async function followArea(cell: string): Promise<NotifyOutcome> {
  if (!canPush()) return 'unsupported';
  if (!(await permission())) return 'denied';
  try {
    const sub = await subscription();
    if (!sub) return 'failed';
    if (prefs.area && prefs.area !== cell) {
      await postJson('/v1/push/unsubscribe', { endpoint: sub.endpoint, cells: [prefs.area] });
    }
    const r = await postJson('/v1/push/subscribe', { subscription: sub.toJSON(), cells: [cell] });
    if (r.status !== 201) return 'failed';
    save({ ...prefs, area: cell });
    return 'on';
  } catch {
    return 'failed';
  }
}

export async function unfollowArea(): Promise<void> {
  const area = prefs.area;
  save({ ...prefs, area: null });
  if (!area || !canPush()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await postJson('/v1/push/unsubscribe', { endpoint: sub.endpoint, cells: [area] });
      await sub.unsubscribe();
    }
  } catch {
    // the subscription expires by itself within 30 days
  }
}

/** Renew the 30-day subscription while the app is in use; once a day is plenty. */
export async function renewArea(): Promise<void> {
  if (!prefs.area || !canPush() || Notification.permission !== 'granted') return;
  const last = Number(localStorage.getItem(`${KEY}.renewed`) ?? 0);
  if (Date.now() - last < 86_400_000) return;
  const sub = await subscription().catch(() => null);
  if (!sub) return;
  const r = await postJson('/v1/push/subscribe', {
    subscription: sub.toJSON(),
    cells: [prefs.area],
  });
  if (r.status === 201) localStorage.setItem(`${KEY}.renewed`, String(Date.now()));
}

export function outcomeText(o: NotifyOutcome): string | null {
  switch (o) {
    case 'denied':
      return 'Notifications are blocked for Afterglow. Allow them in the browser settings.';
    case 'unsupported':
      return 'This browser cannot show notifications. On an iPhone, add Afterglow to the Home Screen first.';
    case 'failed':
      return 'That did not work. Check the connection and try again.';
    default:
      return null;
  }
}
