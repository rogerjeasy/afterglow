/**
 * Number checks (FP-02). A figure is accepted only when the label excerpt says it, so a
 * model can never introduce a number. Fail closed: wording this cannot read (number
 * words, months, ranges it cannot place) is rejected and left to the pharmacist.
 */

/** Unicode-normalise and unify degree and spacing marks so label typography matches. */
export function normaliseText(s: string): string {
  return (
    s
      // Labels print the degree sign as a masculine ordinal (U+00BA) or a ring; NFKC would turn
      // U+00BA into the letter "o" and lose the unit, so these are replaced first.
      .replace(/[\u00ba\u02da\u2218]/g, '\u00b0')
      .normalize('NFKC')
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Every temperature the excerpt states, in degrees Celsius (Fahrenheit converted, to 0.1). */
export function temperaturesC(excerpt: string): number[] {
  const t = normaliseText(excerpt);
  const out: number[] = [];
  const add = (value: string, unit: string): void => {
    const v = Number(value);
    if (!Number.isFinite(v)) return;
    out.push(/^f/i.test(unit) ? round1(((v - 32) * 5) / 9) : round1(v));
  };
  for (const m of t.matchAll(/(-?\d+(?:\.\d+)?)\s*\u00b0\s*(C|F)\b/g))
    add(m[1] as string, m[2] as string);
  for (const m of t.matchAll(/(-?\d+(?:\.\d+)?)\s*degrees?\s*(Celsius|Fahrenheit|C|F)\b/gi)) {
    add(m[1] as string, m[2] as string);
  }
  return out;
}

/** Every duration the excerpt states, in days (weeks times 7). Months are not read. */
export function durationsDays(excerpt: string): number[] {
  const t = normaliseText(excerpt);
  const out: number[] = [];
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*-?\s*days?\b/gi)) out.push(Number(m[1]));
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*-?\s*weeks?\b/gi)) out.push(Number(m[1]) * 7);
  return out;
}

/** Every digit run in a text, as written (so "2" in "2 to 8" counts, and "25" is not "2" and "5"). */
export function numberTokens(text: string): string[] {
  return [...normaliseText(text).matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]);
}

export interface NumberCheck {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

export function checkNumbers(entry: {
  readonly maxTempC: number;
  readonly maxDays: number;
  readonly notes: string;
  readonly source: { readonly excerpt: string };
}): NumberCheck {
  const reasons: string[] = [];
  const temps = temperaturesC(entry.source.excerpt);
  if (!temps.some((c) => Math.abs(c - entry.maxTempC) < 0.05)) {
    reasons.push(
      `maxTempC ${entry.maxTempC} is not stated in the excerpt in degrees Celsius or Fahrenheit.`,
    );
  }
  const days = durationsDays(entry.source.excerpt);
  if (!days.some((d) => Math.abs(d - entry.maxDays) < 1e-9)) {
    reasons.push(`maxDays ${entry.maxDays} is not stated in the excerpt in days or weeks.`);
  }
  const known = new Set(numberTokens(entry.source.excerpt));
  for (const token of numberTokens(entry.notes)) {
    if (!known.has(token)) {
      reasons.push(`The notes contain the number ${token}, which the excerpt does not.`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}
