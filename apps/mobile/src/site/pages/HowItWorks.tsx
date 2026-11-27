import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../ui/icons';
import { CtaLink, Eyebrow, Reveal, SectionHead, cx } from '../../ui/kit';
import { CtaBand, PageHero } from './Features';

/**
 * How it works (web-experience WX-09): the pipeline from senses to plain words,
 * the AI boundary, one night step by step, and how it was built with Kiro.
 */

const PIPELINE: readonly { n: string; title: string; body: string; icon: IconName; out: string }[] =
  [
    {
      n: '01',
      title: 'Sense',
      icon: 'wave',
      body: 'The phone listens for the 50 or 60 Hz mains hum, watches for lighting flicker and notices the charger edge. Your fridge, home and people come from what you told it.',
      out: 'votes: present, absent, or no vote',
    },
    {
      n: '02',
      title: 'Fuse',
      icon: 'people',
      body: 'Votes combine by fixed rules. Absent needs two senses to agree, or one sense corroborated by at least five neighbouring devices. Anything less is unknown.',
      out: 'present · absent · unknown',
    },
    {
      n: '03',
      title: 'Compute',
      icon: 'code',
      body: 'A pure, deterministic core turns verdicts and your data into clocks: discard times, hours of safety, medicine budgets, map cells, restoration bands. Same inputs, same answer, every time.',
      out: 'a number, its band, and its sources',
    },
    {
      n: '04',
      title: 'Say it plainly',
      icon: 'book',
      body: 'One line of truth, a costume that carries the number, and “How I know” one tap away. Where a default was used, it says so.',
      out: '“Fridge: 2 h 46 m left”',
    },
  ];

const NIGHT: readonly { when: string; title: string; body: string; icon: IconName }[] = [
  {
    when: 'The moment it goes',
    title: 'Lights out',
    icon: 'boltOff',
    body: 'The screen fades to black and lands in Night mode. One long buzz. Grid Sense has two senses agreeing, and the clocks start for your fridge, freezer, medicines and home.',
  },
  {
    when: 'During',
    title: 'The dark, measured',
    icon: 'tombstone',
    body: 'Tombstones darken as food windows run out. Ghosts solidify as your people check in, by network or by light. The Lantern map shows whether it is your street or the district.',
  },
  {
    when: 'Restoration',
    title: 'Coming back',
    icon: 'bolt',
    body: 'Neighbours’ chargers resume, a cell turns to “coming back”, often before the utility says so. Two short buzzes when your own power returns; the app returns to Ember.',
  },
  {
    when: 'After',
    title: 'The record',
    icon: 'chart',
    body: 'The outage joins your history: how long, what was promised, what had to go, who checked in. Share it, print it, or keep it for a claim.',
  },
];

const AI_MAY = [
  'Propose medicine budgets from label text, for a validator and a pharmacist to approve',
  'Draft translations and phrase answers from the cited guidance library',
  'Summarise an outage report you choose to share',
];
const AI_NEVER = [
  'Decide whether the power is on or off',
  'Set a discard time, a medicine budget or hours of safety',
  'Publish a map cell or send an alert on its own authority',
  'Answer outside the cited corpus',
];

const KIRO: readonly { title: string; body: string; icon: IconName; path: string }[] = [
  {
    title: 'Specs',
    icon: 'book',
    body: 'Each module has requirements with EARS ids, a design and tasks. The ids name the property tests that prove them.',
    path: '.kiro/specs',
  },
  {
    title: 'Steering',
    icon: 'shield',
    body: 'The invariants, written once and always included: night vision, fail closed, privacy by aggregation, label-only medicine.',
    path: '.kiro/steering',
  },
  {
    title: 'Hooks',
    icon: 'bolt',
    body: 'Deny gates for publishing, dialling and formulary writes; a luminance check on every token save; verification after each task.',
    path: '.kiro/hooks',
  },
  {
    title: 'Property tests',
    icon: 'check',
    body: 'Properties are the definition of done. When a property finds a counterexample, it is recorded the same day.',
    path: 'docs/kiro/pbt-catches.md',
  },
];

const REPO = 'https://github.com/rogerjeasy/afterglow';

export function HowItWorksPage(): ReactNode {
  return (
    <>
      <PageHero
        eyebrow="How it works"
        icon="bolt"
        title={
          <>
            Physics, <span className="text-ember italic">not timers.</span>
          </>
        }
        lead="Afterglow does not start a countdown and hope. It senses, models and computes, from your own data and public science, and says “unknown” when it does not know."
      >
        <CtaLink to="/app?phase=outage&elapsed=45" icon="boltOff">
          Jump into a blackout
        </CtaLink>
        <CtaLink to="/science" variant="secondary">
          The science behind it
        </CtaLink>
      </PageHero>

      <section className="container-x py-20 sm:py-28">
        <SectionHead
          eyebrow="The pipeline"
          icon="code"
          title="From a quiet hum to one line of truth."
          lead="Four steps, each one testable. Nothing on the verdict path is a guess, and nothing on it is AI."
        />
        <ol className="m-0 mt-14 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-4">
          {PIPELINE.map((s, i) => (
            <Reveal key={s.n} as="li" delay={i * 90}>
              <div className="card relative flex h-full flex-col gap-5 p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-12 items-center justify-center rounded-2xl border border-ring bg-control-primary text-control-label">
                    <Icon name={s.icon} size={24} />
                  </span>
                  <span className="clock text-[36px] leading-none text-muted">{s.n}</span>
                </div>
                <h3 className="m-0 font-display text-[30px] font-medium text-emphasis">
                  {s.title}
                </h3>
                <p className="m-0 flex-1 text-label text-secondary">{s.body}</p>
                <div className="clock rounded-xl border border-hairline bg-surface-2 px-3 py-2 text-caption text-primary [overflow-wrap:anywhere]">
                  {s.out}
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden border-y border-hairline bg-surface-1 py-20 sm:py-28">
        <div
          aria-hidden="true"
          className="dot-grid absolute inset-0 opacity-50 [mask-image:linear-gradient(180deg,transparent,black_30%,black_70%,transparent)]"
        />
        <div className="container-x relative grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <SectionHead
            eyebrow="Fail closed"
            icon="shield"
            title="“Unknown” is a legal answer."
            lead="Every function that can be unsure may say so. A clock never runs longer than its source, a cell below five devices is never shown, and a medicine not in the approved table gets no clock at all."
          />
          <Reveal>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { k: 'Grid', v: 'unknown', n: 'one sense, no neighbours' },
                { k: 'Map cell', v: 'unknown', n: '3 of 5 devices' },
                { k: 'Insulin', v: 'no clock', n: 'not in the table' },
              ].map((x) => (
                <div
                  key={x.k}
                  className="flex flex-col gap-2 rounded-[22px] border border-dashed border-muted bg-bg p-5"
                >
                  <span className="text-caption text-secondary">{x.k}</span>
                  <span className="clock text-[24px] leading-tight text-emphasis">{x.v}</span>
                  <span className="text-caption text-secondary">{x.n}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-x py-20 sm:py-28">
        <SectionHead
          eyebrow="The AI boundary"
          icon="sparkle"
          title="AI may help. It never decides."
          lead="Afterglow uses Claude to phrase answers and draft proposals. A validator and a human stand between any proposal and anything the product trusts."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <div className="card flex h-full flex-col gap-5 p-7">
              <h3 className="m-0 flex items-center gap-3 text-headline font-bold text-emphasis">
                <span className="flex size-10 items-center justify-center rounded-xl border border-hairline bg-surface-2">
                  <Icon name="check" size={20} />
                </span>
                AI may
              </h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-label text-primary">
                {AI_MAY.map((x) => (
                  <li key={x} className="flex gap-3">
                    <span className="mt-1 flex-none text-secondary">
                      <Icon name="arrowRight" size={18} />
                    </span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="card flex h-full flex-col gap-5 border-ring p-7">
              <h3 className="m-0 flex items-center gap-3 text-headline font-bold text-emphasis">
                <span className="flex size-10 items-center justify-center rounded-xl border border-ring bg-control-primary text-control-label">
                  <Icon name="close" size={20} />
                </span>
                AI may never
              </h3>
              <ul className="m-0 flex list-none flex-col gap-3 p-0 text-label text-primary">
                {AI_NEVER.map((x) => (
                  <li key={x} className="flex gap-3">
                    <span className="mt-1 flex-none text-emphasis">
                      <Icon name="close" size={18} />
                    </span>
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="container-x py-20 sm:py-28">
        <SectionHead
          eyebrow="One night"
          icon="moon"
          title="What happens, from the first second to the morning after."
        />
        <ol className="relative m-0 mt-14 list-none p-0">
          <span
            aria-hidden="true"
            className="absolute top-2 bottom-2 left-[23px] w-px bg-hairline sm:left-[27px]"
          />
          {NIGHT.map((s, i) => (
            <Reveal
              key={s.title}
              as="li"
              delay={i * 60}
              className="relative pb-10 pl-16 last:pb-0 sm:pl-20"
            >
              <span
                className={cx(
                  'absolute top-0 left-0 flex size-12 items-center justify-center rounded-2xl border sm:size-14',
                  i === 0
                    ? 'border-ring bg-control-primary text-control-label'
                    : 'border-hairline bg-surface-2 text-emphasis',
                )}
              >
                <Icon name={s.icon} size={24} />
              </span>
              <div className="card flex flex-col gap-3 p-6 sm:p-7">
                <span className="text-caption text-secondary">{s.when}</span>
                <h3 className="m-0 font-display text-[28px] font-medium text-emphasis">
                  {s.title}
                </h3>
                <p className="m-0 max-w-[70ch] text-label text-primary">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden border-y border-hairline bg-surface-1 py-20 sm:py-28">
        <div
          aria-hidden="true"
          className="halo-soft absolute top-0 right-[-20%] h-full w-[70%] opacity-70"
        />
        <div className="container-x relative">
          <SectionHead
            eyebrow="Built with Kiro"
            icon="code"
            title="Specs first, invariants always, properties as the definition of done."
            lead="Afterglow was built spec by spec in Kiro. Every rule on this page lives in the repository, where an agent reads it before it writes a line."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {KIRO.map((k, i) => (
              <Reveal key={k.title} delay={i * 80}>
                <a
                  href={`${REPO}/tree/main/${k.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="card card-hover group flex h-full flex-col gap-4 p-6 no-underline"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex size-11 items-center justify-center rounded-xl border border-hairline bg-surface-2 text-emphasis">
                      <Icon name={k.icon} size={22} />
                    </span>
                    <span className="text-secondary transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                      <Icon name="arrowUpRight" size={20} />
                    </span>
                  </div>
                  <h3 className="m-0 text-headline font-bold text-emphasis">{k.title}</h3>
                  <p className="m-0 flex-1 text-label text-secondary">{k.body}</p>
                  <span className="clock text-caption text-muted [overflow-wrap:anywhere]">
                    {k.path}
                  </span>
                </a>
              </Reveal>
            ))}
          </div>
          <Reveal className="mt-10">
            <Eyebrow icon="arrowUpRight">
              <a
                href={`${REPO}/tree/main/.kiro`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary no-underline"
              >
                Browse the .kiro directory on GitHub
              </a>
            </Eyebrow>
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="Watch it work, in the dark."
        lead="The demo opens a labelled household in the middle of an outage. Nothing is saved or sent."
      >
        <CtaLink to="/app?phase=outage&elapsed=45" icon="boltOff">
          Jump into a blackout
        </CtaLink>
        <CtaLink to="/app?tour=1" variant="secondary">
          Take the tour
        </CtaLink>
      </CtaBand>
    </>
  );
}
