import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadFormulary } from '@afterglow/adapters';
import { type ReviewLogLine, approve, proposalHash } from './approve.js';
import { renderFormularyDoc } from './docs.js';
import { generateKey, makeSigner, readPrivateKey, writePrivateKey } from './keys.js';
import { checkProposal, parseProposal, parseReport } from './proposal.js';
import { buildSnapshot } from './snapshot.js';
import { makeSource } from './sources.js';
import {
  DIRS,
  appendReviewLog,
  entryFileId,
  loadAnchors,
  loadSource,
  loadValidated,
  previousVersion,
  proposalPath,
  queuePath,
  readJson,
  rejectedPath,
  removeQueued,
  saveAnchors,
  sourcePath,
  validatedPath,
  writeJson,
} from './store.js';

/**
 * The pipeline's command line. A person runs this; an agent never does for `approve`,
 * `snapshot` or `keygen` (the hooks deny writes to `validated/`, and these need a key).
 */

// FORMULARY_ROOT lets tests drive the real command line in a temporary directory.
const ROOT = process.env.FORMULARY_ROOT
  ? resolve(process.env.FORMULARY_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = `afterglow-formulary pipeline

  keygen    --id <keyId> --out <file outside this repo>
  ingest    --id <id> --product <name> --label-version <v> --title <t> --url <https url> --file <label text file>
  review    <proposalId> --report <validator report json>
  approve   <proposalId> --approver <name> --date <YYYY-MM-DD> --i-have-read-the-label
            --key <private key file> --key-id <id> [--supersede]
  snapshot  --key <private key file> --key-id <id>
  verify
  docs
`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const today = (): string => new Date().toISOString().slice(0, 10);

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      out: { type: 'string' },
      product: { type: 'string' },
      'label-version': { type: 'string' },
      title: { type: 'string' },
      url: { type: 'string' },
      file: { type: 'string' },
      report: { type: 'string' },
      approver: { type: 'string' },
      date: { type: 'string' },
      key: { type: 'string' },
      'key-id': { type: 'string' },
      'i-have-read-the-label': { type: 'boolean' },
      supersede: { type: 'boolean' },
    },
  });

  switch (command) {
    case 'keygen': {
      if (!values.id || !values.out) return fail('keygen needs --id and --out.');
      const anchors = loadAnchors(ROOT);
      if (anchors.some((a) => a.keyId === values.id)) return fail('That key id is already pinned.');
      const key = await generateKey(values.id);
      writePrivateKey(resolve(values.out), ROOT, key.privatePkcs8);
      saveAnchors(ROOT, [...anchors, key.anchor]);
      console.log(
        `Wrote the private key to ${values.out} (owner-only). It is not in this repository.`,
      );
      console.log(`Pinned the public key as "${values.id}" in anchors.json.`);
      console.log(
        'Add the same key to TRUST_ANCHORS in apps/mobile/src/data/formulary.ts in a reviewed commit.',
      );
      return;
    }

    case 'ingest': {
      const { id, product, title, url, file } = values;
      const labelVersion = values['label-version'];
      if (!id || !product || !labelVersion || !title || !url || !file) {
        return fail('ingest needs --id --product --label-version --title --url --file.');
      }
      const source = makeSource({
        id,
        product,
        labelVersion,
        title,
        url,
        fetchedAt: new Date().toISOString(),
        text: readFileSync(resolve(file), 'utf8'),
      });
      writeJson(sourcePath(ROOT, id), source, true);
      console.log(`Stored source ${id} (sha256 ${source.sha256.slice(0, 12)}…).`);
      return;
    }

    case 'review': {
      const id = positionals[0];
      if (!id || !values.report) return fail('review needs a proposal id and --report.');
      const proposal = parseProposal(readJson(proposalPath(ROOT, id)));
      if (!proposal.ok) return fail(`Proposal refused: ${proposal.reason}`);
      const report = parseReport(readJson(resolve(values.report)));
      if (!report.ok) return fail(`Report refused: ${report.reason}`);
      const source = loadSource(ROOT, proposal.value.sourceId);
      const result = checkProposal(proposal.value, source, report.value, today());
      const line: Omit<ReviewLogLine, 'action' | 'detail'> = {
        at: new Date().toISOString(),
        proposalId: id,
        product: proposal.value.entry.product,
        proposalSha256: proposalHash(proposal.value),
        approver: 'pipeline',
      };
      if (result.ok) {
        writeJson(queuePath(ROOT, id), {
          proposal: proposal.value,
          report: report.value,
          checkedAt: line.at,
        });
        console.log(`Queued ${id} for a pharmacist. It is not approved.`);
      } else {
        writeJson(rejectedPath(ROOT, id), {
          proposal: proposal.value,
          reasons: result.reasons,
          at: line.at,
        });
        appendReviewLog(ROOT, { ...line, action: 'rejected', detail: result.reasons.join(' | ') });
        console.error(`Rejected ${id}:\n- ${result.reasons.join('\n- ')}`);
        process.exitCode = 1;
      }
      return;
    }

    case 'approve': {
      const id = positionals[0];
      const keyId = values['key-id'];
      if (!id || !values.approver || !values.date || !values.key || !keyId) {
        return fail('approve needs a proposal id, --approver, --date, --key and --key-id.');
      }
      const queued = readJson(queuePath(ROOT, id)) as { proposal: unknown; report: unknown };
      const proposal = parseProposal(queued.proposal);
      const report = parseReport(queued.report);
      if (!proposal.ok || !report.ok) return fail('The queued item is malformed.');
      const sign = await makeSigner(keyId, readPrivateKey(resolve(values.key), ROOT));
      const result = await approve({
        proposal: proposal.value,
        source: loadSource(ROOT, proposal.value.sourceId),
        report: report.value,
        approver: values.approver,
        approvedAt: values.date,
        labelRead: values['i-have-read-the-label'] === true,
        now: new Date(),
        sign,
      });
      if (!result.ok) return fail(`Not approved:\n- ${result.reasons.join('\n- ')}`);
      const path = validatedPath(ROOT, entryFileId(result.entry));
      if (existsSync(path) && !values.supersede) {
        return fail(
          'An entry for this product and condition exists. Pass --supersede to replace it.',
        );
      }
      mkdirSync(join(ROOT, DIRS.validated), { recursive: true });
      writeJson(path, result.entry);
      appendReviewLog(ROOT, result.log);
      removeQueued(ROOT, id);
      console.log(
        `Approved ${result.entry.product} (${result.entry.condition}). Run "snapshot" to publish.`,
      );
      return;
    }

    case 'snapshot': {
      const keyId = values['key-id'];
      if (!values.key || !keyId) return fail('snapshot needs --key and --key-id.');
      const entries = loadValidated(ROOT);
      const sign = await makeSigner(keyId, readPrivateKey(resolve(values.key), ROOT));
      const built = await buildSnapshot({
        entries,
        anchors: loadAnchors(ROOT),
        previousVersion: previousVersion(ROOT),
        sign,
      });
      if (!built.ok) return fail(`Nothing published:\n- ${built.reasons.join('\n- ')}`);
      writeJson(join(ROOT, DIRS.dist, 'snapshot.json'), built.snapshot);
      // FP-10: the documentation is regenerated with every publication, from the entries alone.
      mkdirSync(join(ROOT, DIRS.docs), { recursive: true });
      writeFileSync(
        join(ROOT, DIRS.docs, 'FORMULARY.md'),
        renderFormularyDoc(entries, built.snapshot.formularyVersion),
      );
      console.log(
        `Published snapshot ${built.snapshot.formularyVersion} with ${entries.length} entries.`,
      );
      console.log(
        'Copy dist/snapshot.json to apps/mobile/public/formulary/snapshot.json to ship it.',
      );
      return;
    }

    case 'verify': {
      const path = join(ROOT, DIRS.dist, 'snapshot.json');
      if (!existsSync(path)) return fail('There is no dist/snapshot.json. Nothing is published.');
      const result = await loadFormulary(readJson(path), loadAnchors(ROOT), 0);
      if (result.kind !== 'loaded') return fail(`The app loader refuses it: ${result.kind}.`);
      if (result.formulary.rejected.length > 0) return fail('The app rejected some entries.');
      console.log(
        `The app loader accepts snapshot ${result.version} with ${result.formulary.entries.length} entries.`,
      );
      return;
    }

    case 'docs': {
      const entries = loadValidated(ROOT);
      const text = renderFormularyDoc(entries, String(previousVersion(ROOT)));
      mkdirSync(join(ROOT, DIRS.docs), { recursive: true });
      const out = join(ROOT, DIRS.docs, 'FORMULARY.md');
      writeFileSync(out, text);
      console.log(`Wrote ${out} from ${entries.length} validated entries.`);
      return;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : 'The pipeline failed.');
  process.exit(1);
});
