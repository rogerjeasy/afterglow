import { household } from '@afterglow/core';
import { type ReactNode, useMemo, useState } from 'react';
import { formatClockTime, formatDuration } from '../format';
import { useHousehold } from '../household/useHousehold';
import { Sources } from '../night-shell/components';
import { Button, Fold, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import {
  addWindows,
  adherence,
  clearSchedule,
  parseSchedule,
  removeWindow,
  scheduleNow,
  useManualSchedule,
} from './manual';

const MIN = 60_000;
const day = (ms: number): string =>
  new Date(ms).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

/** The announced schedule (SC-01): typed in, merged, compared with what happened. */
export function ScheduleSection({ nowMs }: { nowMs: number }): ReactNode {
  const ws = useManualSchedule();
  const { state } = useHousehold();
  const [text, setText] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const { current, next } = scheduleNow(ws, nowMs);
  const outages = useMemo(
    () => household.outageReports(state.log.toArray(), nowMs),
    [state.log, nowMs],
  );
  const score = adherence(ws, outages, nowMs);
  const upcoming = ws.filter((w) => w.endMs > nowMs);

  const add = (): void => {
    const r = parseSchedule(text, nowMs);
    if (r.windows.length) addWindows(r.windows);
    setText('');
    setNote(
      `${r.windows.length} window${r.windows.length === 1 ? '' : 's'} added.${
        r.unread.length ? ` Could not read: ${r.unread.join('; ')}` : ''
      }`,
    );
  };

  return (
    <Section title="Announced schedule">
      <div style={{ fontSize: 'var(--type-body)', color: token('text.primary') }}>
        {current
          ? `The utility said power is off now until ${formatClockTime(current.endMinute * MIN)}.`
          : next
            ? `Next announced outage: ${day(next.startMinute * MIN)}, ${formatClockTime(next.startMinute * MIN)} to ${formatClockTime(next.endMinute * MIN)}.`
            : 'No announced outages. If your utility announces them, add them below.'}
      </div>
      {score.kind === 'score' ? (
        <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
          Of the announced outage time that has passed, {Math.round(score.value * 100)}% matched an
          outage you recorded.
        </span>
      ) : null}
      <Fold label="Add announced windows">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              color: token('text.primary'),
            }}
          >
            One per line, as announced
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={'18:00-20:30\ntomorrow 06:00-08:30\nFri 20:00-22:30'}
              style={{
                font: 'inherit',
                fontSize: 'var(--type-body)',
                padding: 10,
                borderRadius: 12,
                background: token('surface.2'),
                color: token('text.primary'),
                border: `1px solid ${token('hairline')}`,
              }}
            />
          </label>
          <Button variant="primary" disabled={!text.trim()} onClick={add}>
            Add
          </Button>
          {note ? <Notice>{note}</Notice> : null}
          {upcoming.length ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: token('text.primary'),
                display: 'grid',
                gap: 6,
              }}
            >
              {upcoming.map((w) => (
                <li key={`${w.startMs}-${w.endMs}`}>
                  {day(w.startMs)}, {formatClockTime(w.startMs)}–{formatClockTime(w.endMs)} (
                  {formatDuration(Math.round((w.endMs - w.startMs) / MIN))}){' '}
                  <Button size="sm" variant="ghost" onClick={() => removeWindow(w)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {ws.length ? (
            <Button size="sm" variant="ghost" onClick={clearSchedule}>
              Clear the schedule
            </Button>
          ) : null}
        </div>
      </Fold>
      <Sources labels={['announced by your utility, typed by you', 'kept on this phone']}>
        Overlapping windows are merged. Afterglow shows the announcement as it was given; the crowd
        map shows what is actually happening.
      </Sources>
    </Section>
  );
}
