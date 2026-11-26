/**
 * Afterglow Voice (product description 7.17): the same answers for feature phones.
 * - USSD (Africa's Talking callback format): a menu walked by digits; each screen is
 *   "CON ..." (more to come) or "END ..." (session over) and fits the 182-character
 *   USSD budget.
 * - SMS (Twilio-style inbound webhook, answered with TwiML): one keyword per message
 *   (STATUS <area code>, FOOD, MEDS, CO, WATER, HELP); every reply fits one 160-character SMS.
 * The area code is the 6-character cell code the app shows ("Your area: ke7fyj") or a
 * poster gives. Nothing about the caller is stored or logged: no number, no text.
 */

export const USSD_BUDGET = 182;
export const SMS_BUDGET = 160;

export interface AreaStatus {
  readonly state: 'dark' | 'lit' | 'mixed' | 'comingBack' | 'unknown';
  readonly deviceCount: number;
}

export type AreaLookup = (geohash6: string) => Promise<AreaStatus | null>;

const AREA = /^[0-9b-hjkmnp-z]{6}$/;

const GUIDE = {
  food: 'Fridge: keep it shut. Safe about 4 h. After 4 h throw out meat, chicken, fish, eggs, milk, leftovers. Full freezer about 48 h. (USDA)',
  meds: 'Insulin: many kinds keep 28 days at 15-30 C. Never use if frozen. Your label and pharmacist decide. (FDA)',
  co: 'Never run a generator, grill or stove indoors or in a garage. Keep it 6 m from windows. Headache, dizzy, sick: get to fresh air, call help. (CDC)',
  water:
    'Boil water 1 min. Or 8 drops of 6% bleach per gallon (2 per litre) of clear water, wait 30 min. (CDC)',
} as const;

function areaLine(code: string, s: AreaStatus | null): string {
  if (!s || s.state === 'unknown') {
    return `Area ${code}: fewer than 5 phones have reported, so no answer yet. Afterglow never guesses.`;
  }
  const what =
    s.state === 'dark'
      ? 'no power'
      : s.state === 'lit'
        ? 'power on'
        : s.state === 'comingBack'
          ? 'power coming back'
          : 'mixed reports';
  return `Area ${code}: ${what}, from ${s.deviceCount} phones in the last 30 min.`;
}

/** Fit a screen or message to its budget, cutting at a word and never mid-character. */
export function fit(text: string, budget: number): string {
  const chars = [...text];
  if (chars.length <= budget) return text;
  const cut = chars.slice(0, budget - 1).join('');
  const space = cut.lastIndexOf(' ');
  return `${space > budget / 2 ? cut.slice(0, space) : cut}…`;
}

/**
 * One USSD step. `text` is everything the caller typed this session, joined by "*"
 * (the Africa's Talking convention): "" → main menu; "1" → ask for the area code;
 * "1*ke7fyj" → the area's status; "2".."5" → a guide.
 */
export async function ussdReply(text: string, lookup: AreaLookup): Promise<string> {
  const parts = text.split('*').map((p) => p.trim().toLowerCase());
  const [first, second] = parts;
  let out: string;
  if (!text) {
    out =
      'CON Afterglow\n1 Power in my area\n2 Fridge and food\n3 Medicines\n4 Generator safety\n5 Safe water';
  } else if (first === '1' && second === undefined) {
    out = 'CON Enter your 6-letter area code (from the app or a poster):';
  } else if (first === '1' && second !== undefined) {
    out = AREA.test(second)
      ? `END ${areaLine(second, await lookup(second))}`
      : 'END That is not an area code. Codes have 6 letters and digits, like ke7fyj.';
  } else if (first === '2') out = `END ${GUIDE.food}`;
  else if (first === '3') out = `END ${GUIDE.meds}`;
  else if (first === '4') out = `END ${GUIDE.co}`;
  else if (first === '5') out = `END ${GUIDE.water}`;
  else out = 'END Choose 1 to 5. Dial again to start over.';
  return fit(out, USSD_BUDGET);
}

/** One inbound SMS, answered in one message. */
export async function smsReply(body: string, lookup: AreaLookup): Promise<string> {
  const words = body.trim().toLowerCase().split(/\s+/);
  const [cmd, arg] = words;
  let out: string;
  if (cmd === 'status' || cmd === 'power') {
    out =
      arg && AREA.test(arg)
        ? areaLine(arg, await lookup(arg))
        : 'Send STATUS and your 6-letter area code, like: STATUS ke7fyj';
  } else if (cmd === 'food' || cmd === 'fridge') out = GUIDE.food;
  else if (cmd === 'meds' || cmd === 'insulin') out = GUIDE.meds;
  else if (cmd === 'co' || cmd === 'generator') out = GUIDE.co;
  else if (cmd === 'water') out = GUIDE.water;
  else
    out =
      'Afterglow: send STATUS <area code>, FOOD, MEDS, CO or WATER. Not an emergency service: in danger, call your emergency number.';
  return fit(out, SMS_BUDGET);
}

/** TwiML for an SMS reply, with the text escaped for XML. */
export function twiml(message: string): string {
  const esc = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
}
