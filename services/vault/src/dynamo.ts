import {
  ConditionalCheckFailedException,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
} from '@aws-sdk/client-dynamodb';
import type { Caller, PutResult, Revocation, StoredVault, VaultStore } from './handler.js';

/**
 * The vault table (infra `regional`, table `vault`): hash key `accountId` (the
 * Cognito sub), range key `record`: "vault" for the encrypted record, "revocation"
 * for the account's not-before time (CA-13; a sub and two values, nothing else,
 * kept after deletion). Every write is a transaction that checks the caller against
 * the revocation in the same step (CA-13) and is conditional on the version (CA-04).
 */

const RECORD = 'vault';
const REVOCATION = 'revocation';

/** The caller may act: no revocation, a later token, or the revoking session in the boundary second. */
const ALLOWED =
  'attribute_not_exists(notBefore) OR notBefore < :iat OR (notBefore = :iat AND exceptOrigin = :origin AND exceptOrigin <> :empty)';
const allowedValues = (c: Caller) => ({
  ':iat': { N: String(c.iat) },
  ':origin': { S: c.origin },
  ':empty': { S: '' },
});

const reasonAt = (e: TransactionCanceledException, i: number) => e.CancellationReasons?.[i];

export function dynamoStore(tableName: string, client = new DynamoDBClient({})): VaultStore {
  const key = (accountId: string, record: string) => ({
    accountId: { S: accountId },
    record: { S: record },
  });

  return {
    async get(accountId): Promise<StoredVault | null> {
      const out = await client.send(
        new GetItemCommand({
          TableName: tableName,
          Key: key(accountId, RECORD),
          ConsistentRead: true,
        }),
      );
      const item = out.Item;
      if (!item?.body?.S || !item.version?.N || !item.updatedAt?.N) return null;
      return {
        record: item.body.S,
        version: Number(item.version.N),
        updatedAt: Number(item.updatedAt.N),
      };
    },

    async getRevocation(accountId): Promise<Revocation | null> {
      const out = await client.send(
        new GetItemCommand({
          TableName: tableName,
          Key: key(accountId, REVOCATION),
          ConsistentRead: true,
        }),
      );
      const n = out.Item?.notBefore?.N;
      if (n === undefined) return null;
      return { notBefore: Number(n), exceptOrigin: out.Item?.exceptOrigin?.S ?? '' };
    },

    async put(accountId, record, expected, now, caller): Promise<PutResult> {
      const version = (expected ?? 0) + 1;
      try {
        await client.send(
          new TransactWriteItemsCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: tableName,
                  Key: key(accountId, REVOCATION),
                  ConditionExpression: ALLOWED,
                  ExpressionAttributeValues: allowedValues(caller),
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...key(accountId, RECORD),
                    body: { S: record },
                    version: { N: String(version) },
                    updatedAt: { N: String(now) },
                  },
                  ...(expected === null
                    ? { ConditionExpression: 'attribute_not_exists(accountId)' }
                    : {
                        ConditionExpression: 'version = :expected',
                        ExpressionAttributeValues: { ':expected': { N: String(expected) } },
                      }),
                  ReturnValuesOnConditionCheckFailure: 'ALL_OLD',
                },
              },
            ],
          }),
        );
        return { kind: 'stored', version };
      } catch (e) {
        if (e instanceof TransactionCanceledException) {
          if (reasonAt(e, 0)?.Code === 'ConditionalCheckFailed') return { kind: 'revoked' };
          const second = reasonAt(e, 1);
          if (second?.Code === 'ConditionalCheckFailed') {
            const n = second.Item?.version?.N;
            return { kind: 'conflict', current: n === undefined ? null : Number(n) };
          }
        }
        throw e;
      }
    },

    async delete(accountId, caller, nowSeconds): Promise<'deleted' | 'revoked'> {
      try {
        await client.send(
          new TransactWriteItemsCommand({
            TransactItems: [
              {
                // Raise the not-before past every existing token, only if this caller may.
                Put: {
                  TableName: tableName,
                  Item: {
                    ...key(accountId, REVOCATION),
                    notBefore: { N: String(nowSeconds + 1) },
                    exceptOrigin: { S: '' },
                  },
                  ConditionExpression: ALLOWED,
                  ExpressionAttributeValues: allowedValues(caller),
                },
              },
              { Delete: { TableName: tableName, Key: key(accountId, RECORD) } },
            ],
          }),
        );
        return 'deleted';
      } catch (e) {
        if (
          e instanceof TransactionCanceledException &&
          reasonAt(e, 0)?.Code === 'ConditionalCheckFailed'
        ) {
          return 'revoked';
        }
        throw e;
      }
    },

    async revoke(accountId, caller): Promise<'done' | 'revoked'> {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              ...key(accountId, REVOCATION),
              notBefore: { N: String(caller.iat) },
              exceptOrigin: { S: caller.origin },
            },
            // Allowed implies notBefore <= iat, so the time never moves backwards.
            ConditionExpression: ALLOWED,
            ExpressionAttributeValues: allowedValues(caller),
          }),
        );
        return 'done';
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return 'revoked';
        throw e;
      }
    },
  };
}
