import raw from './config.json';

/**
 * Where the cloud lives. Filled from `terraform output accounts` after a deploy
 * (`infra/README.md`). None of these values is a secret. While any is missing the
 * app offers no cloud account at all: it fails closed to device-only accounts.
 */

export interface CloudConfig {
  readonly region: string;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly apiUrl: string;
}

export function parseCloudConfig(x: unknown): CloudConfig | null {
  if (typeof x !== 'object' || x === null) return null;
  const o = x as Record<string, unknown>;
  const { region, userPoolId, clientId, apiUrl } = o;
  if (typeof region !== 'string' || !/^[a-z]{2}-[a-z]+-\d$/.test(region)) return null;
  if (typeof userPoolId !== 'string' || !userPoolId.startsWith(`${region}_`)) return null;
  if (typeof clientId !== 'string' || !/^[a-z0-9]{20,40}$/.test(clientId)) return null;
  if (typeof apiUrl !== 'string' || !/^https:\/\/[a-z0-9.-]+$/.test(apiUrl)) return null;
  return { region, userPoolId, clientId, apiUrl };
}

export const cloudConfig: CloudConfig | null = parseCloudConfig(raw);
