import { readFileSync } from 'node:fs';
import type { cells } from '@afterglow/core';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { handlePublic } from './handler.js';
import { memoryCrowdStore } from './testing.js';
import {
  type AreaLookup,
  type AreaStatus,
  SMS_BUDGET,
  USSD_BUDGET,
  fit,
  smsReply,
  twiml,
  ussdReply,
} from './voice.js';

/**
 * Afterglow Voice (.kiro/specs/voice): every USSD screen and SMS reply fits its budget,
 * answers only from the published crowd state, and never says anything about the caller.
 */

const NOW_MS = Date.UTC(2026, 10, 27, 12, 0, 0);
const NOW_MIN = Math.floor(NOW_MS / 60_000);
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'.split('');
const cellArb = fc.stringOf(fc.constantFrom(...BASE32), { minLength: 6, maxLength: 6 });
const AREA_RE = /^[0-9b-hjkmnp-z]{6}$/;

/** GSM 03.38: the basic table (one septet) and the extension table (two). */
const GSM_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
);
const GSM_EXT = new Set('^{}\\[~]|€');
/** Septets in one GSM-7 text, or null when a character forces UCS-2 (a 70-character SMS). */
function gsmSeptets(s: string): number | null {
  let n = 0;
  for (const ch of s) {
    if (GSM_BASIC.has(ch)) n += 1;
    else if (GSM_EXT.has(ch)) n += 2;
    else return null;
  }
  return n;
}
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

const statusArb: fc.Arbitrary<AreaStatus | null> = fc.option(
  fc.record({
    state: fc.constantFrom('dark', 'lit', 'mixed', 'comingBack', 'unknown') as fc.Arbitrary<
      AreaStatus['state']
    >,
    deviceCount: fc.integer({ min: 5, max: 1_000_000 }),
  }),
  { nil: null },
);
const lookupOf =
  (s: AreaStatus | null): AreaLookup =>
  async () =>
    s;

/** Inputs a caller might type: menu digits, area codes, keywords in any case, or anything. */
const ussdTextArb = fc.oneof(
  fc.constant(''),
  fc.constantFrom('1', '2', '3', '4', '5', '6', '0', '*', '**', '1*', ' 1 '),
  cellArb.map((c) => `1*${c}`),
  cellArb.map((c) => `1*${c.toUpperCase()}`),
  fc.string().map((s) => `1*${s}`),
  fc.string(),
  fc.fullUnicodeString({ maxLength: 64 }),
);
const smsBodyArb = fc.oneof(
  fc.constantFrom('', 'STATUS', 'status', 'Food', 'FRIDGE', 'meds', 'Insulin', 'co', 'GENERATOR'),
  fc.constantFrom('water', 'WATER', 'help', 'HELP', 'power', '  status   ke7fyj  '),
  fc
    .tuple(fc.constantFrom('status', 'STATUS', 'Power', 'pOwEr'), cellArb)
    .map(([k, c]) => `${k} ${c}`),
  fc.string(),
  fc.fullUnicodeString({ maxLength: 160 }),
);

/** Every screen that does not carry an area code is one of these fixed texts. */
const FIXED_USSD = new Set<string>();
const FIXED_SMS = new Set<string>();
const AREA_LINE =
  /^Area [0-9b-hjkmnp-z]{6}: (fewer than 5 phones have reported, so no answer yet\. Afterglow never guesses\.|(no power|power on|power coming back|mixed reports), from \d+ phones in the last 30 min\.)$/;

describe('Afterglow Voice (USSD and SMS)', () => {
  it('VO-01 every USSD reply is one screen of at most 182 characters starting with CON or END', async () => {
    for (const t of ['', '1', '1*x', '2', '3', '4', '5', '9']) {
      FIXED_USSD.add(await ussdReply(t, lookupOf(null)));
    }
    await fc.assert(
      fc.asyncProperty(ussdTextArb, statusArb, async (text, status) => {
        const out = await ussdReply(text, lookupOf(status));
        expect([...out].length).toBeLessThanOrEqual(USSD_BUDGET);
        expect(out).toMatch(/^(CON|END) /);
        // The menu continues only on the main menu and the "enter your area code" step.
        const continues = text === '' || (!text.includes('*') && text.trim() === '1');
        expect(out.startsWith('CON ')).toBe(continues);
        expect(gsmSeptets(out)).not.toBeNull();
        // No caller text is echoed: the screen is a fixed text or an area line.
        expect(FIXED_USSD.has(out) || AREA_LINE.test(out.slice(4))).toBe(true);
      }),
    );
  });

  it('VO-01 the main menu offers the five choices and 1 asks for the 6-character area code', async () => {
    const menu = await ussdReply('', lookupOf(null));
    expect(menu.startsWith('CON ')).toBe(true);
    for (const item of [
      '1 Power in my area',
      '2 Fridge and food',
      '3 Medicines',
      '4 Generator safety',
      '5 Safe water',
    ]) {
      expect(menu).toContain(item);
    }
    expect(await ussdReply('1', lookupOf(null))).toMatch(/^CON .*6-letter area code/);
    expect(await ussdReply('1*not-a-code', lookupOf(null))).toMatch(
      /^END That is not an area code/,
    );
    expect(await ussdReply('7', lookupOf(null))).toBe(
      'END Choose 1 to 5. Dial again to start over.',
    );
  });

  it('VO-02 every SMS reply fits one 160-character GSM-7 text', async () => {
    for (const t of ['', 'status', 'food', 'meds', 'co', 'water']) {
      FIXED_SMS.add(await smsReply(t, lookupOf(null)));
    }
    await fc.assert(
      fc.asyncProperty(smsBodyArb, statusArb, async (body, status) => {
        const out = await smsReply(body, lookupOf(status));
        const septets = gsmSeptets(out);
        expect(septets).not.toBeNull();
        expect(septets as number).toBeLessThanOrEqual(SMS_BUDGET);
        expect(FIXED_SMS.has(out) || AREA_LINE.test(out)).toBe(true);
      }),
    );
  });

  it('VO-02 keywords in any case answer their guide; anything else gets help that says it is not an emergency service', async () => {
    const pairs: [string[], string][] = [
      [['food', 'fridge'], 'Fridge: keep it shut'],
      [['meds', 'insulin'], 'Insulin:'],
      [['co', 'generator'], 'Never run a generator'],
      [['water'], 'Boil water'],
    ];
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...pairs),
        fc.nat(),
        fc.array(fc.boolean(), { minLength: 12, maxLength: 12 }),
        async ([words, start], pick, caps) => {
          const w = words[pick % words.length] as string;
          const mixed = [...w].map((ch, i) => (caps[i] ? ch.toUpperCase() : ch)).join('');
          expect(await smsReply(`  ${mixed}  please`, lookupOf(null))).toContain(start);
        },
      ),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((s) => {
          const cmd = s.trim().toLowerCase().split(/\s+/)[0] ?? '';
          return ![
            'status',
            'power',
            'food',
            'fridge',
            'meds',
            'insulin',
            'co',
            'generator',
            'water',
          ].includes(cmd);
        }),
        async (body) => {
          const out = await smsReply(body, lookupOf(null));
          expect(out).toContain('Not an emergency service');
          expect(out).toContain('STATUS <area code>');
        },
      ),
    );
  });

  it('VO-02 TwiML holds exactly the message, escaped, in one <Message>', () => {
    const unescapeXml = (s: string) =>
      s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
    fc.assert(
      fc.property(fc.fullUnicodeString(), (m) => {
        const xml = twiml(m);
        const match =
          /^<\?xml version="1\.0" encoding="UTF-8"\?><Response><Message>(.*)<\/Message><\/Response>$/s.exec(
            xml,
          );
        expect(match).not.toBeNull();
        const inner = match?.[1] ?? '';
        expect(inner).not.toMatch(/[<>"']/);
        expect(inner).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/);
        expect(unescapeXml(inner)).toBe(m);
      }),
    );
  });

  it('VO-03 an unknown or under-k area says "no answer yet", never a state', async () => {
    await fc.assert(
      fc.asyncProperty(
        cellArb,
        fc.constantFrom<AreaStatus | null>(null, { state: 'unknown', deviceCount: 0 }),
        async (cell, s) => {
          for (const out of [
            await ussdReply(`1*${cell}`, lookupOf(s)),
            await smsReply(`STATUS ${cell}`, lookupOf(s)),
          ]) {
            expect(out).toContain('no answer yet');
            expect(out).not.toMatch(/no power|power on|coming back|mixed/);
          }
        },
      ),
    );
  });

  it('VO-03 the voice status comes from the published crowd state (k = 5 at the API)', async () => {
    await fc.assert(
      fc.asyncProperty(
        cellArb,
        fc.integer({ min: 0, max: 9 }),
        fc.constantFrom('absent', 'present'),
        async (cell, n, verdict) => {
          const store = memoryCrowdStore();
          for (let i = 0; i < n; i++) {
            const r: cells.CellReport = {
              deviceEpoch: `device-${i}`.padEnd(22, 'x'),
              geohash6: cell,
              minute: NOW_MIN - (i % 3),
              verdict: verdict as 'absent' | 'present',
              confidence: 0.8,
              senses: ['chargingEdge'],
              restoreEdge: false,
            };
            await store.putReport(r, NOW_MS / 1000 + 7200);
          }
          const res = await handlePublic(
            {
              routeKey: 'POST /v1/voice/ussd',
              query: {},
              body: new URLSearchParams({ text: `1*${cell}` }).toString(),
            },
            { store, nowMs: () => NOW_MS },
          );
          expect(res.status).toBe(200);
          if (n < 5) expect(res.body).toContain('no answer yet');
          else
            expect(res.body).toBe(
              `END Area ${cell}: ${verdict === 'absent' ? 'no power' : 'power on'}, from ${n} phones in the last 30 min.`,
            );
        },
      ),
      { numRuns: 60 },
    );
  });

  it('VO-03 every guidance text names its source', async () => {
    for (const k of ['food', 'meds', 'co', 'water']) {
      expect(await smsReply(k, lookupOf(null))).toMatch(/\((USDA|FDA|CDC)\)$/);
    }
    for (const d of ['2', '3', '4', '5']) {
      expect(await ussdReply(d, lookupOf(null))).toMatch(/\((USDA|FDA|CDC)\)$/);
    }
  });

  it('VO-04 the webhooks store and answer nothing about the caller', async () => {
    const digits = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
      minLength: 9,
      maxLength: 12,
    });
    await fc.assert(
      fc.asyncProperty(
        digits,
        fc.hexaString({ minLength: 16, maxLength: 16 }),
        fc.oneof(fc.constantFrom('', '1', '2', '1*ke7fyj'), fc.stringMatching(/^[A-Za-z]{8,20}$/)),
        async (phone, session, text) => {
          const store = memoryCrowdStore();
          const deps = { store, nowMs: () => NOW_MS };
          const ussd = await handlePublic(
            {
              routeKey: 'POST /v1/voice/ussd',
              query: {},
              requester: 'b1',
              body: new URLSearchParams({
                sessionId: `ATUid_${session}`,
                serviceCode: '*384*1#',
                phoneNumber: `+${phone}`,
                text,
              }).toString(),
            },
            deps,
          );
          const sms = await handlePublic(
            {
              routeKey: 'POST /v1/voice/sms',
              query: {},
              requester: 'b1',
              body: new URLSearchParams({
                From: `+${phone}`,
                To: '+15550100',
                Body: text,
              }).toString(),
            },
            deps,
          );
          for (const r of [ussd, sms]) {
            expect(r.status).toBe(200);
            expect(r.maxAge).toBe(0);
            expect(r.body).not.toContain(phone);
            expect(r.body).not.toContain(session);
            if (text.length >= 8) expect(r.body).not.toContain(text);
          }
          for (const w of store.written()) {
            expect(w).not.toContain(phone);
            expect(w).not.toContain(session);
            if (text.length >= 8) expect(w).not.toContain(text.toLowerCase());
            if (text.length >= 8) expect(w).not.toContain(text);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('VO-04 voice is rate-limited per requester bucket: 60 a minute, then "Busy"', async () => {
    const store = memoryCrowdStore();
    let now = NOW_MS;
    const deps = { store, nowMs: () => now };
    const ask = (requester: string, route = 'POST /v1/voice/ussd') =>
      handlePublic({ routeKey: route, query: {}, requester, body: 'text=2' }, deps);
    for (let i = 0; i < 60; i++) {
      expect((await ask('bucket-a')).body).toMatch(/^END Fridge/);
    }
    expect((await ask('bucket-a')).body).toBe('END Busy. Try again in a minute.');
    expect((await ask('bucket-a', 'POST /v1/voice/sms')).body).toContain('Busy.');
    expect((await ask('bucket-b')).body).toMatch(/^END Fridge/);
    now += 60_000;
    expect((await ask('bucket-a')).body).toMatch(/^END Fridge/);
  });

  it('VO-05 fit never exceeds the budget, keeps short texts whole, and never cuts inside a character', () => {
    fc.assert(
      fc.property(
        fc.fullUnicodeString({ maxLength: 400 }),
        fc.integer({ min: 1, max: 300 }),
        (t, budget) => {
          const out = fit(t, budget);
          const n = [...out].length;
          expect(n).toBeLessThanOrEqual(budget);
          expect(LONE_SURROGATE.test(out)).toBe(LONE_SURROGATE.test(t) && out === t);
          if ([...t].length <= budget) {
            expect(out).toBe(t);
          } else {
            expect(out.endsWith('…')).toBe(true);
            expect(t.startsWith(out.slice(0, -1))).toBe(true);
          }
        },
      ),
    );
  });

  it('VO-05 a cut text ends at a word when there is one in the second half', () => {
    const wordArb = fc.stringMatching(/^[a-z]{1,9}$/);
    fc.assert(
      fc.property(
        fc.array(wordArb, { minLength: 2, maxLength: 60 }),
        fc.integer({ min: 10, max: 182 }),
        (words, budget) => {
          const t = words.join(' ');
          const out = fit(t, budget);
          if (out === t) return;
          const kept = out.slice(0, -1);
          const cut = t.slice(0, budget - 1);
          if (cut.lastIndexOf(' ') > budget / 2) {
            // Whole words only: the next character in the original is the space it cut at.
            expect(t[kept.length]).toBe(' ');
          }
        },
      ),
    );
  });

  it('PA-01 the OpenAPI 3.1 document lists every public route with the k, proof-of-work and signing rules', () => {
    const doc = JSON.parse(
      readFileSync(new URL('../../../apps/mobile/public/openapi.json', import.meta.url), 'utf8'),
    ) as { openapi: string; paths: Record<string, Record<string, unknown>> };
    expect(doc.openapi).toMatch(/^3\.1\./);
    const source = readFileSync(new URL('./handler.ts', import.meta.url), 'utf8');
    const routes = [...source.matchAll(/case '(GET|POST) (\/v1\/[^']+)'/g)].map(
      (m) => [m[1]?.toLowerCase() as string, m[2] as string] as const,
    );
    expect(routes.length).toBeGreaterThan(10);
    const missing = routes.filter(([method, path]) => !doc.paths[path]?.[method]);
    expect(missing).toEqual([]);
    const text = JSON.stringify(doc).toLowerCase();
    for (const rule of ['k = 5', 'proof of work', 'sign']) expect(text).toContain(rule);
  });
});

it('VO-01 an area code outside the geohash alphabet is refused, never looked up', async () => {
  let looked = 0;
  const lookup: AreaLookup = async () => {
    looked++;
    return { state: 'dark', deviceCount: 9 };
  };
  for (const bad of ['ke7fy', 'ke7fyja', 'ke7fya', 'ke7fyi', 'ke7fyl', 'ke7fyo', 'ke 7fy']) {
    expect(await ussdReply(`1*${bad}`, lookup)).toMatch(/^END That is not an area code/);
    expect(await smsReply(`STATUS ${bad}`, lookup)).toMatch(/^Send STATUS/);
  }
  expect(looked).toBe(0);
  await fc.assert(
    fc.asyncProperty(cellArb, async (c) => {
      expect(AREA_RE.test(c)).toBe(true);
      expect(await ussdReply(`1*${c}`, lookup)).toBe(
        `END Area ${c}: no power, from 9 phones in the last 30 min.`,
      );
    }),
  );
});
