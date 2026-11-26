import type { cells } from '@afterglow/core';
import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Storage for the public API (crowd-reports spec). Three tables, each with a TTL:
 *  - reports: pk geohash6, sk "<minute>#<deviceId>", the whitelisted report only, 2 h;
 *  - device:  pk deviceId, the day's public key, 2 days;
 *  - cache:   pk key, cached public data (places, weather) with its own lifetime;
 *  - push:    pk geohash6, sk subscription id, a push subscription following that cell, 30 days.
 * Readers also ignore anything past its expiry, because DynamoDB's TTL deletes lazily.
 */

/** A public advisory for a cell, published from Beacon. */
export interface Advisory {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly from: string;
  readonly atMs: number;
}
/** A business's public status in a cell: open, and how it is powered. */
export interface SiteStatus {
  readonly siteId: string;
  readonly name: string;
  readonly kind: string;
  readonly open: boolean;
  readonly power: 'mains' | 'backup' | 'none';
  readonly note: string;
  readonly lat: number;
  readonly lng: number;
  readonly updatedAtMs: number;
}

export interface CrowdStore {
  /** Cell history: the published state of one 5-minute window (kept 30 days). */
  putWindow(
    cell: string,
    windowStart: number,
    state: string,
    deviceCount: number,
    expiresAtS: number,
  ): Promise<void>;
  windowsSince(
    cell: string,
    fromMinute: number,
    nowS: number,
  ): Promise<import('./history.js').Window[]>;
  advisoriesFor(cell: string, nowS: number): Promise<Advisory[]>;
  sitesIn(cell: string, nowS: number): Promise<SiteStatus[]>;
  putDevice(deviceId: string, publicKeyJwk: string, expiresAtS: number): Promise<void>;
  getDevice(deviceId: string, nowS: number): Promise<string | null>;
  /** False when this device already reported for this cell and minute (deduplicated). */
  putReport(report: cells.CellReport, expiresAtS: number): Promise<boolean>;
  reportsSince(geohash6: string, fromMinute: number, nowS: number): Promise<cells.CellReport[]>;
  getCache(key: string, nowS: number): Promise<string | null>;
  putCache(key: string, value: string, expiresAtS: number): Promise<void>;
  /**
   * Create the key only if it is absent or expired; false when someone holds it. The
   * building block for the rate limits and slots below (one conditional PutItem).
   */
  claim(key: string, value: string, expiresAtS: number, nowS: number): Promise<boolean>;
  /** Push subscriptions, stored under each followed cell. */
  putSub(cell: string, id: string, sub: string, expiresAtS: number): Promise<void>;
  deleteSub(cell: string, id: string): Promise<void>;
  /** One page of a cell's live subscriptions, and where the next page starts. */
  subsPage(
    cell: string,
    nowS: number,
    cursor: string | null,
    limit: number,
  ): Promise<{ subs: { id: string; sub: string }[]; next: string | null }>;
  /** The stored subscription for this cell and id, if it has not expired. */
  getSub(cell: string, id: string, nowS: number): Promise<string | null>;
}

const pad = (n: number): string => String(n).padStart(10, '0');

export function dynamoCrowdStore(
  tables: {
    reports: string;
    device: string;
    cache: string;
    push: string;
    history: string;
    advisories: string;
    sites: string;
  },
  client = new DynamoDBClient({}),
): CrowdStore {
  return {
    async putDevice(deviceId, jwk, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: tables.device,
          Item: {
            deviceId: { S: deviceId },
            publicKey: { S: jwk },
            expiresAt: { N: String(expiresAtS) },
          },
        }),
      );
    },

    async getDevice(deviceId, nowS) {
      const out = await client.send(
        new GetItemCommand({ TableName: tables.device, Key: { deviceId: { S: deviceId } } }),
      );
      const exp = Number(out.Item?.expiresAt?.N ?? 0);
      if (!out.Item?.publicKey?.S || exp <= nowS) return null;
      return out.Item.publicKey.S;
    },

    async putReport(r, expiresAtS) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tables.reports,
            Item: {
              geohash6: { S: r.geohash6 },
              sk: { S: `${pad(r.minute)}#${r.deviceEpoch}` },
              report: { S: JSON.stringify(r) },
              expiresAt: { N: String(expiresAtS) },
            },
            ConditionExpression: 'attribute_not_exists(sk)',
          }),
        );
        return true;
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return false;
        throw e;
      }
    },

    async reportsSince(geohash6, fromMinute, nowS) {
      const out: cells.CellReport[] = [];
      let start: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: tables.reports,
            KeyConditionExpression: 'geohash6 = :g AND sk >= :from',
            ExpressionAttributeValues: { ':g': { S: geohash6 }, ':from': { S: pad(fromMinute) } },
            ...(start ? { ExclusiveStartKey: start } : {}),
          }),
        );
        for (const item of page.Items ?? []) {
          if (Number(item.expiresAt?.N ?? 0) <= nowS || !item.report?.S) continue;
          try {
            out.push(JSON.parse(item.report.S) as cells.CellReport);
          } catch {
            // a malformed stored item is skipped, never trusted
          }
        }
        start = page.LastEvaluatedKey;
      } while (start && out.length < 5000);
      return out;
    },

    async getCache(key, nowS) {
      const out = await client.send(
        new GetItemCommand({ TableName: tables.cache, Key: { key: { S: key } } }),
      );
      if (!out.Item?.value?.S || Number(out.Item.expiresAt?.N ?? 0) <= nowS) return null;
      return out.Item.value.S;
    },

    async putCache(key, value, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: tables.cache,
          Item: { key: { S: key }, value: { S: value }, expiresAt: { N: String(expiresAtS) } },
        }),
      );
    },

    async putSub(cell, id, sub, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: tables.push,
          Item: {
            geohash6: { S: cell },
            sk: { S: id },
            sub: { S: sub },
            expiresAt: { N: String(expiresAtS) },
          },
        }),
      );
    },

    async deleteSub(cell, id) {
      await client.send(
        new DeleteItemCommand({
          TableName: tables.push,
          Key: { geohash6: { S: cell }, sk: { S: id } },
        }),
      );
    },

    async subsPage(cell, nowS, cursor, limit) {
      const page = await client.send(
        new QueryCommand({
          TableName: tables.push,
          KeyConditionExpression: 'geohash6 = :g',
          ExpressionAttributeValues: { ':g': { S: cell } },
          Limit: limit,
          ExclusiveStartKey: cursor ? { geohash6: { S: cell }, sk: { S: cursor } } : undefined,
        }),
      );
      const subs: { id: string; sub: string }[] = [];
      for (const it of page.Items ?? []) {
        if (Number(it.expiresAt?.N ?? 0) <= nowS) continue;
        if (it.sk?.S && it.sub?.S) subs.push({ id: it.sk.S, sub: it.sub.S });
      }
      return { subs, next: page.LastEvaluatedKey?.sk?.S ?? null };
    },

    async putWindow(cell, windowStart, state, deviceCount, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: tables.history,
          Item: {
            geohash6: { S: cell },
            windowStart: { N: String(windowStart) },
            state: { S: state },
            deviceCount: { N: String(deviceCount) },
            expiresAt: { N: String(expiresAtS) },
          },
        }),
      );
    },

    async windowsSince(cell, fromMinute, nowS) {
      const out: import('./history.js').Window[] = [];
      let start: Record<string, import('@aws-sdk/client-dynamodb').AttributeValue> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: tables.history,
            KeyConditionExpression: 'geohash6 = :g AND windowStart >= :from',
            ExpressionAttributeValues: { ':g': { S: cell }, ':from': { N: String(fromMinute) } },
            ExclusiveStartKey: start,
          }),
        );
        for (const it of page.Items ?? []) {
          if (Number(it.expiresAt?.N ?? 0) <= nowS) continue;
          const st = it.state?.S;
          if (st !== 'dark' && st !== 'lit' && st !== 'mixed' && st !== 'comingBack') continue;
          out.push({
            windowStart: Number(it.windowStart?.N),
            state: st,
            deviceCount: Number(it.deviceCount?.N ?? 0),
          });
        }
        start = page.LastEvaluatedKey;
      } while (start && out.length < 20_000);
      return out;
    },

    async advisoriesFor(cell, nowS) {
      const page = await client.send(
        new QueryCommand({
          TableName: tables.advisories,
          KeyConditionExpression: 'geohash6 = :g',
          ExpressionAttributeValues: { ':g': { S: cell } },
          ScanIndexForward: false,
          Limit: 10,
        }),
      );
      return (page.Items ?? [])
        .filter((it) => Number(it.expiresAt?.N ?? 0) > nowS && it.advisory?.S)
        .map((it) => JSON.parse(it.advisory?.S as string) as Advisory);
    },

    async sitesIn(cell, nowS) {
      const page = await client.send(
        new QueryCommand({
          TableName: tables.sites,
          KeyConditionExpression: 'geohash6 = :g',
          ExpressionAttributeValues: { ':g': { S: cell } },
          Limit: 100,
        }),
      );
      return (page.Items ?? [])
        .filter((it) => Number(it.expiresAt?.N ?? 0) > nowS && it.status?.S)
        .map((it) => JSON.parse(it.status?.S as string) as SiteStatus);
    },

    async getSub(cell, id, nowS) {
      const out = await client.send(
        new QueryCommand({
          TableName: tables.push,
          KeyConditionExpression: 'geohash6 = :g AND sk = :id',
          ExpressionAttributeValues: { ':g': { S: cell }, ':id': { S: id } },
        }),
      );
      const it = (out.Items ?? []).find((x) => Number(x.expiresAt?.N ?? 0) > nowS);
      return it?.sub?.S ?? null;
    },

    async claim(key, value, expiresAtS, nowS) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tables.cache,
            Item: { key: { S: key }, value: { S: value }, expiresAt: { N: String(expiresAtS) } },
            ConditionExpression: 'attribute_not_exists(#k) OR expiresAt <= :now',
            ExpressionAttributeNames: { '#k': 'key' },
            ExpressionAttributeValues: { ':now': { N: String(nowS) } },
          }),
        );
        return true;
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return false;
        throw e;
      }
    },
  };
}
