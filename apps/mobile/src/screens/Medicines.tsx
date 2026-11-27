import { formulary, household } from '@afterglow/core';
import { type ReactNode, useMemo, useState } from 'react';
import { useFormulary } from '../data/formulary';
import {
  LABEL_SOURCE,
  type MedicineText,
  medicineText,
  provenanceChips,
} from '../household/present';
import { useHousehold } from '../household/useHousehold';
import { SourceChip } from '../night-shell/components';
import { Button, Notice, SearchField } from '../night-shell/controls';
import { WardCard } from '../night-shell/costume';
import { token } from '../night-shell/theme';
import { Panel } from '../ui/page';

function Badge({ label, loud }: { label: string; loud: boolean }): ReactNode {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        border: `${loud ? 2 : 1}px solid ${loud ? token('focus.ring') : token('hairline')}`,
        color: loud ? token('text.emphasis') : token('text.secondary'),
        fontSize: 'var(--type-caption)',
        letterSpacing: '0.06em',
      }}
    >
      {label}
    </span>
  );
}

/** What the label says, with its provenance. Shown whenever a validated entry stands behind a card. */
function LabelProvenance({ p }: { p: NonNullable<MedicineText['provenance']> }): ReactNode {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {provenanceChips(p).map((c) => (
          <SourceChip key={c} label={c} />
        ))}
      </div>
      <blockquote
        style={{
          margin: '10px 0 0',
          paddingLeft: 12,
          borderLeft: `2px solid ${token('hairline')}`,
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
          overflowWrap: 'anywhere',
        }}
      >
        {p.source.excerpt}
      </blockquote>
      <div
        style={{
          marginTop: 8,
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
          overflowWrap: 'anywhere',
        }}
      >
        {p.disclaimer}
      </div>
      <a
        href={p.source.url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
        }}
      >
        Read the label source
      </a>
    </div>
  );
}

function MedicineCard({
  assessment,
  onRemove,
}: {
  assessment: household.MedicineAssessment;
  onRemove: () => void;
}): ReactNode {
  const text = medicineText(assessment);
  const loud = text.severity >= 3;
  const m = assessment.medicine;
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        border: `1px solid ${token('hairline')}`,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge label={text.label} loud={loud} />
        <span
          style={{
            fontSize: 'var(--type-body)',
            color: token('text.primary'),
            overflowWrap: 'anywhere',
          }}
        >
          {m.product} · {m.condition === 'inUse' ? 'in use' : 'unopened'}
        </span>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 'var(--type-body)',
          color: token('text.emphasis'),
          overflowWrap: 'anywhere',
        }}
      >
        {text.headline}
      </div>
      {text.details.length > 0 ? (
        <ul
          style={{
            margin: '8px 0 0',
            paddingLeft: 20,
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
          }}
        >
          {text.details.map((d) => (
            <li key={d} style={{ overflowWrap: 'anywhere' }}>
              {d}
            </li>
          ))}
        </ul>
      ) : null}
      {assessment.kind === 'notInTable' ? (
        // A closed bar: the ward for a clock the app refuses to invent.
        <div
          aria-hidden="true"
          style={{ height: 6, marginTop: 12, borderRadius: 3, background: token('focus.ring') }}
        />
      ) : null}
      {text.provenance ? <LabelProvenance p={text.provenance} /> : null}
      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <span
          style={{
            alignSelf: 'center',
            fontSize: 'var(--type-caption)',
            color: token('text.secondary'),
          }}
        >
          In the {assessment.applianceName.toLowerCase()}
        </span>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

/**
 * Medicines: the user's list, with a clock only where the pharmacist-approved
 * table has a validated entry. Every state is designed: loading, no table,
 * table loaded and empty, not in table, power on, running, used up, beyond
 * the label, unknown.
 */
export function Medicines({
  nowMs,
  applianceId,
}: {
  nowMs: number;
  applianceId: string | null;
}): ReactNode {
  const { store, state } = useHousehold();
  const { view } = state;
  const table = useFormulary();
  const [query, setQuery] = useState('');
  const loaded = table.kind === 'loaded' ? table.formulary : null;

  const assessments = useMemo(
    () => household.assessMedicines(view, loaded, nowMs),
    [view, loaded, nowMs],
  );
  const results = useMemo(
    () => (loaded ? formulary.searchFormulary(loaded, query, 8) : []),
    [loaded, query],
  );
  const target = view.appliances.find((a) => a.id === applianceId) ?? view.appliances[0] ?? null;

  return (
    <Panel title="Medicines" icon="pill">
      <div className="flex flex-col gap-4">
        {table.kind === 'loading' ? (
          <Notice>Checking for the pharmacist-approved table…</Notice>
        ) : null}

        {table.kind === 'none' ? (
          <WardCard
            title="Pharmacist-approved table"
            refusal="No medicine clock. I will not estimate how long your medicine lasts."
          >
            <div className="text-caption text-secondary">
              {table.reason} Storage limits come only from that table. Ask your pharmacist. This is
              not medical advice.
            </div>
            <SourceChip label={LABEL_SOURCE} />
          </WardCard>
        ) : null}

        {table.kind === 'loaded' && table.formulary.rejected.length > 0 ? (
          <Notice>
            {table.formulary.rejected.length} entr
            {table.formulary.rejected.length === 1 ? 'y' : 'ies'} in the approved table failed
            checks and {table.formulary.rejected.length === 1 ? 'is' : 'are'} not used. Medicines
            that depend on {table.formulary.rejected.length === 1 ? 'it' : 'them'} show no clock.
          </Notice>
        ) : null}

        {assessments.map((a) => (
          <MedicineCard
            key={a.medicine.id}
            assessment={a}
            onRemove={() => store.removeMedicine(a.medicine.id)}
          />
        ))}

        {loaded && assessments.length === 0 ? (
          <Notice>
            No medicines yet. Search the approved table below and add the ones you keep cold. A
            clock appears only for a medicine that is in the table.
          </Notice>
        ) : null}

        {loaded ? (
          target ? (
            <>
              <SearchField
                label="Search the approved table"
                placeholder="start of the product name"
                value={query}
                onChange={setQuery}
              />
              {query.trim().length === 0 ? (
                <Notice>
                  Only products a pharmacist has approved appear here. If yours is missing, ask your
                  pharmacist. I will not guess from a similar product.
                </Notice>
              ) : results.length === 0 ? (
                <Notice>
                  Not in the approved table, so there is no clock. Ask your pharmacist.
                </Notice>
              ) : (
                results.map((e) => (
                  <div
                    key={`${e.product}|${e.condition}`}
                    className="flex flex-wrap items-center gap-3 border-b border-hairline pb-3 last:border-b-0"
                  >
                    <span className="min-w-0 flex-[1_1_160px] text-body text-primary [overflow-wrap:anywhere]">
                      {e.product} · {e.condition === 'inUse' ? 'in use' : 'unopened'}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => store.addMedicine(target.id, e.product, e.condition)}
                    >
                      Add to {target.name.toLowerCase()}
                    </Button>
                  </div>
                ))
              )}
              <SourceChip
                label={
                  table.kind === 'loaded'
                    ? `${LABEL_SOURCE} · table ${table.version}`
                    : LABEL_SOURCE
                }
              />
            </>
          ) : (
            <Notice>
              Add your fridge first. A medicine is kept in one, and its temperature comes from that
              fridge.
            </Notice>
          )
        ) : null}
      </div>
    </Panel>
  );
}
