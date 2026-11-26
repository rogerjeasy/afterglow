import {
  ConditionalCheckFailedException,
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { PutResult, StoredVault, VaultStore } from './handler.js';

/**
 * The vault table (infra `regional`, table `vault`): hash key `accountId` (the
 * Cognito sub), range key `record` (always "vault" here). Writes are conditional
 * on the version, so two devices can never overwrite each other blindly (CA-04).
 */

const RECORD = 'vault';

export function dynamoStore(tableName: string, client = new DynamoDBClient({})): VaultStore {
  const key = (accountId: string) => ({ accountId: { S: accountId }, record: { S: RECORD } });
  return {
    async get(accountId): Promise<StoredVault | null> {
      const out = await client.send(
        new GetItemCommand({ TableName: tableName, Key: key(accountId), ConsistentRead: true }),
      );
      const item = out.Item;
      if (!item?.body?.S || !item.version?.N || !item.updatedAt?.N) return null;
      return {
        record: item.body.S,
        version: Number(item.version.N),
        updatedAt: Number(item.updatedAt.N),
      };
    },

    async put(accountId, record, expected, now): Promise<PutResult> {
      const version = (expected ?? 0) + 1;
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              ...key(accountId),
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
          }),
        );
        return { ok: true, version };
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) {
          const n = e.Item?.version?.N;
          return { ok: false, current: n === undefined ? null : Number(n) };
        }
        throw e;
      }
    },

    async delete(accountId): Promise<void> {
      await client.send(new DeleteItemCommand({ TableName: tableName, Key: key(accountId) }));
    },
  };
}
