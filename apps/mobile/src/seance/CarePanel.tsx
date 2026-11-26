import { household } from '@afterglow/core';
import type { ReactNode } from 'react';
import { formatClockTime } from '../format';
import type { HouseholdStore } from '../household/store';
import { ChoiceChip } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * Guardians (product description 7.10, HH-18): for each person, how often they
 * should check in during an outage, and what makes them vulnerable. Two missed
 * check-ins raise the critical alert; a need recorded here offers a stricter home line.
 */

const RHYTHMS: readonly (number | null)[] = [null, 1, 2, 4, 8];
const NEED_WORD: Record<household.CareNeed, string> = {
  infant: 'Baby',
  elderly: 'Over 65',
  medical: 'Medically fragile',
};

export function CarePanel({
  roster,
  store,
}: {
  roster: readonly household.RosterMember[];
  store: HouseholdStore;
}): ReactNode {
  if (roster.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
      <span style={{ fontSize: 'var(--type-body)', color: token('text.emphasis') }}>
        Check-ins and care
      </span>
      <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        During an outage I expect a word from each person at their rhythm. One missed check-in is an
        alert; two is urgent.
      </span>
      {roster.map((m) => {
        const cadence = m.care?.cadenceHours ?? null;
        const needs = m.care?.needs ?? [];
        const set = (c: number | null, n: readonly household.CareNeed[]): void =>
          store.setCare(m.id, c, n);
        return (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
              {m.name}
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RHYTHMS.map((h) => (
                <ChoiceChip
                  key={String(h)}
                  label={h === null ? 'No rhythm' : `Every ${h} h`}
                  selected={cadence === h}
                  onClick={() => set(h, needs)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {household.CARE_NEEDS.map((n) => (
                <ChoiceChip
                  key={n}
                  label={NEED_WORD[n]}
                  selected={needs.includes(n)}
                  onClick={() =>
                    set(cadence, needs.includes(n) ? needs.filter((x) => x !== n) : [...needs, n])
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The row's check-in line during an outage, or null. */
export function checkInLine(c: household.CheckIn | undefined): string | null {
  if (!c) return null;
  if (c.missed >= 2) return `Missed ${c.missed} check-ins.`;
  if (c.missed === 1) return 'Missed a check-in.';
  return `Next check-in due by ${formatClockTime(c.dueMs)}.`;
}
