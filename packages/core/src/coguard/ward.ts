/**
 * CO Guard (the Ward), CO-01..CO-06. Pure.
 *
 * The ward refuses to bless a generator setup until every check is a current
 * yes. It cannot detect carbon monoxide; it only refuses to say a setup is fine
 * when it has not been told so, and it says so plainly.
 *
 * Sources (checked 2026-11-23): CDC "Preventing Carbon Monoxide Poisoning After
 * an Emergency" (20 feet from any window, door or vent; never in a home,
 * basement or garage); CDC "Carbon Monoxide Poisoning Basics" (symptoms); US
 * CPSC "Carbon Monoxide Information Center" (outside only, 20 feet, exhaust
 * away; never in a garage even with the doors open) and "What to Know:
 * Generators" (get outside, then call the emergency number).
 */
export type CheckId = 'outdoors' | 'distance' | 'exhaust' | 'alarm';
export type Answer = 'yes' | 'no' | 'unknown';

export interface Source {
  readonly title: string;
  readonly url: string;
}

export interface CheckSpec {
  readonly id: CheckId;
  readonly question: string;
  /** What the rule is, in the words of the source. */
  readonly rule: string;
  /** A "no" to a hard rule means the generator must not run there (CO-02). */
  readonly hard: boolean;
  readonly source: Source;
}

const CDC_EMERGENCY: Source = {
  title: 'CDC: Preventing Carbon Monoxide Poisoning After an Emergency',
  url: 'https://tools.cdc.gov/api/v2/resources/media/121883/content.html',
};
const CPSC_CO: Source = {
  title: 'US CPSC: Carbon Monoxide Information Center',
  url: 'https://www.cpsc.gov/Safety-Education/Safety-Education-Centers/Carbon-Monoxide-Information-Center',
};
const CDC_TOOLKIT: Source = {
  title: 'CDC: Prevent Carbon Monoxide Poisoning',
  url: 'https://www.cdc.gov/natural-disasters/psa-toolkit/prevent-carbon-monoxide-poisoning.html',
};

/** Order matters: it is the order the screen asks them in. */
export const CHECKS: readonly CheckSpec[] = [
  {
    id: 'outdoors',
    question: 'Is the generator outside, and not in a garage, shed, porch or basement?',
    rule: 'Use generators outside only. Never inside a home or garage, even with the doors and windows open.',
    hard: true,
    source: CPSC_CO,
  },
  {
    id: 'distance',
    question: 'Is it at least 20 feet (6.1 m) from every window, door and vent?',
    rule: 'Keep a generator at least 20 feet (6.1 m) from any window, door or vent.',
    hard: true,
    source: CDC_EMERGENCY,
  },
  {
    id: 'exhaust',
    question: 'Does the exhaust point away from the home?',
    rule: 'Keep the exhaust facing away from the home.',
    hard: false,
    source: CPSC_CO,
  },
  {
    id: 'alarm',
    question: 'Is there a working carbon monoxide alarm indoors, near where people sleep?',
    rule: 'Always have a working carbon monoxide detector installed.',
    hard: false,
    source: CDC_TOOLKIT,
  },
];

/** CO-03: an answer older than this is not current. An Afterglow rule, not a cited figure. */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const SYMPTOMS: readonly string[] = [
  'headache',
  'dizziness',
  'weakness',
  'upset stomach',
  'vomiting',
  'chest pain',
  'confusion',
];
export const SYMPTOM_SOURCE: Source = {
  title: 'CDC: Carbon Monoxide Poisoning Basics',
  url: 'https://cdc.gov/carbon-monoxide',
};

export const LEAVE_NOW =
  'Get outside into fresh air immediately, then call your local emergency number (for example 112 or 911).';
export const CANNOT_SEE =
  'Carbon monoxide cannot be seen or smelled. Only a working alarm warns you.';

export type CheckStatus =
  /** A current yes. */
  | 'met'
  /** No answer, "unknown", or a stale one: still to do. */
  | 'unmet'
  /** A "no" to a hard rule: the generator must not run like this. */
  | 'refused';

export interface CheckState {
  readonly spec: CheckSpec;
  readonly status: CheckStatus;
  /** Why it is not met, in plain words; empty when met. */
  readonly why: string;
}

export interface WardResult {
  readonly ward: 'open' | 'closed';
  readonly checks: readonly CheckState[];
  readonly unmet: readonly CheckId[];
  /** Plain sentences for each hard "no". */
  readonly refusals: readonly string[];
  /** Present only when a symptom is reported: leave now (CO-04). */
  readonly symptomAdvice: string | null;
  /** Always present: the ward cannot see CO. */
  readonly notice: string;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

function currentAnswer(raw: unknown, nowMs: number): { answer: Answer; stale: boolean } {
  if (!isRecord(raw)) return { answer: 'unknown', stale: false };
  const a = raw.answer;
  const at = raw.atMs;
  if (a !== 'yes' && a !== 'no' && a !== 'unknown') return { answer: 'unknown', stale: false };
  if (typeof at !== 'number' || !Number.isFinite(at)) return { answer: 'unknown', stale: false };
  // CO-03: from the future, or older than the limit, is not current.
  if (at > nowMs || nowMs - at > MAX_AGE_MS) return { answer: 'unknown', stale: true };
  return { answer: a, stale: false };
}

/**
 * Judge the setup (CO-01..CO-06). `answers` is `{ [checkId]: { answer, atMs } }`
 * and is untrusted; anything malformed counts as unknown. Never throws.
 */
export function assessWard(answers: unknown, nowMs: number, symptoms = false): WardResult {
  const src = isRecord(answers) ? answers : {};
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const checks: CheckState[] = CHECKS.map((spec) => {
    const own = Object.prototype.hasOwnProperty.call(src, spec.id) ? src[spec.id] : undefined;
    const { answer, stale } = currentAnswer(own, now);
    if (answer === 'yes') return { spec, status: 'met', why: '' };
    if (answer === 'no') {
      return spec.hard
        ? {
            spec,
            status: 'refused',
            why: `Do not run the generator like this. ${spec.rule}`,
          }
        : { spec, status: 'unmet', why: `Fix this first. ${spec.rule}` };
    }
    return {
      spec,
      status: 'unmet',
      why: stale ? 'This answer is old. Check again now.' : 'Not confirmed yet.',
    };
  });
  const unmet = checks.filter((c) => c.status !== 'met').map((c) => c.spec.id);
  return {
    ward: unmet.length === 0 ? 'open' : 'closed',
    checks,
    unmet,
    refusals: checks.filter((c) => c.status === 'refused').map((c) => c.why),
    symptomAdvice: symptoms === true ? LEAVE_NOW : null,
    notice: CANNOT_SEE,
  };
}
