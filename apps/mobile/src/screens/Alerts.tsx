import type { alerts } from '@afterglow/core';
import type { ReactNode } from 'react';
import { alertText } from '../alerts/present';
import { Sources } from '../night-shell/components';
import { Notice } from '../night-shell/controls';
import { Icon } from '../ui/icons';
import { cx } from '../ui/kit';
import { Page, PageHeader } from '../ui/page';

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
      className={cx(
        'flex h-full min-w-0 gap-4 rounded-[var(--radius-tile)] border-solid bg-surface-2 p-4 sm:p-5',
        critical ? 'border-2 border-ring' : 'border border-hairline',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'flex size-11 flex-none items-center justify-center rounded-xl border',
          critical
            ? 'border-ring bg-control-primary text-control-label'
            : 'border-hairline bg-surface-1 text-secondary',
        )}
      >
        <Icon name={alert.kind === 'help' ? 'seance' : critical ? 'bell' : 'clock'} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-caption text-secondary">{PRIORITY_WORD[alert.priority]}</div>
        <div
          className={cx(
            'mt-1 text-body [overflow-wrap:anywhere]',
            critical ? 'text-emphasis' : 'text-primary',
          )}
        >
          {t.title}
        </div>
        <div className="mt-1.5 text-caption text-secondary [overflow-wrap:anywhere]">{t.body}</div>
        <Sources labels={alert.sources} />
      </div>
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
  const now = list.filter((a) => a.priority === 'critical').length;
  return (
    <Page width="narrow">
      <PageHeader
        title="Alerts"
        eyebrow="What needs you"
        icon="bell"
        lead={
          list.length === 0
            ? 'Most urgent first, each with how it is known.'
            : `${list.length} alert${list.length === 1 ? '' : 's'}${now > 0 ? `, ${now} need${now === 1 ? 's' : ''} you now` : ''}. Most urgent first, each with how it is known.`
        }
      />
      {list.length === 0 ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl border border-hairline bg-surface-2 text-secondary">
            <Icon name="bell" size={26} />
          </span>
          <p className="m-0 max-w-[48ch] text-body text-secondary">
            {outage
              ? 'Nothing needs you right now. I will say here when a fridge, your home or one of your people does.'
              : 'Nothing to report. With the power on I stay quiet, unless someone on your list sends HELP.'}
          </p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {list.map((a) => (
            <li key={a.key}>
              <AlertCard alert={a} />
            </li>
          ))}
        </ul>
      )}
      <Notice>
        Alerts here come from the same models as every other screen, and each says how it is known.
        Afterglow does not send texts or calls from this build, and it is not an emergency service.
      </Notice>
    </Page>
  );
}
