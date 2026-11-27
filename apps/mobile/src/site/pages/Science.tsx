import type { ReactNode } from 'react';
import { Icon, type IconName } from '../../ui/icons';
import { CtaLink, Reveal, SectionHead } from '../../ui/kit';
import { CtaBand, PageHero, SubNav } from './Features';

/**
 * Science and privacy (web-experience WX-10): where every number comes from, the
 * luminance budget, privacy by construction, and the public data behind it all.
 */

const SCIENCE: readonly { title: string; icon: IconName; body: string; source: string }[] = [
  {
    title: 'Food in the fridge and freezer',
    icon: 'tombstone',
    body: 'A lumped thermal model of your own appliance warms toward room temperature with a time constant anchored to USDA guidance: a full freezer holds about 48 hours, half full about 24, a closed fridge about 4. The four-hour clock for perishables starts when the food crosses 4 °C, not when the power goes.',
    source: 'USDA FSIS outage guidance · USDA FoodKeeper',
  },
  {
    title: 'Medicines',
    icon: 'pill',
    body: 'The label is the law. Storage budgets are extracted from label text, checked by a validator against that text, and approved by a licensed pharmacist into a versioned public table. The excursion clock only spends the label’s room-temperature allowance. Not in the table means no clock.',
    source: 'openFDA storage and handling · pharmacist sign-off',
  },
  {
    title: 'Hours of safety',
    icon: 'clock',
    body: 'Your home is a building archetype with a thermal time constant, warmed or cooled by the hourly forecast. The answer is a band and the time your home crosses 15 °C (cold) or 32 °C (heat), stricter for infants, older people and medical needs.',
    source: 'NREL ResStock archetypes · Open-Meteo',
  },
  {
    title: 'Is the power out?',
    icon: 'wave',
    body: 'Mains electricity leaves fingerprints: harmonics at 100/150 Hz or 120/180 Hz in a two-second microphone sample, 100/120 Hz flicker in camera frames, and the charger edge. The method follows GridWatch-style phone sensing and electric-network-frequency research.',
    source: 'GridWatch (Berkeley) · ENF forensics literature',
  },
];

const MODES: readonly {
  mode: string;
  light: string;
  ceiling: string;
  lum: string;
  text: string;
}[] = [
  {
    mode: 'Night',
    light: 'below about 5 lux',
    ceiling: '#A50000',
    lum: '8%',
    text: 'Body text 20 px, weight 600',
  },
  {
    mode: 'Dusk',
    light: 'about 5 to 50 lux',
    ceiling: '#B70000',
    lum: '10%',
    text: 'All text WCAG large',
  },
  {
    mode: 'Ember',
    light: 'lit room, low vision',
    ceiling: '#EB0000 to #FF0000',
    lum: 'AA',
    text: 'AA for normal text',
  },
];

const PRIVACY: readonly { title: string; body: string; icon: IconName }[] = [
  {
    title: 'Senses stay in RAM',
    icon: 'mic',
    body: 'Raw audio, camera and magnetometer data is read in memory and dropped. It is never stored and never leaves the device.',
  },
  {
    title: 'Geohash-6, never coordinates',
    icon: 'map',
    body: 'Location leaves the phone only as a geohash-6 cell, about 1.2 by 0.6 km. Sub-cell precision is never shown to anyone.',
  },
  {
    title: 'Five devices, checked twice',
    icon: 'people',
    body: 'A cell is published only when at least five distinct devices back it. The rule is enforced in the app and re-checked by the API.',
  },
  {
    title: 'A vault only you can open',
    icon: 'key',
    body: 'One passphrase, stretched with PBKDF2 over 600,000 rounds into two secrets: a sign-in secret proven with SRP, so it is never sent, and a vault key that never leaves the device. AWS stores ciphertext only.',
  },
  {
    title: 'Pairing by consent',
    icon: 'shield',
    body: 'Nobody appears on anyone’s list without mutual consent. Roster ids are local to the pair, never global identifiers.',
  },
  {
    title: 'No account needed',
    icon: 'user',
    body: 'Everything works as a guest, offline, on the device. An account adds encryption and sync, not features you need to stay safe.',
  },
];

const SOURCES: readonly { name: string; use: string; where: string }[] = [
  { name: 'USDA FoodKeeper', use: 'Per-food storage and discard rules', where: 'Cold' },
  {
    name: 'USDA FSIS',
    use: 'Outage guidance that anchors the fridge and freezer model',
    where: 'Cold',
  },
  {
    name: 'openFDA drug labels',
    use: 'Storage and handling text behind the medicine table',
    where: 'Cold',
  },
  { name: 'NREL ResStock', use: 'Building thermal constants by archetype', where: 'Plan' },
  {
    name: 'Open-Meteo',
    use: 'Hourly ambient forecast for hours of safety',
    where: 'Plan, Lantern',
  },
  {
    name: 'OpenStreetMap (Overpass)',
    use: 'Hospitals, pharmacies, shelters and water points',
    where: 'Lantern',
  },
  { name: 'OpenCelliD', use: 'Cell tower positions for the signal finder', where: 'Lantern' },
  { name: 'Afterglow crowd cells', use: 'Mains verdicts from phones, k ≥ 5', where: 'Lantern' },
];

export function SciencePage(): ReactNode {
  return (
    <>
      <PageHero
        eyebrow="Science and privacy"
        icon="shield"
        title={
          <>
            Every number <span className="text-ember italic">shows its work.</span>
          </>
        }
        lead="Afterglow’s clocks come from physics and public data, not from timers or guesses. Its privacy comes from how it is built, not from a promise."
      >
        <CtaLink to="/how-it-works" icon="arrowRight">
          How it works
        </CtaLink>
      </PageHero>

      <SubNav
        items={[
          { id: 'science', label: 'The science' },
          { id: 'luminance', label: 'Luminance budget' },
          { id: 'privacy', label: 'Privacy' },
          { id: 'sources', label: 'Data sources' },
        ]}
      />

      <section id="science" className="container-x scroll-mt-36 py-20 sm:py-28">
        <SectionHead
          eyebrow="The science"
          icon="book"
          title="Behind each clock, a model and a citation."
          lead="Tap any number in the app and “How I know” lists every input, with its version. When a default is in play, it says “uses defaults”."
        />
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {SCIENCE.map((s, i) => (
            <Reveal key={s.title} delay={(i % 2) * 90}>
              <article className="card flex h-full flex-col gap-5 p-7">
                <span className="flex size-12 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-emphasis">
                  <Icon name={s.icon} size={24} />
                </span>
                <h3 className="m-0 font-display text-[28px] leading-tight font-medium text-emphasis">
                  {s.title}
                </h3>
                <p className="m-0 flex-1 text-label text-primary">{s.body}</p>
                <span className="self-start rounded-full border border-hairline px-3 py-1 text-caption text-secondary">
                  {s.source}
                </span>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section
        id="luminance"
        className="relative scroll-mt-36 overflow-hidden border-y border-hairline bg-surface-1 py-20 sm:py-28"
      >
        <div
          aria-hidden="true"
          className="dot-grid absolute inset-0 opacity-50 [mask-image:linear-gradient(180deg,transparent,black_30%,black_70%,transparent)]"
        />
        <div className="container-x relative">
          <SectionHead
            eyebrow="The luminance budget"
            icon="eye"
            title="Red light spares your night vision."
            lead="Long-wavelength light barely touches the rods your eyes use in the dark. So Afterglow is one hue on pure black, and each mode has a ceiling no pixel may cross. A pixel scan checks every screen, in every mode."
          />
          <Reveal className="mt-12">
            <div className="overflow-x-auto rounded-[24px] border border-hairline bg-bg">
              <table className="w-full min-w-[640px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline text-caption text-secondary">
                    <th className="px-5 py-4 font-bold">Mode</th>
                    <th className="px-5 py-4 font-bold">When</th>
                    <th className="px-5 py-4 font-bold">Text ceiling</th>
                    <th className="px-5 py-4 font-bold">Luminance</th>
                    <th className="px-5 py-4 font-bold">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {MODES.map((m) => (
                    <tr key={m.mode} className="border-b border-hairline last:border-b-0">
                      <td className="px-5 py-4 font-display text-[24px] text-emphasis">{m.mode}</td>
                      <td className="px-5 py-4 text-label text-primary">{m.light}</td>
                      <td className="clock px-5 py-4 text-label text-primary">{m.ceiling}</td>
                      <td className="clock px-5 py-4 text-label text-emphasis">{m.lum}</td>
                      <td className="px-5 py-4 text-caption text-secondary">{m.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="m-0 mt-4 text-caption text-secondary">
              Red on black under the Night ceiling cannot reach WCAG 4.5:1, so Night trades contrast
              for dark adaptation, and Ember is always one tap away. Amber is the variant for
              protanopia, at the same luminance tiers.
            </p>
          </Reveal>
        </div>
      </section>

      <section id="privacy" className="container-x scroll-mt-36 py-20 sm:py-28">
        <SectionHead
          eyebrow="Privacy by construction"
          icon="lock"
          title="Rules in the code, not lines in a policy."
          lead="Each of these is an invariant the codebase enforces and a property test checks on every change."
        />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIVACY.map((p, i) => (
            <Reveal key={p.title} delay={(i % 3) * 80}>
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
      </section>

      <section id="sources" className="container-x scroll-mt-36 py-12 sm:py-16">
        <SectionHead
          eyebrow="Data sources"
          icon="globe"
          title="Public data, cited where it is used."
        />
        <Reveal className="mt-12">
          <div className="overflow-x-auto rounded-[24px] border border-hairline bg-surface-1">
            <table className="w-full min-w-[620px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline text-caption text-secondary">
                  <th className="px-5 py-4 font-bold">Source</th>
                  <th className="px-5 py-4 font-bold">What Afterglow uses it for</th>
                  <th className="px-5 py-4 font-bold">Shown in</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.name} className="border-b border-hairline last:border-b-0">
                    <td className="px-5 py-4 font-display text-[20px] text-emphasis">{s.name}</td>
                    <td className="px-5 py-4 text-label text-primary">{s.use}</td>
                    <td className="px-5 py-4 text-caption text-secondary">{s.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </section>

      <CtaBand
        title="Open where it matters."
        lead="The client and the sensing core are open source under Apache-2.0, and the medicine table and its provenance are public."
      >
        <a
          href="https://github.com/rogerjeasy/afterglow"
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full border border-ring bg-control-primary px-7 text-label font-bold text-control-label no-underline transition-transform duration-200 hover:-translate-y-0.5"
        >
          Read the source
          <Icon name="arrowUpRight" size={22} />
        </a>
        <CtaLink to="/app" variant="secondary">
          Open the app
        </CtaLink>
      </CtaBand>
    </>
  );
}
