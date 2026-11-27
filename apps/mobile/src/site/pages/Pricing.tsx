import { type ReactNode, useId, useState } from 'react';
import { Icon } from '../../ui/icons';
import { CtaLink, Reveal, SectionHead, cx } from '../../ui/kit';
import { CtaBand, PageHero } from './Features';

/**
 * Pricing (web-experience WX-12): safety is free, forever, in every region.
 * Paid tiers buy convenience, households, businesses and institutions. Prices
 * are indicative and set regionally by purchasing-power parity.
 */

/** A tier line: a plain string is available today; `planned` marks one that is not built yet. */
type Feature = string | { readonly text: string; readonly planned: true };

interface Tier {
  name: string;
  who: string;
  price: string;
  unit: string;
  features: readonly Feature[];
  cta: { to: string; label: string };
  featured?: boolean;
}

const TIERS: readonly Tier[] = [
  {
    name: 'Free',
    who: 'Everyone, everywhere',
    price: '$0',
    unit: 'forever, without ads',
    featured: true,
    features: [
      'Every safety module: Grid Sense, Lantern map, Séance, food clocks, hours of safety, CO ward, and medicine clocks once a pharmacist signs the table',
      'Alerts and the guidance library',
      'Up to 5 people on your roster',
      '30 days of outage history',
      'Works offline, with or without an account',
    ],
    cta: { to: '/signup', label: 'Create a free account' },
  },
  {
    name: 'Plus',
    who: 'Households that want more',
    price: '≈ $2',
    unit: 'per month, regionally priced',
    features: [
      'Unlimited roster',
      'Full history and reports',
      'Food inventory for every fridge and freezer',
      { text: 'Smart-home and sensor integrations', planned: true },
      { text: 'Custom Séance phrases', planned: true },
    ],
    cta: { to: '/signup', label: 'Start free, upgrade later' },
  },
  {
    name: 'Family',
    who: 'Households and guardians',
    price: '≈ $4',
    unit: 'per month',
    features: [
      { text: 'Plus for up to 6 people', planned: true },
      'Dependents and their guardians',
      'Guardian escalation',
    ],
    cta: { to: '/signup', label: 'Start free, upgrade later' },
  },
];

const ORG_TIERS: readonly Tier[] = [
  {
    name: 'Business',
    who: 'Shops, pharmacies, clinics',
    price: '≈ $15',
    unit: 'per site, per month',
    features: [
      'Multi-site console',
      'Cold-chain logs and reports',
      'Generator management',
      'Public “open and lit” status',
    ],
    cta: { to: '/organisations#business', label: 'About Business' },
  },
  {
    name: 'Beacon',
    who: 'Municipalities, utilities, NGOs',
    price: 'Annual',
    unit: 'licence by population or sites',
    features: [
      'Regional live map, aggregates only',
      'History and analytics',
      'Advisories by area',
      'API and exports',
    ],
    cta: { to: '/organisations#beacon', label: 'About Beacon' },
  },
  {
    name: 'Platform',
    who: 'Developers and partners',
    price: 'Usage',
    unit: 'API by volume; open data free',
    features: [
      'Public crowd cells, k ≥ 5',
      'Lit places and the forecast',
      { text: 'Webhooks for partners', planned: true },
    ],
    cta: { to: '/organisations#api', label: 'About the API' },
  },
];

function TierCard({ t, delay }: { t: Tier; delay: number }): ReactNode {
  return (
    <Reveal delay={delay} className="h-full">
      <article
        className={cx(
          'card relative flex h-full flex-col gap-6 overflow-hidden p-7',
          t.featured && 'border-ring bg-surface-2',
        )}
      >
        {t.featured ? (
          <>
            <div
              aria-hidden="true"
              className="halo absolute -top-1/2 left-1/2 h-full w-[120%] -translate-x-1/2 opacity-70"
            />
            <span className="relative self-start rounded-full border border-ring bg-control-primary px-3 py-1 text-caption font-bold text-control-label">
              Safety is free
            </span>
          </>
        ) : null}
        <div className="relative">
          <h3 className="m-0 font-display text-[30px] font-medium text-emphasis">{t.name}</h3>
          <p className="m-0 mt-1 text-caption text-secondary">{t.who}</p>
        </div>
        <div className="relative flex flex-wrap items-baseline gap-x-2">
          <span className="font-display text-[48px] leading-none text-emphasis">{t.price}</span>
          <span className="text-caption text-secondary">{t.unit}</span>
        </div>
        <ul className="relative m-0 flex flex-1 list-none flex-col gap-3 p-0 text-label text-primary">
          {t.features.map((f) => {
            const text = typeof f === 'string' ? f : f.text;
            const planned = typeof f !== 'string';
            return (
              <li key={text} className="flex items-start gap-3">
                <span className={cx('mt-1 flex-none', planned ? 'text-muted' : 'text-emphasis')}>
                  <Icon name={planned ? 'clock' : 'check'} size={18} />
                </span>
                <span className={cx('min-w-0', planned && 'text-secondary')}>
                  {text}
                  {planned ? (
                    <span className="ml-2 inline-block rounded-full border border-hairline px-2 align-middle text-caption text-secondary">
                      Planned
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <CtaLink
          to={t.cta.to}
          variant={t.featured ? 'primary' : 'secondary'}
          className="relative w-full"
        >
          {t.cta.label}
        </CtaLink>
      </article>
    </Reveal>
  );
}

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Will a safety feature ever move behind a paywall?',
    a: 'No. Everything a person needs to stay safe in an outage is free forever, in every region, without ads. Paid tiers add convenience, more people and organisation tools.',
  },
  {
    q: 'Do I need an account?',
    a: 'No. Every clock and every answer works as a guest, offline, on your device. An account encrypts your household and keeps it in step across your phones.',
  },
  {
    q: 'Why are the prices marked as approximate?',
    a: 'Prices are set by purchasing-power parity, so a month of Plus costs a fair amount locally. The figures here are indicative, in US dollars.',
  },
  {
    q: 'Can Afterglow read my household data?',
    a: 'No. It is encrypted on your device with a key derived from your passphrase. The server keeps only ciphertext. If you lose both the passphrase and the recovery code, nobody can recover it, including us.',
  },
  {
    q: 'Is the code open?',
    a: 'Yes. The client, the core and the services are open source under Apache-2.0, and so is the pipeline a medicine table must pass. No table has been signed by a pharmacist yet, so the app gives no medicine clocks.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }): ReactNode {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-b border-hairline last:border-b-0">
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-16 w-full items-center justify-between gap-4 bg-transparent px-5 py-4 text-left text-label font-bold text-primary transition-colors hover:text-emphasis sm:px-7"
        >
          <span className="min-w-0">{q}</span>
          <span
            className={cx(
              'flex-none text-secondary transition-transform duration-300 ease-out',
              open && 'rotate-180',
            )}
          >
            <Icon name="chevronDown" size={22} />
          </span>
        </button>
      </h3>
      <div id={id} hidden={!open} className="animate-rise px-5 pb-6 sm:px-7">
        <p className="m-0 max-w-[70ch] text-label text-secondary">{a}</p>
      </div>
    </div>
  );
}

export function PricingPage(): ReactNode {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        icon="heart"
        title={
          <>
            Safety is <span className="text-ember italic">free.</span> Forever.
          </>
        }
        lead="Every feature you need to stay safe in an outage costs nothing, in every region, with no ads. Households, businesses and institutions pay for convenience and scale."
      >
        <CtaLink to="/app" icon="arrowRight">
          Use it now, free
        </CtaLink>
      </PageHero>

      <section className="container-x pb-20 sm:pb-28">
        <div className="grid gap-4 lg:grid-cols-3">
          {TIERS.map((t, i) => (
            <TierCard key={t.name} t={t} delay={i * 90} />
          ))}
        </div>
        <p className="m-0 mt-8 text-caption text-secondary">
          Paid tiers are not on sale yet. Everything in Free works today; lines marked Planned are
          not built.
        </p>
      </section>

      <section className="border-y border-hairline bg-surface-1 py-20 sm:py-28">
        <div className="container-x">
          <SectionHead
            eyebrow="For organisations"
            icon="building"
            title="Tools for the people who keep a city running."
          />
          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {ORG_TIERS.map((t, i) => (
              <TierCard key={t.name} t={t} delay={i * 90} />
            ))}
          </div>
          <p className="m-0 mt-8 text-caption text-secondary">
            All prices are indicative and set regionally by purchasing-power parity. Paid tiers are
            not on sale yet; lines marked Planned are not built.
          </p>
        </div>
      </section>

      <section className="container-x py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHead eyebrow="Questions" icon="help" title="The fine print, in plain words." />
          <Reveal>
            <div className="card overflow-hidden">
              {FAQ.map((f) => (
                <FaqItem key={f.q} q={f.q} a={f.a} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <CtaBand
        title="Be ready before the dark."
        lead="Set up your fridge, your home and your people in five minutes. It costs nothing."
      >
        <CtaLink to="/signup" icon="arrowRight">
          Create a free account
        </CtaLink>
        <CtaLink to="/app" variant="secondary">
          Use it without an account
        </CtaLink>
      </CtaBand>
    </>
  );
}
