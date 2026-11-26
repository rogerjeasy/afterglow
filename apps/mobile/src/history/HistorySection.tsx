import { household } from '@afterglow/core';
import { type ReactNode, useMemo, useState } from 'react';
import { foodIndex } from '../data/foodkeeper';
import { formatClockTime, formatDuration } from '../format';
import { useHousehold, useNow } from '../household/useHousehold';
import { Sources } from '../night-shell/components';
import { Button, Fold, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { MESSAGE_LABEL } from '../seance/present';

/**
 * History, reports and evidence (product description 7.19): every outage this
 * household recorded, and for each one a report — when it started and ended, the
 * doors opened, what was thrown out and why, who checked in and how, the energy
 * drawn from the stores — as plain text to share, a JSON file, or a printed page.
 * Everything comes from the household's own log; nothing is estimated.
 */

const CHANNEL: Record<string, string> = {
  light: 'by light',
  sound: 'by sound',
  sms: 'by text',
  ble: 'by Bluetooth',
  manual: 'marked by you',
};

function dateTime(ms: number): string {
  return new Date(ms).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function foodName(id: number | null): string {
  if (id === null) return 'A food item';
  return foodIndex.products.find((p) => p.product.id === id)?.displayName ?? 'A food item';
}

function removalLine(r: household.ReportRemoval): string {
  const what = r.kind === 'food' ? foodName(r.productId) : (r.product ?? 'A medicine');
  const why = r.reason === 'discarded' ? 'thrown out' : r.reason === 'used' ? 'used' : 'removed';
  return `${what} (${r.appliance}): ${why}${r.atMs !== null ? ` at ${formatClockTime(r.atMs)}` : ''}`;
}

/** The report as plain text: what is shared, copied or attached to a claim. */
export function reportText(r: household.OutageReport): string {
  const lines: string[] = [];
  lines.push('Afterglow outage report');
  lines.push(`Power went out: ${dateTime(r.startMs)}`);
  lines.push(
    r.ongoing
      ? `Still out (${formatDuration(r.durationMinutes ?? 0)} so far)`
      : r.endMs !== null
        ? `Power came back: ${dateTime(r.endMs)} (${formatDuration(r.durationMinutes ?? 0)})`
        : 'Power came back: time not recorded',
  );
  lines.push('');
  lines.push('Schedule: no provider connected, so no promised time to compare.');
  lines.push('');
  lines.push(`Doors opened: ${r.doors.length === 0 ? 'none recorded' : ''}`);
  for (const d of r.doors) {
    lines.push(`- ${d.appliance}, ${formatDuration(d.openMinutes)} at ${formatClockTime(d.atMs)}`);
  }
  lines.push(`Thrown out or used: ${r.removals.length === 0 ? 'nothing recorded' : ''}`);
  for (const x of r.removals) lines.push(`- ${removalLine(x)}`);
  lines.push(`Check-ins: ${r.heard.length === 0 ? 'none recorded' : ''}`);
  for (const h of r.heard) {
    lines.push(
      `- ${h.person}: ${MESSAGE_LABEL[h.code]} ${CHANNEL[h.channel] ?? ''} at ${formatClockTime(h.atMs)}`,
    );
  }
  lines.push(
    `Energy drawn: ${r.energy.length === 0 ? 'no store charge was updated during the outage' : `about ${r.energyUsedWh} Wh`}`,
  );
  for (const e of r.energy) {
    lines.push(`- ${e.store}: ${e.fromPct}% to ${e.toPct}% (about ${Math.round(e.usedWh)} Wh)`);
  }
  if (r.checks.length) {
    lines.push('Safety checks answered:');
    for (const c of r.checks) lines.push(`- ${c.check}: ${c.answer}`);
  }
  lines.push('');
  lines.push(
    'From this household’s own record in Afterglow. Times are this phone’s clock. Not medical or insurance advice.',
  );
  return lines.join('\n');
}

function download(name: string, type: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printReport(text: string): void {
  // A printable page of its own: black text on white for paper, not the Night Shell.
  const holder = document.createElement('pre');
  holder.className = 'print-only';
  holder.textContent = text;
  document.body.append(holder);
  document.body.classList.add('printing-report');
  const done = (): void => {
    holder.remove();
    document.body.classList.remove('printing-report');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}

function ReportView({ r }: { r: household.OutageReport }): ReactNode {
  const [note, setNote] = useState<string | null>(null);
  const text = reportText(r);
  const stamp = new Date(r.startMs).toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const share = async (): Promise<void> => {
    const nav = navigator as Navigator & {
      share?: (d: { title: string; text: string }) => Promise<void>;
    };
    if (nav.share) {
      await nav.share({ title: 'Afterglow outage report', text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(text).then(
      () => setNote('Copied. Paste it into a message, an email or a claim form.'),
      () => setNote('Could not copy here. Use "Save as text" instead.'),
    );
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <pre
        style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 'var(--type-caption)',
          color: token('text.primary'),
          background: token('surface.2'),
          padding: 12,
          borderRadius: 'var(--radius-tile)',
        }}
      >
        {text}
      </pre>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button size="sm" onClick={() => void share()}>
          Share
        </Button>
        <Button
          size="sm"
          onClick={() => download(`afterglow-outage-${stamp}.txt`, 'text/plain', text)}
        >
          Save as text
        </Button>
        <Button
          size="sm"
          onClick={() =>
            download(
              `afterglow-outage-${stamp}.json`,
              'application/json',
              JSON.stringify({ format: 'afterglow.outage-report.v1', report: r }, null, 2),
            )
          }
        >
          Save as JSON
        </Button>
        <Button size="sm" variant="ghost" onClick={() => printReport(text)}>
          Print
        </Button>
      </div>
      {note ? <Notice>{note}</Notice> : null}
    </div>
  );
}

export function HistorySection(): ReactNode {
  const { state } = useHousehold();
  const nowMs = useNow(60_000);
  const reports = useMemo(
    () => household.outageReports(state.log.toArray(), nowMs),
    [state.log, nowMs],
  );
  const sum = household.historySummary(reports);
  return (
    <Section title="Your outages">
      {reports.length === 0 ? (
        <Notice>
          No outages recorded yet. Each one you start and end here gets a report you can share or
          keep.
        </Notice>
      ) : (
        <>
          <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
            {sum.count} outage{sum.count === 1 ? '' : 's'} recorded
            {sum.knownMinutes > 0 ? `, ${formatDuration(sum.knownMinutes)} in all` : ''}
            {sum.longestMinutes !== null
              ? `; the longest ${formatDuration(sum.longestMinutes)}`
              : ''}
            .
          </div>
          {reports.slice(0, 20).map((r) => (
            <Fold
              key={r.startMs}
              label={`${dateTime(r.startMs)} · ${
                r.ongoing
                  ? 'going on now'
                  : r.durationMinutes !== null
                    ? formatDuration(r.durationMinutes)
                    : 'end not recorded'
              }`}
            >
              <ReportView r={r} />
            </Fold>
          ))}
        </>
      )}
      <Sources labels={['this household’s own record', 'kept on this phone (and your vault)']}>
        Reports are built from what was recorded here, in order. Older entries may lack an end time
        or a reason; the report says so rather than guessing.
      </Sources>
    </Section>
  );
}
