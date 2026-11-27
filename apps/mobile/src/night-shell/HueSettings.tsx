import type { Hue } from '@afterglow/design-system';
import type { ReactNode } from 'react';
import { ChoiceChip, Section } from './controls';
import { setHue, token, useHue } from './theme';

const OPTIONS: readonly { hue: Hue; label: string }[] = [
  { hue: 'red', label: 'Red (best for night vision)' },
  { hue: 'amber', label: 'Amber (easier with red colour blindness)' },
];

/**
 * The colour setting (night-shell NS-22; design 3.4). Amber is for people who see
 * deep red as very dark. It keeps every mode's brightness limit; the trade is said
 * here, and red stays the default.
 */
export function HueSettings(): ReactNode {
  const hue = useHue();
  return (
    <Section title="Colour">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <ChoiceChip
            key={o.hue}
            label={o.label}
            selected={hue === o.hue}
            onClick={() => setHue(o.hue)}
          />
        ))}
      </div>
      <span style={{ fontSize: 'var(--type-caption)', color: token('text.secondary') }}>
        If deep red looks too dark to you, use amber. It is no brighter: every mode keeps the same
        limit. Amber costs night vision a little more than red, so red stays the default.
      </span>
    </Section>
  );
}
