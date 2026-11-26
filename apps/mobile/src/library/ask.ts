import { type Guide, LIBRARY } from './content';

/**
 * Ask Afterglow, offline (product description 7.18, "AI may ... phrase
 * deterministic lookups with citations"): the question is matched against the
 * library on this phone and answered only with library passages and their sources.
 * Nothing leaves the phone, and a question the library does not cover is said to be
 * outside it, never answered from nowhere.
 */

const STOP = new Set(
  'a an and are as at be by can do does for from how i if in is it its my of on or should the to was what when where which who will with you your me we our there this that'.split(
    ' ',
  ),
);

function terms(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

interface Passage {
  readonly guide: Guide;
  readonly text: string;
  readonly kind: 'step' | 'danger';
  readonly bag: ReadonlySet<string>;
}

const PASSAGES: readonly Passage[] = LIBRARY.flatMap((g) => {
  const shared = terms(`${g.title} ${g.words}`);
  return [
    ...g.steps.map((text) => ({
      guide: g,
      text,
      kind: 'step' as const,
      bag: new Set([...terms(text), ...shared]),
    })),
    ...(g.danger ?? []).map((text) => ({
      guide: g,
      text,
      kind: 'danger' as const,
      bag: new Set([...terms(text), ...shared]),
    })),
  ];
});

/** Each guide's own title and keywords. */
const HEAD = new Map(LIBRARY.map((g) => [g.id, new Set(terms(`${g.title} ${g.words}`))]));

/** How rare each term is across the library: rarer words count for more. */
const IDF = (() => {
  const df = new Map<string, number>();
  for (const p of PASSAGES) for (const t of p.bag) df.set(t, (df.get(t) ?? 0) + 1);
  const n = PASSAGES.length;
  return new Map([...df].map(([t, d]) => [t, Math.log(1 + n / d)]));
})();

export interface Answer {
  readonly kind: 'answer';
  readonly guide: Guide;
  readonly passages: readonly { readonly text: string; readonly kind: 'step' | 'danger' }[];
}
export type AskResult =
  | Answer
  | { readonly kind: 'outside'; readonly suggestions: readonly Guide[] };

/** The best guide for the question, with its most relevant passages, or "outside the library". */
export function ask(question: string): AskResult {
  const q = terms(question);
  if (q.length === 0) return { kind: 'outside', suggestions: LIBRARY.slice(0, 3) };
  const scored = PASSAGES.map((p) => ({
    p,
    score: q.reduce((s, t) => s + (p.bag.has(t) ? (IDF.get(t) ?? 0) : 0), 0),
  })).filter((x) => x.score > 0);
  if (scored.length === 0) return { kind: 'outside', suggestions: LIBRARY.slice(0, 3) };
  // The guide whose passages match best overall answers; its top passages are quoted.
  // A guide's score is its best passage, plus a bonus for words in its own title and
  // keywords, so a guide that mentions "water" in passing does not outrank the water guide.
  const byGuide = new Map<string, number>();
  for (const x of scored) {
    byGuide.set(x.p.guide.id, Math.max(byGuide.get(x.p.guide.id) ?? 0, x.score));
  }
  for (const [id, score] of byGuide) {
    const own = HEAD.get(id);
    const bonus = q.reduce((s, t) => s + (own?.has(t) ? (IDF.get(t) ?? 0) : 0), 0);
    byGuide.set(id, score + bonus);
  }
  const best = [...byGuide].sort((a, b) => b[1] - a[1])[0]?.[0];
  const guide = LIBRARY.find((g) => g.id === best);
  if (!guide) return { kind: 'outside', suggestions: LIBRARY.slice(0, 3) };
  const top = scored
    .filter((x) => x.p.guide.id === guide.id)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.p);
  // Danger signs of the chosen guide are always included: they are the point.
  const danger = PASSAGES.filter((p) => p.guide.id === guide.id && p.kind === 'danger');
  const passages = [...new Set([...top, ...danger])].map((p) => ({ text: p.text, kind: p.kind }));
  return { kind: 'answer', guide, passages };
}
