import type { ReactNode } from 'react';
import { GhostGlyph } from '../../night-shell/costume';
import { Link } from '../../router';
import { Icon, type IconName } from '../../ui/icons';
import { CtaLink, Eyebrow, Reveal, SectionHead, cx } from '../../ui/kit';
import { FlashCode, MiniCandles, MiniGhosts, MiniGraveyard, MiniMap } from '../visuals';

/**
 * Features (web-experience WX-08): every module, grouped by the question it
 * answers, with the costume that carries its number. Roadmap items say so.
 */

/** The hero every public page opens with. Shared by the site's pages. */
export function PageHero({
  eyebrow,
  icon,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  icon?: IconName | undefined;
  title: ReactNode;
  lead: ReactNode;
  children?: ReactNode;
}): ReactNode {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="dot-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_15%,transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="halo absolute top-[-35%] left-1/2 -z-10 h-[110%] w-[85%] -translate-x-1/2 opacity-80"
      />
      <div className="container-x flex flex-col items-start gap-7 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:items-center lg:text-center">
        <div className="animate-rise">
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
        </div>
        <h1 className="m-0 max-w-[18ch] animate-rise font-display text-hero font-medium tracking-[-0.035em] text-emphasis [animation-delay:80ms]">
          {title}
        </h1>
        <p className="m-0 max-w-[60ch] animate-rise text-lead text-secondary [animation-delay:160ms]">
          {lead}
        </p>
        {children ? (
          <div className="flex w-full animate-rise flex-col gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The closing band every public page ends with. */
export function CtaBand({
  title,
  lead,
  children,
}: {
  title: ReactNode;
  lead: ReactNode;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="container-x pt-16">
      <Reveal>
        <div className="relative overflow-hidden rounded-[36px] border border-ring bg-surface-2 px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="halo absolute bottom-[-60%] left-1/2 h-[160%] w-[110%] -translate-x-1/2 opacity-90"
          />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6">
            <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.025em] text-emphasis">
              {title}
            </h2>
            <p className="m-0 max-w-[52ch] text-lead text-secondary">{lead}</p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              {children}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/** A sticky, horizontally scrollable list of in-page anchors. */
export function SubNav({ items }: { items: readonly { id: string; label: string }[] }): ReactNode {
  return (
    <nav
      aria-label="On this page"
      className="sticky top-[72px] z-20 border-y border-hairline bg-bg/90 backdrop-blur-md"
    >
      <div className="container-x flex gap-2 overflow-x-auto py-3 [scrollbar-width:none]">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            className="inline-flex min-h-11 flex-none items-center rounded-full border border-hairline bg-surface-1 px-4 text-caption whitespace-nowrap text-secondary no-underline transition-colors hover:border-ring hover:text-primary"
          >
            {i.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function Bullet({ children }: { children: ReactNode }): ReactNode {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 flex-none text-emphasis">
        <Icon name="check" size={18} />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

interface Feature {
  id: string;
  eyebrow: string;
  icon: IconName;
  title: string;
  body: string;
  bullets: readonly ReactNode[];
  visual: ReactNode;
  soon?: string;
}

function FeatureRow({ f, flip }: { f: Feature; flip: boolean }): ReactNode {
  return (
    <article id={f.id} className="scroll-mt-40 py-12 sm:py-16">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <Reveal className={cx('flex min-w-0 flex-col items-start gap-5', flip && 'lg:order-2')}>
          <Eyebrow icon={f.icon}>{f.eyebrow}</Eyebrow>
          <h3 className="m-0 font-display text-[clamp(30px,3.4vw,44px)] leading-[1.08] font-medium tracking-[-0.02em] text-emphasis">
            {f.title}
          </h3>
          <p className="m-0 text-lead text-secondary">{f.body}</p>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-label text-primary">
            {f.bullets.map((b, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static copy
              <Bullet key={i}>{b}</Bullet>
            ))}
          </ul>
          {f.soon ? (
            <p className="m-0 flex items-start gap-2 text-caption text-muted">
              <span className="mt-0.5 flex-none">
                <Icon name="clock" size={16} />
              </span>
              {f.soon}
            </p>
          ) : null}
        </Reveal>
        <Reveal delay={100} className={cx('min-w-0', flip && 'lg:order-1')}>
          <div className="card relative flex min-h-[280px] items-center justify-center overflow-hidden p-8 sm:p-10">
            <div aria-hidden="true" className="halo-soft absolute inset-[-20%] opacity-70" />
            <div className="relative w-full">{f.visual}</div>
          </div>
        </Reveal>
      </div>
    </article>
  );
}

function SenseVisual(): ReactNode {
  const senses: readonly { icon: IconName; name: string; vote: string }[] = [
    { icon: 'plug', name: 'Charger edge', vote: 'absent' },
    { icon: 'mic', name: 'Mains hum', vote: 'absent' },
    { icon: 'eye', name: 'Light flicker', vote: 'no vote' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {senses.map((s) => (
        <div
          key={s.name}
          className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface-2 px-4 py-3"
        >
          <span className="flex size-10 flex-none items-center justify-center rounded-xl border border-hairline bg-surface-1 text-emphasis">
            <Icon name={s.icon} size={20} />
          </span>
          <span className="min-w-0 flex-1 text-label text-primary">{s.name}</span>
          <span className="clock text-caption text-secondary">{s.vote}</span>
        </div>
      ))}
      <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-ring bg-surface-3 px-4 py-3">
        <span className="text-label font-bold text-emphasis">Verdict: power is out</span>
        <span className="text-caption text-secondary">2 senses agree</span>
      </div>
    </div>
  );
}

function StonesVisual(): ReactNode {
  const stones = [
    { t: 'Fridge', e: '2 h 46 m', d: 0.2 },
    { t: 'Freezer', e: '21 h 15 m', d: 0.05 },
    { t: 'Insulin', e: 'ask your pharmacist', d: 0 },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {stones.map((s) => (
        <div
          key={s.t}
          className="relative min-w-0 overflow-hidden rounded-t-[26px] border border-hairline border-t-glow bg-surface-3 px-4 pt-5 pb-4"
        >
          <div aria-hidden="true" className="absolute inset-0 bg-bg" style={{ opacity: s.d }} />
          <div className="relative">
            <div className="text-caption text-secondary">{s.t}</div>
            <div className="clock mt-1 text-[18px] leading-tight text-primary [overflow-wrap:anywhere]">
              {s.e}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModesVisual(): ReactNode {
  const modes = [
    { n: 'Night', c: 'text-secondary', l: '8%' },
    { n: 'Dusk', c: 'text-primary', l: '10%' },
    { n: 'Ember', c: 'text-emphasis', l: 'AA' },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {modes.map((m) => (
        <div
          key={m.n}
          className="flex flex-col items-center gap-2 rounded-2xl border border-hairline bg-bg px-2 py-6"
        >
          <span className={cx('font-display text-[28px] leading-none', m.c)}>Aa</span>
          <span className="text-caption text-secondary">{m.n}</span>
          <span className="clock text-caption text-muted">{m.l}</span>
        </div>
      ))}
    </div>
  );
}

function HapticsVisual(): ReactNode {
  const rows = [
    { what: 'Outage', bars: [6] },
    { what: 'Power back', bars: [2, 2] },
    { what: 'HELP received', bars: [2, 2, 2] },
  ];
  return (
    <div className="flex flex-col gap-4">
      {rows.map((r) => (
        <div key={r.what} className="flex items-center gap-4">
          <span className="w-32 flex-none text-label text-primary">{r.what}</span>
          <span aria-hidden="true" className="flex flex-1 items-center gap-2">
            {r.bars
              .map((b, i) => ({ b, id: `${r.what}-${i}` }))
              .map(({ b, id }) => (
                <span
                  key={id}
                  className="h-3 rounded-full bg-emphasis"
                  style={{ width: `${b * 16}px` }}
                />
              ))}
          </span>
        </div>
      ))}
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-hairline bg-surface-2 px-4 py-3 text-label text-secondary">
        <Icon name="mic" size={20} />
        “Read it to me”
      </div>
    </div>
  );
}

function RecordsVisual(): ReactNode {
  const rows = [
    { d: 'Tue 19:40', len: '3 h 05 m', note: '2 items discarded' },
    { d: 'Sun 07:12', len: '1 h 50 m', note: 'all checked in' },
    { d: 'Fri 21:03', len: '4 h 20 m', note: 'promised 2 h' },
  ];
  return (
    <div className="flex flex-col divide-y divide-hairline rounded-2xl border border-hairline bg-surface-2">
      {rows.map((r) => (
        <div
          key={r.d}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
        >
          <span className="clock text-caption text-secondary">{r.d}</span>
          <span className="clock text-label text-primary">{r.len}</span>
          <span className="text-caption text-secondary">{r.note}</span>
        </div>
      ))}
    </div>
  );
}

function PairVisual(): ReactNode {
  return (
    <div className="flex flex-col items-center gap-6">
      <div
        aria-hidden="true"
        className="grid grid-cols-7 gap-1 rounded-2xl border border-hairline bg-bg p-3"
      >
        {'1011101100101001101110010110100101101110110100011'
          .split('')
          .map((b, i) => ({ b, id: `q${i}` }))
          .map(({ b, id }) => (
            <span
              key={id}
              className={cx('size-4 rounded-[3px]', b === '1' ? 'bg-emphasis' : 'bg-surface-2')}
            />
          ))}
      </div>
      <div className="flex items-end gap-3">
        <GhostGlyph opacity={1} size={36} />
        <span className="text-secondary">
          <Icon name="arrowRight" size={22} />
        </span>
        <GhostGlyph opacity={1} size={36} />
      </div>
    </div>
  );
}

const GROUPS: readonly {
  id: string;
  title: string;
  lead: string;
  icon: IconName;
  features: readonly Feature[];
}[] = [
  {
    id: 'tonight',
    title: 'Tonight',
    icon: 'moon',
    lead: 'What is happening, what is still safe, and how long you have.',
    features: [
      {
        id: 'grid-sense',
        eyebrow: 'Grid Sense',
        icon: 'wave',
        title: 'Your phone notices the grid go.',
        body: 'Three senses vote: the charger stops, the mains hum goes quiet, the lights stop flickering. A deterministic fusion turns the votes into present, absent or unknown, and records which senses voted.',
        bullets: [
          'Absent only when two senses agree, or one is corroborated by neighbours',
          'Raw audio and camera frames stay in memory and are never stored or sent',
          'A denied permission degrades the verdict honestly, it never guesses',
        ],
        visual: <SenseVisual />,
        soon: 'Background charger events and the magnetometer sense are coming to the native app.',
      },
      {
        id: 'lantern-map',
        eyebrow: 'Lantern map',
        icon: 'map',
        title: 'Lit or dark, street by street.',
        body: 'Phones report only when their verdict changes, as a geohash-6 cell. A cell is shown only when at least five devices back it, so the map shows streets, never doors.',
        bullets: [
          'Dark, lit, mixed, coming back or unknown, told by shape and words, not colour',
          'A restoration estimate with a band, from the crowd’s own trajectory',
          'Lit places nearby, cell towers, and tonight’s forecast for your area',
        ],
        visual: <MiniMap className="mx-auto max-w-[360px]" />,
      },
      {
        id: 'cold',
        eyebrow: 'Cold chain and medicine',
        icon: 'tombstone',
        title: 'A tombstone per compartment.',
        body: 'A thermal model of your own fridge and freezer, anchored to USDA guidance, starts the four-hour clock when the food crosses 4 °C, not when the power goes. Medicines get a clock only from a pharmacist-approved table built from the label.',
        bullets: [
          'Per-food discard decisions from USDA FoodKeeper, with the citation',
          'Medicine budgets from openFDA label text, never estimated',
          'Not in the table: no clock, and “ask your pharmacist”',
        ],
        visual: <StonesVisual />,
      },
      {
        id: 'hours-of-safety',
        eyebrow: 'Hours of safety',
        icon: 'clock',
        title: 'How cold, or hot, your home gets tonight.',
        body: 'Building constants from NREL ResStock archetypes and the hourly forecast give a band, not a guess, with a headstone where your home crosses the danger line.',
        bullets: [
          'Thresholds adjust for infants, older people and medical needs',
          'A plan for one warm room, and where to go if it is not enough',
          'No archetype? A wide band, never a point estimate',
        ],
        visual: <MiniGraveyard />,
      },
      {
        id: 'plan',
        eyebrow: 'Candles and the ward',
        icon: 'candle',
        title: 'What your batteries can carry.',
        body: 'Every store of energy is a candle. A deterministic plan lights them in order: medical devices first, then communication, light, food and comfort. And the ward refuses to mark a generator as set up until the carbon-monoxide checks pass.',
        bullets: [
          'Medical device profiles for CPAP, oxygen concentrators and more',
          'Infeasible loads are stated plainly',
          'Generator gate: outdoors, far from openings, exhaust away from windows',
        ],
        visual: (
          <div className="flex justify-center">
            <MiniCandles />
          </div>
        ),
      },
    ],
  },
  {
    id: 'people',
    title: 'Your people',
    icon: 'people',
    lead: 'Who has checked in, and how to reach them when every network is down.',
    features: [
      {
        id: 'seance',
        eyebrow: 'Séance',
        icon: 'seance',
        title: 'Say “I am safe” with light.',
        body: 'One phone’s screen flashes a short code; another phone’s camera reads it, window to window and courtyard to courtyard. Codes also travel as sound, room to room. No network, no server.',
        bullets: [
          'SAFE, HELP and needs like water or medicine, as short codes',
          'Error correction: a frame that fails asks for a repeat, never a guess',
          'Afterglow is not an emergency service and always says so',
        ],
        visual: (
          <div className="flex justify-center py-6">
            <FlashCode className="origin-center scale-125 sm:scale-150" />
          </div>
        ),
        soon: 'Bluetooth relay and LoRa gateways are coming to the native app.',
      },
      {
        id: 'ghosts',
        eyebrow: 'Ghosts and guardians',
        icon: 'people',
        title: 'See who has not checked in.',
        body: 'People you look after are faint ghosts until they are heard from, and solid once they are. Expect check-ins from the people who depend on you; two missed check-ins escalate.',
        bullets: [
          'Check-in cadences per person',
          'Escalation at two missed check-ins',
          'Nobody appears on anyone’s list without mutual consent',
        ],
        visual: (
          <div className="flex justify-center py-8">
            <div className="origin-center scale-150">
              <MiniGhosts />
            </div>
          </div>
        ),
      },
      {
        id: 'pairing',
        eyebrow: 'Pairing',
        icon: 'key',
        title: 'Pair face to face.',
        body: 'Add someone by scanning a QR code in person, or with an invitation link. Roster ids are local to the pair, never global identifiers.',
        bullets: [
          'The person who opens an invitation is always asked first',
          'Works offline once paired',
          'Leave a roster at any time',
        ],
        visual: <PairVisual />,
      },
    ],
  },
  {
    id: 'accessibility',
    title: 'Readable in the dark',
    icon: 'eye',
    lead: 'An interface for a pitch-black room, a dying battery and shaking hands.',
    features: [
      {
        id: 'night-shell',
        eyebrow: 'Night Shell',
        icon: 'moon',
        title: 'Red on pure black, by measurement.',
        body: 'Three luminance modes (Night, Dusk and Ember) keep text under a measured ceiling, so your eyes stay dark-adapted and the room stays dark. A pixel scan checks every screen in every mode.',
        bullets: [
          'One hue: meaning is in size, shape and words',
          '56 px targets and large numerals for gloves and panic',
          'There is no light mode, by design',
        ],
        visual: <ModesVisual />,
      },
      {
        id: 'eyes-free',
        eyebrow: 'Eyes-free',
        icon: 'mic',
        title: 'It speaks, listens and buzzes.',
        body: 'Read the home line aloud, give voice commands for common actions, and feel a haptic grammar: one long for an outage, two short when the power is back, three when someone sends HELP.',
        bullets: [
          'Voice commands: “power out”, “status”, “light on”…',
          'Every haptic is paired with something on screen',
          'Sound is off by default',
        ],
        visual: <HapticsVisual />,
      },
      {
        id: 'light-and-offline',
        eyebrow: 'Light, languages, offline',
        icon: 'flashlight',
        title: 'A light, in your language, with no network.',
        body: 'Turn the phone into a dim red light that keeps your night vision. Afterglow installs like an app, opens with no connection, and speaks English, French, Spanish and Portuguese.',
        bullets: [
          'Lantern light mode with a confirmed white-light escape hatch',
          'The whole app is cached on install and works offline',
          'Push alerts when your area goes dark or comes back',
        ],
        visual: (
          <div className="flex flex-col items-center gap-4">
            <span className="flex size-28 items-center justify-center rounded-full border border-ring bg-control-primary text-control-label">
              <Icon name="flashlight" size={48} />
            </span>
            <span className="flex gap-2">
              {['EN', 'FR', 'ES', 'PT'].map((l) => (
                <span
                  key={l}
                  className="clock rounded-full border border-hairline bg-surface-2 px-3 py-1 text-caption text-secondary"
                >
                  {l}
                </span>
              ))}
            </span>
          </div>
        ),
      },
    ],
  },
  {
    id: 'records',
    title: 'Records and trust',
    icon: 'book',
    lead: 'What happened, what it cost, and how the numbers are made.',
    features: [
      {
        id: 'history',
        eyebrow: 'History and reports',
        icon: 'chart',
        title: 'Every outage, kept.',
        body: 'Each night is recorded: how long, what was promised, what was discarded, who checked in. Share it, save it, or print it on paper for a landlord, an insurer or a utility.',
        bullets: [
          'Promised against actual, per outage',
          'A printable report in plain text',
          'Your data, exportable in two taps',
        ],
        visual: <RecordsVisual />,
      },
      {
        id: 'trust',
        eyebrow: 'Trust centre and Ask',
        icon: 'shield',
        title: 'Every number, explained.',
        body: 'The trust centre shows the models, versions and sources behind every clock. Ask a question and the guidance library answers from cited sources, offline; online, Claude phrases the answer, and never decides it.',
        bullets: [
          '“How I know” is one tap from every number',
          'Defaults are always labelled as defaults',
          'AI may phrase and translate, never produce a verdict',
        ],
        visual: (
          <div className="flex flex-col gap-3">
            {['USDA FSIS outage guidance', 'thermal-appliance-v2', 'defaults: room 22 °C'].map(
              (s, i) => (
                <span
                  key={s}
                  className={cx(
                    'clock rounded-full border px-4 py-2 text-caption [overflow-wrap:anywhere]',
                    i === 2 ? 'border-ring text-emphasis' : 'border-hairline text-secondary',
                  )}
                >
                  {s}
                </span>
              ),
            )}
          </div>
        ),
      },
    ],
  },
];

export function FeaturesPage(): ReactNode {
  return (
    <>
      <PageHero
        eyebrow="Features"
        icon="sparkle"
        title={
          <>
            Everything you need <span className="text-ember italic">in the dark.</span>
          </>
        }
        lead="Grid sensing, a crowd map, food and medicine clocks, hours of safety, energy planning, and a way to reach your people with light. Safety features are free, forever."
      >
        <CtaLink to="/app?tour=1" icon="arrowRight">
          Take the tour
        </CtaLink>
        <CtaLink to="/app" variant="secondary">
          Open the app
        </CtaLink>
      </PageHero>

      <SubNav items={GROUPS.map((g) => ({ id: g.id, label: g.title }))} />

      {GROUPS.map((g) => (
        <section key={g.id} id={g.id} className="container-x scroll-mt-36 pt-20 sm:pt-28">
          <SectionHead eyebrow={g.title} icon={g.icon} title={g.lead} />
          <div className="divide-y divide-hairline">
            {g.features.map((f, i) => (
              <FeatureRow key={f.id} f={f} flip={i % 2 === 1} />
            ))}
          </div>
        </section>
      ))}

      <section className="container-x pt-16">
        <Reveal>
          <Link
            to="/organisations"
            className="card card-hover group flex flex-col gap-4 p-7 no-underline sm:flex-row sm:items-center sm:justify-between sm:p-9"
          >
            <div className="flex items-center gap-4">
              <span className="flex size-14 flex-none items-center justify-center rounded-2xl border border-ring bg-control-primary text-control-label">
                <Icon name="building" size={26} />
              </span>
              <div>
                <h2 className="m-0 font-display text-[28px] font-medium text-emphasis">
                  Running a pharmacy, clinic or city?
                </h2>
                <p className="m-0 mt-1 text-label text-secondary">
                  Afterglow Business, Beacon and Voice for feature phones.
                </p>
              </div>
            </div>
            <span className="text-secondary transition-transform duration-300 group-hover:translate-x-1">
              <Icon name="arrowRight" size={26} />
            </span>
          </Link>
        </Reveal>
      </section>

      <CtaBand
        title="See it work on one night."
        lead="Wisp, a ghost who is scared of bright screens, walks you through a simulated outage in about ninety seconds."
      >
        <CtaLink to="/app?tour=1" icon="play">
          Start the tour
        </CtaLink>
        <CtaLink to="/signup" variant="secondary">
          Create a free account
        </CtaLink>
      </CtaBand>
    </>
  );
}
