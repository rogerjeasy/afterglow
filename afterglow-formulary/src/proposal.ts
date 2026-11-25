import { formulary } from '@afterglow/core';
import { checkNumbers, normaliseText } from './numbers.js';
import { isSafeId } from './safe.js';
import { type Source, sourceIsIntact } from './sources.js';

/**
 * Proposals and the checks every one must pass (FP-01 to FP-04).
 *
 * A proposal is what the Label Reader agent (AI, family A) writes; a report is what
 * the Pharmacist Validator agent (AI, a different family) writes. Neither is trusted:
 * this module re-derives every claim from the stored source text. Passing these checks
 * makes a proposal eligible for a pharmacist. It does not make it approved.
 */

export interface ModelRef {
  /** The model family, for example the vendor. The proposer and validator must differ. */
  readonly family: string;
  readonly model: string;
}

export interface ProposalEntry {
  readonly product: string;
  readonly labelVersion: string;
  readonly condition: formulary.Condition;
  readonly maxTempC: number;
  readonly maxDays: number;
  readonly notes: string;
  readonly source: formulary.LabelSource;
}

export interface Proposal {
  readonly id: string;
  readonly sourceId: string;
  readonly proposer: ModelRef;
  readonly proposedAt: string;
  readonly entry: ProposalEntry;
}

export interface ValidatorReport {
  readonly proposalId: string;
  readonly validator: ModelRef;
  readonly verdict: 'agree' | 'disagree';
  readonly extracted: {
    readonly condition: formulary.Condition;
    readonly maxTempC: number;
    readonly maxDays: number;
  };
  readonly reasons: readonly string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const exact = (o: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(o).length === keys.length && keys.every((k) => Object.hasOwn(o, k));
const str = (v: unknown, max = 5000): v is string => typeof v === 'string' && v.length <= max;

function parseModel(v: unknown): ModelRef | null {
  if (!isObj(v) || !exact(v, ['family', 'model'])) return null;
  return str(v.family, 100) && v.family.trim() !== '' && str(v.model, 100) && v.model.trim() !== ''
    ? { family: v.family, model: v.model }
    : null;
}

export type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function parseProposal(raw: unknown): Parsed<Proposal> {
  const bad = (reason: string): Parsed<Proposal> => ({ ok: false, reason });
  if (!isObj(raw) || !exact(raw, ['id', 'sourceId', 'proposer', 'proposedAt', 'entry'])) {
    return bad('A proposal must have exactly: id, sourceId, proposer, proposedAt, entry.');
  }
  if (!isSafeId(raw.id)) return bad('The proposal id is not safe.');
  if (!isSafeId(raw.sourceId)) return bad('The source id is not safe.');
  const proposer = parseModel(raw.proposer);
  if (!proposer) return bad('The proposer must name a family and a model.');
  if (!str(raw.proposedAt, 40) || formulary.parseApprovedAt(raw.proposedAt) === null) {
    return bad('proposedAt is not a real date.');
  }
  const e = raw.entry;
  if (
    !isObj(e) ||
    !exact(e, ['product', 'labelVersion', 'condition', 'maxTempC', 'maxDays', 'notes', 'source'])
  ) {
    return bad('The entry fields are not exactly the proposal shape.');
  }
  const s = e.source;
  if (!isObj(s) || !exact(s, ['title', 'url', 'excerpt']))
    return bad('The entry source is invalid.');
  if (e.condition !== 'unopened' && e.condition !== 'inUse')
    return bad('The condition is invalid.');
  if (typeof e.maxTempC !== 'number' || typeof e.maxDays !== 'number') {
    return bad('maxTempC and maxDays must be numbers.');
  }
  if (!str(e.product, 200) || !str(e.labelVersion, 200) || !str(e.notes, 2000)) {
    return bad('A text field is invalid.');
  }
  if (!str(s.title, 200) || !str(s.url, 2000) || !str(s.excerpt, 5000)) {
    return bad('A source field is invalid.');
  }
  return {
    ok: true,
    value: {
      id: raw.id,
      sourceId: raw.sourceId,
      proposer,
      proposedAt: raw.proposedAt,
      entry: {
        product: e.product,
        labelVersion: e.labelVersion,
        condition: e.condition,
        maxTempC: e.maxTempC,
        maxDays: e.maxDays,
        notes: e.notes,
        source: { title: s.title, url: s.url, excerpt: s.excerpt },
      },
    },
  };
}

export function parseReport(raw: unknown): Parsed<ValidatorReport> {
  const bad = (reason: string): Parsed<ValidatorReport> => ({ ok: false, reason });
  if (!isObj(raw) || !exact(raw, ['proposalId', 'validator', 'verdict', 'extracted', 'reasons'])) {
    return bad('A report must have exactly: proposalId, validator, verdict, extracted, reasons.');
  }
  if (!isSafeId(raw.proposalId)) return bad('The proposal id is not safe.');
  const validator = parseModel(raw.validator);
  if (!validator) return bad('The validator must name a family and a model.');
  if (raw.verdict !== 'agree' && raw.verdict !== 'disagree') return bad('The verdict is invalid.');
  const x = raw.extracted;
  if (!isObj(x) || !exact(x, ['condition', 'maxTempC', 'maxDays'])) {
    return bad('The extracted figures are invalid.');
  }
  if (x.condition !== 'unopened' && x.condition !== 'inUse')
    return bad('The condition is invalid.');
  if (typeof x.maxTempC !== 'number' || typeof x.maxDays !== 'number') {
    return bad('Extracted figures must be numbers.');
  }
  if (!Array.isArray(raw.reasons) || !raw.reasons.every((r) => str(r, 1000))) {
    return bad('The reasons must be a list of text.');
  }
  return {
    ok: true,
    value: {
      proposalId: raw.proposalId,
      validator,
      verdict: raw.verdict,
      extracted: { condition: x.condition, maxTempC: x.maxTempC, maxDays: x.maxDays },
      reasons: raw.reasons as string[],
    },
  };
}

/** What a proposal becomes before anyone has approved or signed it. */
export type Candidate = ProposalEntry;

export type CheckResult =
  | { readonly ok: true; readonly candidate: Candidate }
  | { readonly ok: false; readonly reasons: readonly string[] };

const MIN_EXCERPT = 20;
const lower = (s: string): string => s.trim().toLowerCase();

/**
 * Every check, with every reason (so a pharmacist sees all of them, not the first).
 * Run at ingestion and again at approval: the queue is never trusted.
 */
export function checkProposal(
  proposal: Proposal,
  source: Source,
  report: ValidatorReport | null,
  today: string,
): CheckResult {
  const reasons: string[] = [];
  const e = proposal.entry;

  // FP-09: the source is the one that was stored.
  if (!sourceIsIntact(source)) reasons.push('The stored source no longer matches its hash.');
  if (proposal.sourceId !== source.id) reasons.push('The proposal names a different source.');

  // FP-04: it is about this source.
  if (e.product !== source.product) reasons.push('The product differs from the source.');
  if (e.labelVersion !== source.labelVersion)
    reasons.push('The label version differs from the source.');
  if (e.source.title !== source.title) reasons.push('The source title differs from the source.');
  if (e.source.url !== source.url) reasons.push('The source URL differs from the source.');

  // FP-01: the excerpt is the label's own words.
  const excerpt = normaliseText(e.source.excerpt);
  if (excerpt.length < MIN_EXCERPT)
    reasons.push('The excerpt is too short to be a label statement.');
  else if (!normaliseText(source.text).includes(excerpt)) {
    reasons.push('The excerpt does not appear word for word in the source text.');
  }

  // FP-02: every number is in the excerpt.
  reasons.push(...checkNumbers(e).reasons);

  // FP-03: a different family checked it, and they agree.
  if (report === null) reasons.push('There is no validator report.');
  else {
    if (report.proposalId !== proposal.id)
      reasons.push('The validator report is for another proposal.');
    if (lower(report.validator.family) === lower(proposal.proposer.family)) {
      reasons.push('The validator is from the same model family as the proposer.');
    }
    if (lower(report.validator.model) === lower(proposal.proposer.model)) {
      reasons.push('The validator is the same model as the proposer.');
    }
    if (report.verdict !== 'agree') reasons.push('The validator does not agree.');
    if (report.extracted.condition !== e.condition)
      reasons.push('The validator read a different condition.');
    if (report.extracted.maxTempC !== e.maxTempC)
      reasons.push('The validator read a different temperature.');
    if (report.extracted.maxDays !== e.maxDays)
      reasons.push('The validator read a different number of days.');
  }

  // FP-04: the app itself would accept this entry (with the placeholders approval fills in).
  const asEntry = {
    ...e,
    approver: 'pending review',
    approvedAt: today,
    signature: 'pending.unsigned',
  };
  const parsed = formulary.parseEntry(asEntry);
  if (!parsed.ok) reasons.push(`The app would refuse this entry: ${parsed.detail}`);

  return reasons.length === 0 ? { ok: true, candidate: e } : { ok: false, reasons };
}
