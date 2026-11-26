import { createHash } from 'node:crypto';
import {
  type AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import type { ConsoleStore, LogEntry, Site } from './handler.js';

/**
 * The public status record's key is owner-scoped (security review 2026-11-26): site
 * ids are chosen by the client, so two accounts may use the same id in one cell. The
 * sort key carries a hash of the owner's sub, and every write and delete is
 * conditional on the stored owner hash, so no account can touch another's record.
 */
const ownerTag = (sub: string): string =>
  createHash('sha256').update(`afterglow-site-owner:${sub}`).digest('base64url').slice(0, 16);

/**
 * Console storage. The business table is keyed by the owner's Cognito `sub`:
 *   site#<siteId>                       the site (name, kind, position, fridges, status)
 *   log#<siteId>#<atMs, padded>#<rand>  a fridge reading or generator event (400 days)
 * Public tables: sites (pk geohash6, sk siteId, the status only, 24 h) and
 * advisories (pk geohash6, sk "<atMs>#<id>", 3 days). Audit entries go under pk "audit".
 */
export function dynamoConsoleStore(
  t: { business: string; sites: string; advisories: string },
  client = new DynamoDBClient({}),
): ConsoleStore {
  const pad = (n: number): string => String(Math.floor(n)).padStart(15, '0');
  return {
    async listSites(owner) {
      const out = await client.send(
        new QueryCommand({
          TableName: t.business,
          KeyConditionExpression: 'pk = :o AND begins_with(sk, :p)',
          ExpressionAttributeValues: { ':o': { S: owner }, ':p': { S: 'site#' } },
        }),
      );
      return (out.Items ?? [])
        .map((it) => JSON.parse(it.data?.S ?? 'null') as Site)
        .filter(Boolean);
    },
    async getSite(owner, siteId) {
      const out = await client.send(
        new GetItemCommand({
          TableName: t.business,
          Key: { pk: { S: owner }, sk: { S: `site#${siteId}` } },
        }),
      );
      return out.Item?.data?.S ? (JSON.parse(out.Item.data.S) as Site) : null;
    },
    async putSite(owner, site) {
      await client.send(
        new PutItemCommand({
          TableName: t.business,
          Item: {
            pk: { S: owner },
            sk: { S: `site#${site.siteId}` },
            data: { S: JSON.stringify(site) },
          },
        }),
      );
    },
    async deleteSite(owner, siteId) {
      await client.send(
        new DeleteItemCommand({
          TableName: t.business,
          Key: { pk: { S: owner }, sk: { S: `site#${siteId}` } },
        }),
      );
    },
    async publishSite(owner, site, expiresAtS) {
      if (!site.status) return;
      const tag = ownerTag(owner);
      const status = {
        siteId: site.siteId,
        name: site.name,
        kind: site.kind,
        open: site.status.open,
        power: site.status.power,
        note: site.status.note,
        lat: site.lat,
        lng: site.lng,
        updatedAtMs: site.status.updatedAtMs,
      };
      await client.send(
        new PutItemCommand({
          TableName: t.sites,
          Item: {
            geohash6: { S: site.geohash6 },
            siteId: { S: `${tag}#${site.siteId}` },
            owner: { S: tag },
            status: { S: JSON.stringify(status) },
            expiresAt: { N: String(expiresAtS) },
          },
          ConditionExpression: 'attribute_not_exists(siteId) OR #o = :o',
          ExpressionAttributeNames: { '#o': 'owner' },
          ExpressionAttributeValues: { ':o': { S: tag } },
        }),
      );
    },
    async unpublishSite(owner, geohash6, siteId) {
      const tag = ownerTag(owner);
      try {
        await client.send(
          new DeleteItemCommand({
            TableName: t.sites,
            Key: { geohash6: { S: geohash6 }, siteId: { S: `${tag}#${siteId}` } },
            ConditionExpression: 'attribute_not_exists(siteId) OR #o = :o',
            ExpressionAttributeNames: { '#o': 'owner' },
            ExpressionAttributeValues: { ':o': { S: tag } },
          }),
        );
      } catch (e) {
        if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
      }
    },
    async appendLog(owner, siteId, entry, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: t.business,
          Item: {
            pk: { S: owner },
            sk: { S: `log#${siteId}#${pad(entry.atMs)}#${Math.random().toString(36).slice(2, 8)}` },
            data: { S: JSON.stringify(entry) },
            expiresAt: { N: String(expiresAtS) },
          },
        }),
      );
    },
    async logSince(owner, siteId, fromMs) {
      const out: LogEntry[] = [];
      let start: Record<string, AttributeValue> | undefined;
      do {
        const page = await client.send(
          new QueryCommand({
            TableName: t.business,
            KeyConditionExpression: 'pk = :o AND sk BETWEEN :a AND :b',
            ExpressionAttributeValues: {
              ':o': { S: owner },
              ':a': { S: `log#${siteId}#${pad(fromMs)}` },
              ':b': { S: `log#${siteId}#~` },
            },
            ExclusiveStartKey: start,
          }),
        );
        for (const it of page.Items ?? [])
          if (it.data?.S) out.push(JSON.parse(it.data.S) as LogEntry);
        start = page.LastEvaluatedKey;
      } while (start && out.length < 10_000);
      return out;
    },
    async putAdvisory(cell, advisory, atMs, id, expiresAtS) {
      await client.send(
        new PutItemCommand({
          TableName: t.advisories,
          Item: {
            geohash6: { S: cell },
            sk: { S: `${pad(atMs)}#${id}` },
            advisory: { S: JSON.stringify(advisory) },
            expiresAt: { N: String(expiresAtS) },
          },
        }),
      );
    },
    async audit(kind, actor, detail, atMs) {
      await client.send(
        new PutItemCommand({
          TableName: t.business,
          Item: {
            pk: { S: 'audit' },
            sk: { S: `${pad(atMs)}#${kind}#${Math.random().toString(36).slice(2, 8)}` },
            data: { S: JSON.stringify({ kind, actor, ...detail, atMs }) },
          },
        }),
      );
    },
  };
}
