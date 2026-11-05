import type { ReactNode } from 'react';
import { PrimaryButton, SourceChip, StatusLine, Tile } from '../night-shell/components';
import { token } from '../night-shell/theme';
import type { ScenarioResult } from '../demo/scenario';

/**
 * The Hearth: the one line of truth plus the tiles. Numbers shown here are the
 * demo scenario's; each tile carries a source chip (every number shows its
 * source — fail-closed.md rule 9). The verdict line is driven by the real
 * fusion result, including the honest "unknown" case.
 */

const OUTAGE_SINCE = '20:07';

function verdictLine(scenario: ScenarioResult): { timer: string; line: string } {
  switch (scenario.verdict) {
    case 'absent':
      return {
        timer: 'GRID DOWN 00:07:12',
        line: `${scenario.neighboursAbsent} neighbours lost power at ${OUTAGE_SINCE} · ESP says 22:30 · crowd says 22:50`,
      };
    case 'present':
      return {
        timer: 'POWER ON',
        line: 'Mains present · next load-shedding window 22:00–00:30',
      };
    default:
      return {
        timer: 'LISTENING…',
        line: "I can't tell yet whether the power is out here. Plug in the phone or let me hear the room.",
      };
  }
}

export function Hearth({ scenario }: { scenario: ScenarioResult }): ReactNode {
  const { timer, line } = verdictLine(scenario);
  const dark = scenario.verdict === 'absent';

  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
        minHeight: '100vh',
      }}
    >
      <StatusLine timer={timer} line={line} live={dark} />

      <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        Verdict from Grid Sense fusion:{' '}
        <span style={{ color: token('text.primary') }}>{scenario.verdict}</span>
        <div style={{ marginTop: 6 }}>{scenario.result.reason}</div>
        <SourceChip
          label={`senses: ${[...scenario.result.votedPositive, ...scenario.result.votedNegative].join(', ') || 'none'}`}
        />
      </div>

      {dark ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <Tile title="Fridge" value="3 h 10 m" source="USDA FoodKeeper" live />
          <Tile title="Freezer" value="22 h 40 m" source="USDA FoodKeeper" live />
          <Tile title="Hours of safety" value="7 h" source="NREL archetype" />
          <Tile title="Insulin" value="27 d left" source="FDA label" />
        </div>
      ) : null}

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <PrimaryButton>◉ I'M SAFE</PrimaryButton>
      </div>
    </main>
  );
}
