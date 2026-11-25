import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * The real command line, end to end, in a temporary directory: the same steps a
 * maintainer and a pharmacist take. Fixtures are invented (a made-up product and label).
 */

const PKG = resolve(__dirname, '..');
const BIN = join(PKG, 'node_modules', '.bin', 'vite-node');
const LABEL =
  'After first use, Zorbex may be kept below 30°C (86°F) for up to 28 days. Do not freeze.';

const roots: string[] = [];
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

function run(root: string, args: string[]) {
  const r = spawnSync(BIN, ['src/cli.ts', '--', ...args], {
    cwd: PKG,
    env: { ...process.env, FORMULARY_ROOT: root },
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'afterglow-fp-cli-'));
  const away = mkdtempSync(join(tmpdir(), 'afterglow-fp-keys-'));
  roots.push(root, away);
  writeFileSync(join(away, 'label.txt'), `HOW SUPPLIED\n${LABEL}\nKeep out of reach of children.`);
  return { root, away, key: join(away, 'review.key') };
}

const proposalJson = (excerpt = LABEL, maxDays = 28) => ({
  id: 'zorbex-in-use',
  sourceId: 'zorbex-label-1',
  proposer: { family: 'Alpha', model: 'alpha-1' },
  proposedAt: '2026-11-02',
  entry: {
    product: 'Zorbex',
    labelVersion: '2026-01',
    condition: 'inUse',
    maxTempC: 30,
    maxDays,
    notes: '',
    source: { title: 'Zorbex invented label', url: 'https://example.test/zorbex', excerpt },
  },
});
const reportJson = (maxDays = 28) => ({
  proposalId: 'zorbex-in-use',
  validator: { family: 'Beta', model: 'beta-1' },
  verdict: 'agree',
  extracted: { condition: 'inUse', maxTempC: 30, maxDays },
  reasons: [],
});

describe('Formulary pipeline command line', () => {
  it('runs source, review, approval, snapshot and verification end to end', () => {
    const { root, away, key } = fixture();
    expect(run(root, ['keygen', '--id', 'review-test', '--out', key]).code).toBe(0);
    expect(existsSync(key)).toBe(true);
    // Only the public half is in the repo.
    expect(readFileSync(join(root, 'anchors.json'), 'utf8')).not.toContain(
      readFileSync(key, 'utf8').trim(),
    );

    expect(
      run(root, [
        'ingest',
        '--id',
        'zorbex-label-1',
        '--product',
        'Zorbex',
        '--label-version',
        '2026-01',
        '--title',
        'Zorbex invented label',
        '--url',
        'https://example.test/zorbex',
        '--file',
        join(away, 'label.txt'),
      ]).code,
    ).toBe(0);

    // The Label Reader agent writes only to proposals/ and the validator to a report file.
    mkdirSync(join(root, 'proposals'), { recursive: true });
    writeFileSync(join(root, 'proposals', 'zorbex-in-use.json'), JSON.stringify(proposalJson()));
    writeFileSync(join(away, 'report.json'), JSON.stringify(reportJson()));
    const review = run(root, ['review', 'zorbex-in-use', '--report', join(away, 'report.json')]);
    expect(review.code).toBe(0);
    expect(review.out).toContain('It is not approved');
    expect(existsSync(join(root, 'validated'))).toBe(false); // review never writes the table

    // Without the explicit confirmation, nothing is approved.
    const noConfirm = run(root, [
      'approve',
      'zorbex-in-use',
      '--approver',
      'A. Pharmacist (test)',
      '--date',
      '2026-11-20',
      '--key',
      key,
      '--key-id',
      'review-test',
    ]);
    expect(noConfirm.code).toBe(1);
    expect(noConfirm.out).toContain('confirm they have read the label');
    expect(existsSync(join(root, 'validated'))).toBe(false);

    const ok = run(root, [
      'approve',
      'zorbex-in-use',
      '--approver',
      'A. Pharmacist (test)',
      '--date',
      '2026-11-20',
      '--i-have-read-the-label',
      '--key',
      key,
      '--key-id',
      'review-test',
    ]);
    expect(ok.code).toBe(0);
    expect(readdirSync(join(root, 'validated'))).toEqual(['zorbex-in-use.json']);
    expect(readFileSync(join(root, 'reviews', 'log.jsonl'), 'utf8')).toContain(
      '"action":"approved"',
    );

    // The queue item is consumed by the approval.
    expect(existsSync(join(root, 'review-queue', 'zorbex-in-use.json'))).toBe(false);

    const snap = run(root, ['snapshot', '--key', key, '--key-id', 'review-test']);
    expect(snap.code).toBe(0);
    expect(snap.out).toContain('Published snapshot 1 with 1 entries');
    expect(readFileSync(join(root, 'docs', 'FORMULARY.md'), 'utf8')).toContain(
      '## Zorbex (in use)',
    );

    const verify = run(root, ['verify']);
    expect(verify.code).toBe(0);
    expect(verify.out).toContain('accepts snapshot 1 with 1 entries');

    // Publishing again raises the version by exactly one.
    expect(run(root, ['snapshot', '--key', key, '--key-id', 'review-test']).out).toContain(
      'snapshot 2',
    );
  }, 120_000);

  it('rejects a proposal whose number is not in the label, and records why', () => {
    const { root, away, key } = fixture();
    run(root, ['keygen', '--id', 'review-test', '--out', key]);
    run(root, [
      'ingest',
      '--id',
      'zorbex-label-1',
      '--product',
      'Zorbex',
      '--label-version',
      '2026-01',
      '--title',
      'Zorbex invented label',
      '--url',
      'https://example.test/zorbex',
      '--file',
      join(away, 'label.txt'),
    ]);
    mkdirSync(join(root, 'proposals'), { recursive: true });
    writeFileSync(
      join(root, 'proposals', 'zorbex-in-use.json'),
      JSON.stringify(proposalJson(LABEL, 90)),
    );
    writeFileSync(join(away, 'report.json'), JSON.stringify(reportJson(90)));
    const r = run(root, ['review', 'zorbex-in-use', '--report', join(away, 'report.json')]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('maxDays 90 is not stated');
    expect(existsSync(join(root, 'review-queue', 'zorbex-in-use.json'))).toBe(false);
    expect(existsSync(join(root, 'rejected', 'zorbex-in-use.json'))).toBe(true);
    expect(readFileSync(join(root, 'reviews', 'log.jsonl'), 'utf8')).toContain(
      '"action":"rejected"',
    );
  }, 120_000);

  it('refuses a private key inside the repository and an unsafe id, and publishes nothing when empty', () => {
    const { root, away } = fixture();
    const inside = run(root, ['keygen', '--id', 'k1', '--out', join(root, 'review.key')]);
    expect(inside.code).toBe(1);
    expect(inside.out).toContain('inside the repository');
    expect(existsSync(join(root, 'review.key'))).toBe(false);

    const bad = run(root, [
      'ingest',
      '--id',
      '../../x',
      '--product',
      'p',
      '--label-version',
      'v',
      '--title',
      't',
      '--url',
      'https://example.test/',
      '--file',
      join(away, 'label.txt'),
    ]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('not safe');

    const key = join(away, 'review.key');
    run(root, ['keygen', '--id', 'k1', '--out', key]);
    const none = run(root, ['snapshot', '--key', key, '--key-id', 'k1']);
    expect(none.code).toBe(1);
    expect(none.out).toContain('nothing to publish');
    expect(existsSync(join(root, 'dist', 'snapshot.json'))).toBe(false);
    expect(run(root, ['verify']).code).toBe(1);
  }, 120_000);

  it('prints usage with no command', () => {
    const out = execFileSync(BIN, ['src/cli.ts', '--'], { cwd: PKG, encoding: 'utf8' });
    expect(out).toContain('afterglow-formulary pipeline');
  });
});
