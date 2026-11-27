import type { LuminanceMode } from '@afterglow/design-system';
import type { ReactNode } from 'react';
import { GhostGlyph } from '../night-shell/costume';
import { Link } from '../router';
import { Icon, type IconName } from '../ui/icons';
import { CtaLink, Eyebrow, Reveal, SectionHead, cx } from '../ui/kit';
import { setSiteMode, useSiteMode } from './SiteLayout';
import {
  FlashCode,
  FridgeCheckVisual,
  HeroPhone,
  MiniCandles,
  MiniGraveyard,
  MiniMap,
} from './visuals';

/**
 * The homepage (web-experience WX-04). Five beats and no repeats: what this is, the
 * questions it answers (each with its tab), why red on black, where to go deeper, and
 * what to tap next. Everything else lives on its own page.
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
            Afterglow is a blackout companion. It counts down what is still safe in your own fridge,
            forecasts how cold your home will get tonight, hears from your people without a network,
            and stays readable in pitch dark without stealing your night vision.
          </p>
          <div className="flex w-full animate-rise flex-col gap-3 [animation-delay:240ms] sm:w-auto sm:flex-row">
            <CtaLink to="/app?tour=1" icon="arrowRight">
              Take the tour with Wisp
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
  'CDC',
  'US CPSC',
  'NREL ResStock',
  'Open-Meteo',
  'OpenStreetMap',
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

/**
 * The problem and the product in one pass: each card is a question people have in
 * the dark, answered by the part of the app that answers it, with a live miniature.
 */
function Answers(): ReactNode {
  return (
    <section className="relative py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="halo-soft absolute top-1/4 left-1/2 -z-10 h-[60%] w-[80%] -translate-x-1/2 opacity-60"
      />
      <div className="container-x">
        <SectionHead
          eyebrow="The problem"
          icon="boltOff"
          title="When the lights go out, the questions start."
          lead="Outage apps answer one question: when will the power come back? Afterglow answers the ones you have while you sit in the dark. Every spooky thing in it is a measurement."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Reveal className="lg:col-span-4">
            <Answer
              q="Can I still eat the chicken?"
              tab="Cold"
              title="A tombstone for every fridge."
              body="USDA rules for 661 foods and a model of your own fridge: the epitaph is the time left. Have a thermometer? Check the model against it, and what you measure can only make the clock shorter."
              big
            >
              <FridgeCheckVisual className="max-w-[340px] flex-none" />
            </Answer>
          </Reveal>
          <Reveal delay={80} className="lg:col-span-2">
            <Answer
              q="How cold will it get tonight?"
              tab="Plan"
              title="The Graveyard Shift."
              body="Building physics and the outdoor temperature give a band, with a headstone where your home crosses the danger line."
            >
              <MiniGraveyard className="mt-auto" />
            </Answer>
          </Reveal>
          <Reveal className="lg:col-span-2">
            <Answer
              q="Is my mother okay?"
              tab="Séance"
              title="Ghosts until they check in."
              body="When the network is down too, “I am safe” travels as light from one screen to another phone’s camera."
            >
              <FlashCode className="mt-auto" />
            </Answer>
          </Reveal>
          <Reveal delay={80} className="lg:col-span-2">
            <Answer
              q="Is it just my house?"
              tab="Lantern"
              title="Your neighbourhood, lit or dark."
              body="Phones and people report, and a ~1 km cell appears only when at least five devices back it, so no house is ever singled out."
            >
              <MiniMap className="mt-auto w-full max-w-[220px]" />
            </Answer>
          </Reveal>
          <Reveal delay={160} className="lg:col-span-2">
            <Answer
              q="What can my battery keep running?"
              tab="Plan"
              title="Candles, and a ward."
              body="Medical devices first, then light and phones. The generator stays off until the carbon-monoxide checks pass."
            >
              <div className="mt-auto">
                <MiniCandles />
              </div>
            </Answer>
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

function Answer({
  q,
  tab,
  title,
  body,
  big = false,
  children,
}: {
  q: string;
  tab: string;
  title: string;
  body: string;
  big?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <article
      className={cx(
        'card card-hover flex h-full flex-col gap-4 overflow-hidden p-6 sm:p-7',
        big && 'md:flex-row md:items-center md:gap-8',
      )}
    >
      <div className="flex flex-1 flex-col gap-3">
        <p className="m-0 font-display text-[24px] leading-tight font-medium text-emphasis italic">
          {q}
        </p>
        <h3 className="m-0 text-headline font-bold text-primary">{title}</h3>
        <p className="m-0 text-label text-secondary">{body}</p>
        <span className="text-caption text-muted">Answered in {tab}</span>
      </div>
      {children}
    </article>
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

const DEEPER: readonly { to: string; title: string; body: string; icon: IconName }[] = [
  {
    to: '/how-it-works',
    title: 'Physics, not timers',
    body: 'Sense, fuse, compute, say it plainly. Nothing on the verdict path is a guess or an AI.',
    icon: 'bolt',
  },
  {
    to: '/science#privacy',
    title: 'Private by construction',
    body: 'Senses stay in memory, location leaves only as a 1 km cell, accounts are zero-knowledge.',
    icon: 'shield',
  },
  {
    to: '/organisations',
    title: 'For organisations',
    body: 'Clinics publish “open and lit”, cities send advisories, feature phones dial in. Aggregates only.',
    icon: 'building',
  },
];

/** Three doors to the pages that go deeper, instead of repeating them here. */
function Deeper(): ReactNode {
  return (
    <section aria-label="Go deeper" className="container-x py-16 sm:py-20">
      <div className="grid gap-4 md:grid-cols-3">
        {DEEPER.map((d, i) => (
          <Reveal key={d.to} delay={i * 80} className="h-full">
            <Link
              to={d.to}
              className="card card-hover group flex h-full items-start gap-4 p-6 no-underline"
            >
              <span className="flex size-11 flex-none items-center justify-center rounded-xl border border-hairline bg-surface-2 text-emphasis">
                <Icon name={d.icon} size={22} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-center justify-between gap-2 text-headline font-bold text-emphasis">
                  {d.title}
                  <span className="text-secondary transition-transform duration-300 group-hover:translate-x-1">
                    <Icon name="arrowRight" size={20} />
                  </span>
                </span>
                <span className="text-label text-secondary">{d.body}</span>
              </span>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/** The close: Wisp offers the tour; the app is one tap away, no account needed. */
function Close(): ReactNode {
  return (
    <section className="container-x pt-4">
      <Reveal>
        <div className="relative overflow-hidden rounded-[36px] border border-ring bg-surface-2 px-6 py-14 text-center sm:px-12 sm:py-20">
          <div
            aria-hidden="true"
            className="halo absolute bottom-[-60%] left-1/2 h-[160%] w-[110%] -translate-x-1/2 opacity-90"
          />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6">
            <GhostGlyph opacity={1} size={88} />
            <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.025em] text-emphasis">
              Let Wisp show you one night.
            </h2>
            <p className="m-0 max-w-[52ch] text-lead text-secondary">
              Wisp is a ghost who is scared of bright screens. It turns off the lights and walks you
              through an outage, tab by tab. Jokes, yes; numbers of its own, never.
            </p>
            <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
              <CtaLink to="/app?tour=1" icon="play">
                Start the tour
              </CtaLink>
              <CtaLink to="/app" variant="secondary">
                Open the app, no account needed
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
      <Answers />
      <NightVision />
      <Deeper />
      <Close />
    </>
  );
}
