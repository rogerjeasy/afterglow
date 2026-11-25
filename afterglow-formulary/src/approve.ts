import { formulary } from '@afterglow/core';
import type { Signer } from './keys.js';
import { type Proposal, type ValidatorReport, checkProposal } from './proposal.js';
import { type Source, sha256Hex } from './sources.js';

/**
 * Approval (FP-05): the only way an entry becomes validated. It re-runs every check, so
 * the queue is not trusted, and it needs a named person, a real date, an explicit "I have
 * read the label" and a signing key.
 */

export interface ApprovalInput {
  readonly proposal: Proposal;
  readonly source: Source;
  readonly report: ValidatorReport;
  readonly approver: string;
  /** `YYYY-MM-DD` or a UTC timestamp; not in the future. */
  readonly approvedAt: string;
  /** The approver confirms they read the label excerpt, not only the numbers. */
  readonly labelRead: boolean;
  readonly now: Date;
  readonly sign: Signer;
}

export type ApprovalResult =
  | { readonly ok: true; readonly entry: formulary.FormularyEntry; readonly log: ReviewLogLine }
  | { readonly ok: false; readonly reasons: readonly string[] };

export interface ReviewLogLine {
  readonly at: string;
  readonly action: 'approved' | 'rejected';
  readonly proposalId: string;
  readonly product: string;
  readonly proposalSha256: string;
  readonly approver: string;
  readonly detail: string;
}

export const proposalHash = (p: Proposal): string => sha256Hex(JSON.stringify(p));

export async function approve(input: ApprovalInput): Promise<ApprovalResult> {
  const reasons: string[] = [];
  const approver = input.approver.trim();
  if (approver === '' || approver.length > 200) reasons.push('A named approver is required.');
  if (input.labelRead !== true) {
    reasons.push('The approver must confirm they have read the label excerpt.');
  }
  const when = formulary.parseApprovedAt(input.approvedAt);
  if (when === null) reasons.push('The approval date is not a real date.');
  else if (when > input.now.getTime()) reasons.push('The approval date is in the future.');

  const today = input.now.toISOString().slice(0, 10);
  const checked = checkProposal(input.proposal, input.source, input.report, today);
  if (!checked.ok) reasons.push(...checked.reasons);
  if (reasons.length > 0 || !checked.ok) return { ok: false, reasons };

  const unsigned = { ...checked.candidate, approver, approvedAt: input.approvedAt };
  const signature = await input.sign(formulary.canonicalPayload(unsigned));
  const entry: formulary.FormularyEntry = { ...unsigned, signature };
  const parsed = formulary.parseEntry(entry);
  if (!parsed.ok)
    return { ok: false, reasons: [`The app would refuse this entry: ${parsed.detail}`] };

  return {
    ok: true,
    entry: parsed.entry,
    log: {
      at: input.now.toISOString(),
      action: 'approved',
      proposalId: input.proposal.id,
      product: entry.product,
      proposalSha256: proposalHash(input.proposal),
      approver,
      detail: `${entry.condition}, up to ${entry.maxTempC} C for ${entry.maxDays} days`,
    },
  };
}
