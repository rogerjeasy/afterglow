import type { cells } from '@afterglow/core';
import type { Window } from './history.js';
import type { Advisory, CrowdStore, SiteStatus } from './store.js';

/**
 * An in-memory CrowdStore for the property tests, with the same semantics as the
 * DynamoDB store: TTLs are honoured on read, `claim` is an atomic "absent or expired",
 * and a report is unique per (cell, minute, device). Test code only; never bundled
 * (the Lambda entry point does not import it).
 */
export interface MemoryCrowdStore extends CrowdStore {
  /** Every key and value written, for "nothing about the caller is stored" checks. */
  readonly written: () => string[];
}

export function memoryCrowdStore(): MemoryCrowdStore {
  const reports = new Map<string, { r: cells.CellReport; exp: number }>();
  const devices = new Map<string, { jwk: string; exp: number }>();
  const cache = new Map<string, { v: string; exp: number }>();
  const subs = new Map<string, { sub: string; exp: number }>();
  const windows = new Map<string, { w: Window; exp: number }>();
  return {
    written: () => [
      ...[...reports].flatMap(([k, v]) => [k, JSON.stringify(v.r)]),
      ...[...devices].flatMap(([k, v]) => [k, v.jwk]),
      ...[...cache].flatMap(([k, v]) => [k, v.v]),
      ...[...subs].flatMap(([k, v]) => [k, v.sub]),
      ...[...windows].flatMap(([k, v]) => [k, JSON.stringify(v.w)]),
    ],
    async putWindow(cell, windowStart, state, deviceCount, expiresAtS) {
      windows.set(`${cell}#${windowStart}`, {
        w: { windowStart, state: state as Window['state'], deviceCount },
        exp: expiresAtS,
      });
    },
    async windowsSince(cell, fromMinute, nowS) {
      return [...windows]
        .filter(
          ([k, v]) => k.startsWith(`${cell}#`) && v.exp > nowS && v.w.windowStart >= fromMinute,
        )
        .map(([, v]) => v.w);
    },
    async advisoriesFor(): Promise<Advisory[]> {
      return [];
    },
    async sitesIn(): Promise<SiteStatus[]> {
      return [];
    },
    async putDevice(deviceId, jwk, exp) {
      devices.set(deviceId, { jwk, exp });
    },
    async getDevice(deviceId, nowS) {
      const d = devices.get(deviceId);
      return d && d.exp > nowS ? d.jwk : null;
    },
    async putReport(r, exp) {
      const key = `${r.geohash6}#${r.minute}#${r.deviceEpoch}`;
      if (reports.has(key)) return false;
      reports.set(key, { r, exp });
      return true;
    },
    async reportsSince(g, fromMinute, nowS) {
      return [...reports.values()]
        .filter((x) => x.r.geohash6 === g && x.r.minute >= fromMinute && x.exp > nowS)
        .map((x) => x.r);
    },
    async getCache(key, nowS) {
      const c = cache.get(key);
      return c && c.exp > nowS ? c.v : null;
    },
    async putCache(key, v, exp) {
      cache.set(key, { v, exp });
    },
    async claim(key, v, exp, nowS) {
      const c = cache.get(key);
      if (c && c.exp > nowS) return false;
      cache.set(key, { v, exp });
      return true;
    },
    async putSub(cell, id, sub, exp) {
      subs.set(`${cell}#${id}`, { sub, exp });
    },
    async deleteSub(cell, id) {
      subs.delete(`${cell}#${id}`);
    },
    async subsPage(cell, nowS) {
      return {
        subs: [...subs]
          .filter(([k, v]) => k.startsWith(`${cell}#`) && v.exp > nowS)
          .map(([k, v]) => ({ id: k.slice(cell.length + 1), sub: v.sub })),
        next: null,
      };
    },
    async getSub(cell, id, nowS) {
      const s = subs.get(`${cell}#${id}`);
      return s && s.exp > nowS ? s.sub : null;
    },
  };
}
