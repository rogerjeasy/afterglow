import type { cells } from '@afterglow/core';
import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Storage for the public API (crowd-reports spec). Three tables, each with a TTL:
 *  - reports: pk geohash6, sk "<minute>#<deviceId>", the whitelisted report only, 2 h;
 *  - device:  pk deviceId, the day's public key, 2 days;
 *  - cache:   pk key, cached public data (places, weather) with its own lifetime.
 * Readers also ignore anything past its expiry, because DynamoDB's TTL deletes lazily.
 */

export interface CrowdStore {
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
}

const pad = (n: number): string => String(n).padStart(10, '0');

export function dynamoCrowdStore(
  tables: { reports: string; device: string; cache: string },
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
