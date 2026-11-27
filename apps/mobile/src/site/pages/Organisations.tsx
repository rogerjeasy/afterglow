import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../ui/icons';
import { CtaLink, Eyebrow, Reveal, SectionHead, cx } from '../../ui/kit';
import { MiniMap } from '../visuals';
import { CtaBand, PageHero, SubNav } from './Features';

/**
 * For organisations (web-experience WX-11): Business, Beacon, Voice and the
 * Platform API, described as they are built today, with the roadmap marked.
 */

interface Product {
  id: string;
  name: string;
  who: string;
  icon: IconName;
  lead: string;
  today: readonly string[];
  next: readonly string[];
  visual: ReactNode;
}

function BusinessVisual(): ReactNode {
  const rows = [
    { f: 'Vaccine fridge', t: '5.2 °C', ok: 'in range' },
    { f: 'Insulin fridge', t: '9.1 °C', ok: 'out of range' },
    { f: 'Generator', t: '12 L', ok: 'logged 19:40' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-ring bg-surface-3 px-4 py-3">
        <span className="text-label font-bold text-emphasis">Open, on backup power</span>
        <span className="text-caption text-secondary">public status</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.f}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-2xl border border-hairline bg-surface-2 px-4 py-3"
        >
          <span className="text-label text-primary">{r.f}</span>
          <span className="flex items-center gap-3">
            <span className="clock text-label text-emphasis">{r.t}</span>
            <span
              className={cx(
                'text-caption',
                r.ok === 'out of range' ? 'text-emphasis' : 'text-secondary',
              )}
            >
              {r.ok}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function VoiceVisual(): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-[260px] flex-col gap-3 rounded-[32px] border border-hairline bg-bg p-4">
      <div className="clock rounded-2xl border border-hairline bg-surface-2 p-4 text-caption leading-relaxed text-primary">
        Area ke7fyj: DARK.
        <br />
        Reported by 12 devices.
        <br />1 Food 2 Meds 3 CO 4 Water
      </div>
      <div aria-hidden="true" className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((k) => (
          <span
            key={k}
            className="clock flex h-11 items-center justify-center rounded-xl border border-hairline bg-surface-1 text-label text-secondary"
          >
            {k}
          </span>
        ))}
      </div>
    </div>
  );
}

const PRODUCTS: readonly Product[] = [
  {
    id: 'business',
    name: 'Afterglow Business',
    who: 'Pharmacies, clinics, shops, shelters and community centres',
    icon: 'building',
    lead: 'Keep your sites, log fridge readings and the generator, tell the neighbourhood whether you are open and powered, and print a cold-chain report.',
    today: [
      'Multiple sites per account, each on the public map',
      'Fridge readings against your own minimum and maximum',
      'Generator log: litres added and running time',
      '“Open and lit” status that people see on the Lantern map',
      'A printable cold-chain report for the night',
    ],
    next: ['Bluetooth fridge sensors', 'Staff roles and an audit trail', 'Insurer claim packages'],
    visual: <BusinessVisual />,
  },
  {
    id: 'beacon',
    name: 'Afterglow Beacon',
    who: 'Municipalities, utilities and relief organisations',
    icon: 'radio',
    lead: 'See the region as the crowd sees it: aggregated cells only, never a device. Look back at the history, find the health facilities near the dark, and send an advisory to the people in selected areas.',
    today: [
      'A live region of 7 by 7 areas, about 1 km each',
      'Dark area-minutes per day, as history',
      'Health facilities near the centre, from OpenStreetMap',
      'Advisories by area, delivered as push alerts',
      'Access granted by the founder to verified organisations only',
    ],
    next: [
      'Utility schedule overlays and adherence',
      'Volunteer coordination',
      'Open-data exports',
    ],
    visual: <MiniMap className="mx-auto max-w-[340px]" />,
  },
  {
    id: 'voice',
    name: 'Afterglow Voice',
    who: 'Anyone with a feature phone',
    icon: 'phone',
    lead: 'The same answers with no smartphone and no data. Dial a menu or text a keyword with the six-character area code from a poster, and get the area’s state and guidance that fits one screen.',
    today: [
      'USSD menus that fit the 182-character screen',
      'SMS keywords: STATUS, FOOD, MEDS, CO, WATER, HELP',
      'Every reply fits a single 160-character text',
      'Nothing about the caller is stored or logged',
    ],
    next: [
      'Short codes in each country, with a local telecom partner',
      'Voice lines in local languages',
    ],
    visual: <VoiceVisual />,
  },
];

export function OrganisationsPage(): ReactNode {
  return (
    <>
      <PageHero
        eyebrow="For organisations"
        icon="building"
        title={
          <>
            The same truth, for those who{' '}
            <span className="text-ember italic">keep a city running.</span>
          </>
        }
        lead="Afterglow Business, Beacon and Voice run on the same crowd cells and the same deterministic core as the household app. Aggregates only, never a device."
      >
        <CtaLink to="/signin" icon="arrowRight">
          Sign in to open the consoles
        </CtaLink>
        <CtaLink to="/pricing" variant="secondary">
          See pricing
        </CtaLink>
      </PageHero>

      <SubNav
        items={[
          { id: 'business', label: 'Business' },
          { id: 'beacon', label: 'Beacon' },
          { id: 'voice', label: 'Voice' },
          { id: 'api', label: 'Platform API' },
        ]}
      />

      {PRODUCTS.map((p, idx) => (
        <section
          key={p.id}
          id={p.id}
          className="container-x scroll-mt-36 border-b border-hairline py-20 last-of-type:border-b-0 sm:py-24"
        >
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <Reveal
              className={cx(
                'flex min-w-0 flex-col items-start gap-5',
                idx % 2 === 1 && 'lg:order-2',
              )}
            >
              <span className="flex size-14 items-center justify-center rounded-2xl border border-ring bg-control-primary text-control-label">
                <Icon name={p.icon} size={26} />
              </span>
              <div>
                <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.02em] text-emphasis">
                  {p.name}
                </h2>
                <p className="m-0 mt-2 text-label text-secondary">{p.who}</p>
              </div>
              <p className="m-0 text-lead text-primary">{p.lead}</p>
              <div className="grid w-full gap-6 sm:grid-cols-[1.4fr_1fr]">
                <div>
                  <h3 className="m-0 mb-3 text-caption font-bold text-primary">Available today</h3>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-label text-primary">
                    {p.today.map((t) => (
                      <li key={t} className="flex items-start gap-3">
                        <span className="mt-1 flex-none text-emphasis">
                          <Icon name="check" size={18} />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="m-0 mb-3 text-caption font-bold text-secondary">On the roadmap</h3>
                  <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-caption text-secondary">
                    {p.next.map((t) => (
                      <li key={t} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex-none">
                          <Icon name="clock" size={16} />
                        </span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Reveal>
            <Reveal delay={100} className={cx('min-w-0', idx % 2 === 1 && 'lg:order-1')}>
              <div className="card relative overflow-hidden p-7 sm:p-10">
                <div aria-hidden="true" className="halo-soft absolute inset-[-20%] opacity-70" />
                <div className="relative">{p.visual}</div>
              </div>
            </Reveal>
          </div>
        </section>
      ))}

      <section id="api" className="container-x scroll-mt-36 py-20 sm:py-24">
        <Reveal>
          <div className="card relative overflow-hidden p-7 sm:p-12">
            <div
              aria-hidden="true"
              className="halo absolute -top-1/2 -right-1/4 h-[160%] w-[60%] opacity-60"
            />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="flex flex-col items-start gap-5">
                <Eyebrow icon="code">Platform API</Eyebrow>
                <h2 className="m-0 font-display text-h2 font-medium tracking-[-0.02em] text-emphasis">
                  Build on the crowd’s map.
                </h2>
                <p className="m-0 max-w-[60ch] text-lead text-secondary">
                  The public API serves the same anonymous, k ≥ 5 cells the app shows, plus lit
                  places and the forecast. It is described in OpenAPI, and the open data is free.
                </p>
                <pre className="clock m-0 w-full max-w-full overflow-x-auto rounded-2xl border border-hairline bg-bg p-4 text-caption text-primary">
                  GET /v1/cells?center=ke7fyj&amp;cols=5&amp;rows=5{'\n'}→ cells under k = 5 devices
                  are “unknown”
                </pre>
              </div>
              <a
                href={`${import.meta.env.BASE_URL}openapi.json`}
                target="_blank"
                rel="noopener noreferrer"
                className="press inline-flex min-h-14 items-center justify-center gap-2.5 self-start rounded-full border border-ring bg-control-primary px-7 text-label font-bold text-control-label no-underline transition-transform duration-200 hover:-translate-y-0.5 lg:self-center"
              >
                Read the OpenAPI
                <Icon name="arrowUpRight" size={22} />
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      <section className="container-x py-12 sm:py-16">
        <SectionHead
          align="center"
          eyebrow="Principles for institutions"
          icon="shield"
          title="Aggregates only. Consent always."
          lead="Organisations see what the crowd sees: cells backed by five or more devices, never a person. Business status is published only by the business itself."
        />
      </section>

      <CtaBand
        title="Open your console."
        lead="Business and Beacon open from your account once it is connected to the Afterglow cloud. Beacon access is granted to verified organisations."
      >
        <CtaLink to="/signin" icon="arrowRight">
          Sign in
        </CtaLink>
        <CtaLink to="/signup" variant="secondary">
          Create an account
        </CtaLink>
      </CtaBand>
    </>
  );
}
