import type { ReactNode } from 'react';
import { Button, Notice, Section } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { navigate } from '../router';

/** The way into Afterglow Business and Beacon from You (consoles CO-01). */
export function ConsolesSection({ signedIn }: { signedIn: boolean }): ReactNode {
  return (
    <Section title="For organisations">
      <span style={{ fontSize: 'var(--type-body)', color: token('text.secondary') }}>
        Afterglow Business is for pharmacies, clinics, shops and shelters. Afterglow Beacon is for
        municipalities, utilities and relief organisations.
      </span>
      {signedIn ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/app/business')}>Open Business</Button>
          <Button onClick={() => navigate('/app/beacon')}>Open Beacon</Button>
        </div>
      ) : (
        <Notice>Both need this account to be connected to the Afterglow cloud and online.</Notice>
      )}
    </Section>
  );
}
