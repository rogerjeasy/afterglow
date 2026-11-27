import type { LuminanceMode } from '@afterglow/design-system';
import type { ReactNode } from 'react';
import { GhostGlyph } from '../night-shell/costume';
import { Link } from '../router';
import { Icon, type IconName } from '../ui/icons';
import { CtaLink, Eyebrow, Reveal, SectionHead, cx } from '../ui/kit';
import { setSiteMode, useSiteMode } from './SiteLayout';
import { FlashCode, HeroPhone, MiniCandles, MiniGhosts, MiniGraveyard, MiniMap } from './visuals';

/**
 * The homepage (web-experience WX-07). It answers, in order: what is this, why
 * should I care, what does it do, why can I trust it, and what do I tap next.
 */

function Hero(): ReactNode {
  return (
    <section className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="dot-grid absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_72%)]"
      />
      <div
        aria-hidden="true"
        className="halo absolute top-[-10%] right-[-15%] -z-10 h-[90%] w-[75%] opacity-90"
      />
      <div
        aria-hidden="true"
        className="halo-soft absolute bottom-[-30%] left-[-20%] -z-10 h-[70%] w-[60%] opacity-70"
      />

      <div className="container-x grid items-center gap-14 pt-10 pb-20 sm:pt-16 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:pt-20 lg:pb-28">
        <div className="flex min-w-0 flex-col items-start gap-7">
          <div className="animate-rise">
            <Eyebrow icon="moon">For the billions who live with unreliable power</Eyebrow>
          </div>
          <h1 className="m-0 animate-rise font-display text-hero font-medium tracking-[-0.035em] text-emphasis [animation-delay:80ms]">
            The only app you can read when <span className="text-ember italic">the grid dies.</span>
          </h1>
          <p className="m-0 max-w-[54ch] animate-rise text-lead text-secondary [animation-delay:160ms]">
            Afterglow is a blackout companion. It senses the outage, counts down what is still safe
            in your fridge and medicine cabinet, hears from your people without a network, and stays
            readable in pitch dark without stealing your night vision.
          </p>
          <div className="flex w-full animate-rise flex-col gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
            <CtaLink to="/app?tour=1" icon="arrowRight">
              Take the 90-second tour
            </CtaLink>
            <CtaLink to="/app?phase=outage&elapsed=45" variant="secondary" icon="boltOff">
              Jump into a blackout
            </CtaLink>
          </div>
          <ul className="m-0 flex animate-rise list-none flex-wrap gap-x-6 gap-y-2 p-0 text-caption text-secondary [animation-delay:320ms]">
            {[
              'Free, forever, for households',
              'Works offline',
              'No account needed',
              'Open source',
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span className="text-emphasis">
                  <Icon name="check" size={18} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex animate-rise justify-center [animation-delay:200ms] lg:justify-end">
          <div aria-hidden="true" className="halo absolute inset-[-12%] -z-10 opacity-90" />
          <HeroPhone />
          <div className="card absolute -bottom-8 left-0 z-20 hidden max-w-[250px] p-4 sm:block lg:-left-16">
            <div className="flex items-center gap-2 text-caption text-secondary">
              <Icon name="shield" size={18} />
              Every number shows its source
            </div>
            <div className="mt-1.5 text-caption text-primary">
              USDA FSIS · thermal model v2 · your fridge
            </div>
          </div>
          <div className="card absolute -top-8 right-0 z-20 hidden p-4 sm:block lg:-right-8">
            <div className="text-caption text-secondary">Night mode ceiling</div>
            <div className="clock text-[26px] leading-tight text-emphasis">8% luminance</div>
          </div>
        </div>
      </div>
      <p className="container-x m-0 -mt-6 pb-10 text-center text-caption text-muted lg:text-right">
        Illustration of the labelled demo household, 45 minutes into an outage.
      </p>
    </section>
  );
}

const SOURCES = [
  'USDA FoodKeeper',
  'USDA FSIS',
  'openFDA labels',
  'NREL ResStock',
  'Open-Meteo',
  'OpenStreetMap',
  'OpenCelliD',
];

function SourceStrip(): ReactNode {
  return (
    <section aria-label="Data sources" className="border-y border-hairline bg-surface-1">
      <div className="container-x flex flex-col items-center gap-5 py-8 lg:flex-row lg:justify-between">
        <span className="flex-none text-caption text-secondary">
          Every verdict cites public science
        </span>
        <ul className="m-0 flex list-none flex-wrap items-center justify-center gap-x-8 gap-y-3 p-0 lg:justify-end">
          {SOURCES.map((s) => (
            <li key={s} className="font-display text-[20px] text-primary">
              {s}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const QUESTIONS: readonly { q: string; a: string; icon: IconName; tab: string }[] = [
  {
    q: 'Is it just my house?',
    a: 'Phones that sense the mains vote, and the Lantern map shows your street, the district, and the cells coming back.',
    icon: 'lantern',
    tab: 'Lantern',
  },
  {
    q: 'Can I still eat the chicken?',
    a: 'A thermal model of your own fridge, plus USDA rules, turns into one clock per compartment. A tombstone, with an epitaph.',
    icon: 'tombstone',
    tab: 'Cold',
  },
  {
    q: 'Is my insulin still good?',
    a: 'Only from a pharmacist-approved table built from the label. Not in the table? No clock, and it says so.',
    icon: 'pill',
    tab: 'Cold',
  },
  {
    q: 'Is my mother okay?',
    a: 'People you look after are ghosts until they check in. "Safe" and "Help" travel as light from screen to camera, with no network.',
    icon: 'seance',
    tab: 'Séance',
  },
];

function Questions(): ReactNode {
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHead
        eyebrow="The problem"
        icon="boltOff"
        title="When the lights go out, the questions start."
        lead="Every outage app answers one question: when will the power come back? Afterglow answers the ones you have while you sit in the dark."
      />
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUESTIONS.map((x, i) => (
          <Reveal key={x.q} delay={i * 80} className="h-full">
            <article className="card card-hover flex h-full flex-col gap-5 p-6">
              <span className="flex size-12 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-emphasis">
                <Icon name={x.icon} size={24} />
              </span>
              <h3 className="m-0 font-display text-[26px] leading-tight font-medium text-emphasis">
                {x.q}
              </h3>
              <p className="m-0 flex-1 text-label text-secondary">{x.a}</p>
              <span className="text-caption text-muted">Answered in {x.tab}</span>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Bento(): ReactNode {
  return (
    <section className="relative py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="halo-soft absolute top-1/4 left-1/2 -z-10 h-[60%] w-[80%] -translate-x-1/2 opacity-60"
      />
      <div className="container-x">
        <SectionHead
          eyebrow="What it does"
          icon="sparkle"
          title="Every spooky thing is a measurement."
          lead="Afterglow wears a costume, and each piece of it is a number you can trust. Tap any number in the app to see where it came from."
        />
        <div className="mt-14 grid gap-4 lg:grid-cols-6">
          <Reveal className="lg:col-span-4">
            <article className="card card-hover flex h-full flex-col gap-6 overflow-hidden p-6 sm:p-8 md:flex-row md:items-center">
              <div className="flex flex-1 flex-col gap-3">
                <Eyebrow icon="map">Lantern map</Eyebrow>
                <h3 className="m-0 font-display text-[32px] leading-tight font-medium text-emphasis">
                  Your neighbourhood, lit or dark, live.
                </h3>
                <p className="m-0 text-label text-secondary">
                  Phones sense the grid from the charger edge and the mains hum. A cell appears only
                  when at least five devices back it, so no house can be singled out.
                </p>
              </div>
              <MiniMap className="w-full max-w-[300px] flex-none" />
            </article>
          </Reveal>
          <Reveal delay={80} className="lg:col-span-2">
            <article className="card card-hover flex h-full flex-col gap-5 p-6 sm:p-8">
              <Eyebrow icon="seance">Séance</Eyebrow>
              <h3 className="m-0 font-display text-[28px] leading-tight font-medium text-emphasis">
                Say “I am safe” with light.
              </h3>
              <p className="m-0 text-label text-secondary">
                One screen flashes, another camera reads it. No network, no Bluetooth, no pairing
                server.
              </p>
              <FlashCode className="mt-auto" />
            </article>
          </Reveal>
          <Reveal className="lg:col-span-2">
            <article className="card card-hover flex h-full flex-col gap-5 p-6 sm:p-8">
              <Eyebrow icon="people">Ghosts</Eyebrow>
              <h3 className="m-0 font-display text-[28px] leading-tight font-medium text-emphasis">
                See who has not checked in.
              </h3>
              <p className="m-0 text-label text-secondary">
                A faint ghost is someone you have not heard from since the outage began. Two missed
                check-ins escalate to their guardian.
              </p>
              <MiniGhosts />
            </article>
          </Reveal>
          <Reveal delay={80} className="lg:col-span-2">
            <article className="card card-hover flex h-full flex-col gap-5 p-6 sm:p-8">
              <Eyebrow icon="clock">Graveyard Shift</Eyebrow>
              <h3 className="m-0 font-display text-[28px] leading-tight font-medium text-emphasis">
                How cold your home gets tonight.
              </h3>
              <p className="m-0 text-label text-secondary">
                Building physics and the forecast give a band, with a headstone where your home
                crosses the danger line.
              </p>
              <MiniGraveyard className="mt-auto" />
            </article>
          </Reveal>
          <Reveal delay={160} className="lg:col-span-2">
            <article className="card card-hover flex h-full flex-col gap-5 p-6 sm:p-8">
              <Eyebrow icon="battery">Candles</Eyebrow>
              <h3 className="m-0 font-display text-[28px] leading-tight font-medium text-emphasis">
                What your batteries can carry.
              </h3>
              <p className="m-0 text-label text-secondary">
                Each battery is a candle: what it keeps running, in what order, for how long. And a
                ward refuses the generator until the CO checks pass.
              </p>
              <div className="mt-auto">
                <MiniCandles />
              </div>
            </article>
          </Reveal>
        </div>
        <div className="mt-10 flex justify-center">
          <CtaLink to="/features" variant="secondary" icon="arrowRight">
            See every feature
          </CtaLink>
        </div>
      </div>
    </section>
  );
}

const MODES: readonly {
  id: LuminanceMode;
  name: string;
  when: string;
  ceiling: string;
  why: string;
}[] = [
  {
    id: 'night',
    name: 'Night',
    when: 'Below about 5 lux',
    ceiling: 'Text never brighter than #A50000, 8% luminance',
    why: 'Keeps your eyes dark-adapted and the room dark, so you can still see the stairs.',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    when: 'About 5 to 50 lux',
    ceiling: 'Ceiling #B70000, 10%, all text large',
    why: 'Candlelight and torchlight: a little brighter, still gentle on a dark room.',
  },
  {
    id: 'ember',
    name: 'Ember',
    when: 'A lit room, low vision',
    ceiling: 'Up to #FF0000, AA contrast for all text',
    why: 'For setting up in daylight and for anyone who needs more contrast.',
  },
];

function NightVision(): ReactNode {
  const mode = useSiteMode();
  return (
    <section className="relative overflow-hidden border-y border-hairline bg-surface-1 py-24 sm:py-32">
      <div
        aria-hidden="true"
        className="dot-grid absolute inset-0 opacity-60 [mask-image:linear-gradient(180deg,transparent,black_30%,black_70%,transparent)]"
      />
      <div className="container-x relative grid gap-14 lg:grid-cols-2 lg:items-center">
        <SectionHead
          eyebrow="Designed for the dark"
          icon="eye"
          title="Try it: dim this whole page."
          lead="There is no light mode. Afterglow is red on pure black, and brightness is a budget that a test checks on every screen, pixel by pixel. Pick a mode and the page you are reading follows."
        />
        <Reveal>
          <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
            <legend className="sr-only">Luminance mode for this page</legend>
            {MODES.map((m) => {
              const on = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSiteMode(m.id)}
                  className={cx(
                    'press group flex w-full items-start gap-5 rounded-[24px] border p-5 text-left transition-[transform,opacity] duration-300 ease-out sm:p-6',
                    on
                      ? 'border-ring bg-surface-3'
                      : 'border-hairline bg-surface-2 hover:-translate-y-0.5',
                  )}
                >
                  <span
                    className={cx(
                      'mt-1 flex size-7 flex-none items-center justify-center rounded-full border-2 transition-colors',
                      on ? 'border-emphasis' : 'border-muted',
                    )}
                  >
                    <span
                      className={cx(
                        'size-3 rounded-full bg-emphasis transition-[transform,opacity] duration-300',
                        on ? 'scale-100 opacity-100' : 'scale-0 opacity-0',
                      )}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="font-display text-[28px] leading-none text-emphasis">
                        {m.name}
                      </span>
                      <span className="text-caption text-secondary">{m.when}</span>
                    </span>
                    <span className="clock text-caption text-primary">{m.ceiling}</span>
                    <span className="text-caption text-secondary">{m.why}</span>
                  </span>
                </button>
              );
            })}
          </fieldset>
        </Reveal>
      </div>
    </section>
  );
}

const STEPS: readonly { n: string; title: string; body: string; icon: IconName }[] = [
  {
    n: '01',
    title: 'Sense',
    body: 'The phone notices the power go: the charger stops, the 50 or 60 Hz hum goes quiet, the lights stop flickering. Neighbours’ phones agree, or do not.',
    icon: 'wave',
  },
  {
    n: '02',
    title: 'Compute',
    body: 'A deterministic core turns your own data and public science into verdicts. The same inputs always give the same answer, and “unknown” is a legal one.',
    icon: 'code',
  },
  {
    n: '03',
    title: 'Say it plainly',
    body: 'One line of truth, a clock per thing that matters, and the source one tap away. AI may phrase and translate; it never decides.',
    icon: 'book',
  },
];

function HowItWorks(): ReactNode {
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHead
        eyebrow="How it works"
        icon="bolt"
        title="Physics, not timers."
        lead="Other apps start a countdown. Afterglow models your fridge, your home and your medicine, and fails closed when it does not know."
      />
      <ol className="m-0 mt-14 grid list-none gap-4 p-0 lg:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} as="li" delay={i * 100}>
            <div className="card flex h-full flex-col gap-5 p-7">
              <div className="flex items-center justify-between">
                <span className="flex size-12 items-center justify-center rounded-2xl border border-ring bg-control-primary text-control-label">
                  <Icon name={s.icon} size={24} />
                </span>
                <span className="clock text-[40px] leading-none text-muted">{s.n}</span>
              </div>
              <h3 className="m-0 font-display text-[30px] font-medium text-emphasis">{s.title}</h3>
              <p className="m-0 text-label text-secondary">{s.body}</p>
            </div>
          </Reveal>
        ))}
      </ol>
      <div className="mt-10 flex justify-center">
        <CtaLink to="/how-it-works" variant="secondary" icon="arrowRight">
          Read how it works
        </CtaLink>
      </div>
    </section>
  );
}

const PROMISES: readonly { title: string; body: string; icon: IconName }[] = [
  {
    title: 'Senses stay in RAM',
    body: 'Raw audio and camera frames are read and dropped. They are never stored and never sent.',
    icon: 'mic',
  },
  {
    title: 'Your street, not your door',
    body: 'Location leaves the phone only as a 1 km cell, and a cell is shown only with five or more devices.',
    icon: 'map',
  },
  {
    title: 'Zero-knowledge accounts',
    body: 'Your household is encrypted on the device. The server keeps ciphertext it cannot read.',
    icon: 'key',
  },
  {
    title: 'Works with no network',
    body: 'Every clock and every answer runs offline. The app installs and opens without a connection.',
    icon: 'cloudOff',
  },
];

function Privacy(): ReactNode {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="container-x grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="lg:sticky lg:top-28">
          <SectionHead
            eyebrow="Private by construction"
            icon="shield"
            title="Built so it cannot spy on you."
            lead="Not a policy you have to trust: rules in the code, checked by property tests on every change."
          />
          <Reveal className="mt-8">
            <CtaLink to="/science" variant="secondary" icon="arrowRight">
              The science and the privacy model
            </CtaLink>
          </Reveal>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PROMISES.map((p, i) => (
            <Reveal key={p.title} delay={(i % 2) * 90}>
              <div className="card flex h-full flex-col gap-4 p-6">
                <span className="flex size-11 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-emphasis">
                  <Icon name={p.icon} size={22} />
                </span>
                <h3 className="m-0 text-headline font-bold text-emphasis">{p.title}</h3>
                <p className="m-0 text-label text-secondary">{p.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function MeetWisp(): ReactNode {
  return (
    <section className="container-x py-12">
      <Reveal>
        <div className="card relative overflow-hidden p-8 sm:p-12 lg:p-16">
          <div
            aria-hidden="true"
            className="halo absolute -top-1/3 -right-1/4 h-[160%] w-[70%] opacity-80"
          />
          <div className="relative grid items-center gap-10 lg:grid-cols-[auto_1fr_auto]">
            <div className="flex justify-center">
              <GhostGlyph opacity={1} size={120} />
            </div>
            <div className="flex flex-col gap-4 text-center lg:text-left">
              <Eyebrow icon="sparkle">Meet Wisp</Eyebrow>
              <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.02em] text-emphasis">
                A ghost who is scared of bright screens.
              </h2>
              <p className="m-0 max-w-[56ch] text-lead text-secondary">
                Wisp turns off the lights and walks you through one night in about ninety seconds.
                Wisp has jokes, but never numbers of its own: every figure it says is the app’s.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <CtaLink to="/app?tour=1" icon="play">
                Start the tour
              </CtaLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Organisations(): ReactNode {
  const cards: readonly { id: string; title: string; who: string; body: string; icon: IconName }[] =
    [
      {
        id: 'business',
        title: 'Afterglow Business',
        who: 'Pharmacies, clinics, shops, shelters',
        body: 'Cold-chain logs per fridge, excursion decisions with citations, a public “open and lit” status, and a claim package for insurers.',
        icon: 'building',
      },
      {
        id: 'beacon',
        title: 'Afterglow Beacon',
        who: 'Cities, utilities, relief organisations',
        body: 'The live crowd map with aggregates only, outage history and equity analysis, advisories by cell, and coordination for volunteers.',
        icon: 'radio',
      },
    ];
  return (
    <section className="container-x py-24 sm:py-32">
      <SectionHead
        eyebrow="For organisations"
        icon="building"
        title="The same truth, for the people who keep a city running."
      />
      <div className="mt-14 grid gap-4 lg:grid-cols-2">
        {cards.map((c, i) => (
          <Reveal key={c.id} delay={i * 100}>
            <Link
              to={`/organisations#${c.id}`}
              className="card card-hover group flex h-full flex-col gap-5 p-7 no-underline sm:p-9"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-14 items-center justify-center rounded-2xl border border-ring bg-control-primary text-control-label">
                  <Icon name={c.icon} size={26} />
                </span>
                <span className="text-secondary transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">
                  <Icon name="arrowUpRight" size={26} />
                </span>
              </div>
              <div>
                <h3 className="m-0 font-display text-[34px] font-medium text-emphasis">
                  {c.title}
                </h3>
                <p className="m-0 mt-1 text-label text-secondary">{c.who}</p>
              </div>
              <p className="m-0 text-label text-primary">{c.body}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FinalCta(): ReactNode {
  return (
    <section className="container-x pt-12">
      <Reveal>
        <div className="relative overflow-hidden rounded-[36px] border border-ring bg-surface-2 px-6 py-16 text-center sm:px-12 sm:py-24">
          <div
            aria-hidden="true"
            className="halo absolute bottom-[-60%] left-1/2 h-[160%] w-[110%] -translate-x-1/2 opacity-90"
          />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-7">
            <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.025em] text-emphasis">
              Be ready before the dark.
            </h2>
            <p className="m-0 max-w-[52ch] text-lead text-secondary">
              Set up your fridge, your home and your people in five minutes, in a lit room. Then
              forget about it until the night you need it.
            </p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <CtaLink to="/signup" icon="arrowRight">
                Create a free account
              </CtaLink>
              <CtaLink to="/app" variant="secondary">
                Use it without an account
              </CtaLink>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

export function Home(): ReactNode {
  return (
    <>
      <Hero />
      <SourceStrip />
      <Questions />
      <Bento />
      <NightVision />
      <HowItWorks />
      <Privacy />
      <MeetWisp />
      <Organisations />
      <FinalCta />
    </>
  );
}
