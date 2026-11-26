import { sha256 } from '@noble/hashes/sha2';
import { postJson } from './api';

/** Must match services/crowd POW_BITS: the cost of one day key (about a second on a phone). */
const POW_BITS = 20;

function zeroBits(b: Uint8Array): number {
  let n = 0;
  for (const x of b) {
    if (x === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(x) - 24;
  }
  return n;
}

/**
 * The proof of work for registering a key: a nonce whose hash with the key and the
 * UTC day starts with POW_BITS zero bits. Done in slices so the screen stays live.
 */
async function proofOfWork(day: string, x: string, y: string): Promise<string> {
  const enc = new TextEncoder();
  const prefix = `afterglow-device:v1:${day}:${x}.${y}:`;
  for (let nonce = 0; ; nonce++) {
    if (zeroBits(sha256(enc.encode(prefix + nonce))) >= POW_BITS) return String(nonce);
    if (nonce % 20_000 === 19_999) await new Promise((r) => setTimeout(r, 0));
  }
}

/**
 * Today's device key (crowd-reports CR-02). An ECDSA P-256 key pair made on the
 * device, private half non-extractable, replaced every UTC day so reports on
 * different days cannot be linked. It is kept in IndexedDB (a CryptoKey survives
 * there without ever being exported), so one phone stays one device all day and is
 * never counted twice toward k.
 */

interface DayKey {
  readonly day: string;
  readonly deviceId: string;
  readonly privateKey: CryptoKey;
}

const DB = 'afterglow-device';
const STORE = 'keys';
const today = (): string => new Date().toISOString().slice(0, 10);

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function read(): Promise<DayKey | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('current');
      req.onsuccess = () => resolve((req.result as DayKey | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function write(k: DayKey): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(k, 'current');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // no IndexedDB (private mode): the key lives for this session only
  }
}

let pending: Promise<DayKey | null> | null = null;

/** Today's key, registering a fresh one with the server when the day has changed. */
export function todaysKey(): Promise<DayKey | null> {
  if (pending) return pending;
  pending = (async () => {
    const existing = await read();
    if (existing && existing.day === today()) return existing;
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
      'verify',
    ]);
    const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    if (!jwk.x || !jwk.y) return null;
    const nonce = await proofOfWork(today(), jwk.x, jwk.y);
    const r = await postJson('/v1/devices', {
      publicKey: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      nonce,
    });
    const id = (r.json as { deviceId?: unknown } | null)?.deviceId;
    if (r.status !== 201 || typeof id !== 'string') return null;
    const k: DayKey = { day: today(), deviceId: id, privateKey: pair.privateKey };
    await write(k);
    return k;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

const b64url = (bytes: ArrayBuffer): string => {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** Sign and send one report. True when the server accepted it (or already had it). */
export async function sendReport(report: Record<string, unknown>): Promise<boolean> {
  const key = await todaysKey();
  if (!key) return false;
  const text = JSON.stringify(report);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key.privateKey,
    new TextEncoder().encode(text),
  );
  const r = await postJson('/v1/reports', {
    deviceId: key.deviceId,
    report: text,
    signature: b64url(sig),
  });
  return r.status === 202;
}
