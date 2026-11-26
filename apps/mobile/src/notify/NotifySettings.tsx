import { type ReactNode, useState } from 'react';
import { useGridSense } from '../gridsense/useGridSense';
import { Sources } from '../night-shell/components';
import { ChoiceChip, Notice, Section } from '../night-shell/controls';
import {
  canNotify,
  canPush,
  followArea,
  outcomeText,
  setAlertNotifications,
  unfollowArea,
  useNotify,
} from './notify';

export function NotifySettings(): ReactNode {
  const p = useNotify();
  const gs = useGridSense();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Section title="Notifications">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <ChoiceChip
          label={canNotify() ? 'Alerts on this phone' : 'Alerts (not in this browser)'}
          selected={p.alerts}
          onClick={() => {
            void setAlertNotifications(!p.alerts).then((o) => setNote(outcomeText(o)));
          }}
        />
        <ChoiceChip
          label={canPush() ? 'When my area goes dark' : 'My area (not in this browser)'}
          selected={p.area !== null}
          onClick={() => {
            if (busy) return;
            if (p.area) {
              void unfollowArea();
              setNote(null);
              return;
            }
            if (!gs.cell) {
              setNote('Share your area on the Lantern tab first.');
              return;
            }
            setBusy(true);
            void followArea(gs.cell)
              .then((o) => setNote(outcomeText(o)))
              .finally(() => setBusy(false));
          }}
        />
      </div>
      {note ? <Notice>{note}</Notice> : null}
      <Sources labels={['alerts: made on this phone', 'my area: your ~1 km cell']}>
        Alerts on this phone are made here and sent nowhere. "When my area goes dark" keeps this
        browser's push address under your cell for 30 days so the server can tell you when at least
        5 phones there lose power or get it back. Turning it off deletes it.
      </Sources>
    </Section>
  );
}
