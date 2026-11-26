import type { alerts } from '@afterglow/core';
import type { ReactNode } from 'react';
import { alertText } from '../alerts/present';
import { Sources } from '../night-shell/components';
import { Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';

/**
 * The Alerts centre (design 11.8; alerts spec): what needs you, most urgent first,
 * each with how it is known. It raises nothing itself; the core decides.
 */

const PRIORITY_WORD: Record<alerts.AlertPriority, string> = {
  critical: 'Now',
  high: 'Soon',
  normal: 'Good to know',
};

function AlertCard({ alert }: { alert: alerts.Alert }): ReactNode {
  const t = alertText(alert);
  const critical = alert.priority === 'critical';
  return (
    <article
      aria-label={`${PRIORITY_WORD[alert.priority]}: ${t.title}`}
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-tile)',
        background: token('surface.2'),
        borderStyle: 'solid',
        borderWidth: critical ? 2 : 1,
        borderColor: critical ? token('focus.ring') : token('hairline'),
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        {PRIORITY_WORD[alert.priority]}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 'var(--type-body)',
          color: critical ? token('text.emphasis') : token('text.primary'),
          overflowWrap: 'anywhere',
        }}
      >
        {t.title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 'var(--type-caption)',
          color: token('text.secondary'),
          overflowWrap: 'anywhere',
        }}
      >
        {t.body}
      </div>
      <Sources labels={alert.sources} />
    </article>
  );
}

export function Alerts({
  list,
  outage,
}: {
  list: readonly alerts.Alert[];
  outage: boolean;
}): ReactNode {
  return (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <Section title="Alerts">
        {list.length === 0 ? (
          <Notice>
            {outage
              ? 'Nothing needs you right now. I will say here when a fridge, your home or one of your people does.'
              : 'Nothing to report. With the power on I stay quiet, unless someone on your list sends HELP.'}
          </Notice>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {list.map((a) => (
              <li key={a.key}>
                <AlertCard alert={a} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Notice>
        Alerts here come from the same models as every other screen, and each says how it is known.
        Afterglow does not send texts or calls from this build, and it is not an emergency service.
      </Notice>
    </main>
  );
}
