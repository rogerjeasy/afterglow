import type { TabId } from '../night-shell/controls';
import type { PowerNeed } from './tour';

/**
 * The One Night tour, as Wisp tells it (guide spec, design §2).
 *
 * Rules every line obeys, held by the properties in guide.property.test.ts:
 * - the only digits in a line come from its `{slots}`, filled from facts (GD-01);
 * - the fallback has no slots and no digits;
 * - with facts, a line is at most 200 characters (GD-08).
 * The jokes are about Wisp, never about a person's risk, a medicine or a number.
 */

export type FactKey =
  | 'devices'
  | 'fridge'
  | 'ghosts'
  | 'k'
  | 'promise'
  | 'estimate'
  | 'threshold'
  | 'crossing'
  | 'foodVerdict';

export interface TourStep {
  readonly id: string;
  readonly tab: Exclude<TabId, 'you' | 'alerts'>;
  /** The `data-tour` attribute of the element Wisp points at. */
  readonly target: string;
  readonly power: PowerNeed;
  readonly line: string;
  readonly fallback: string;
  /** The label of the forward button on this step. */
  readonly nextLabel: string;
}

export const TOUR: readonly TourStep[] = [
  {
    id: 'hello',
    tab: 'hearth',
    target: 'status',
    power: 'on',
    line: "Boo. I'm Wisp, the ghost in your phone. Bright screens scare me, so everything here stays dim and red. Let me show you one night without power.",
    fallback:
      "Boo. I'm Wisp, the ghost in your phone. Bright screens scare me, so everything here stays dim and red. Let me show you one night without power.",
    nextLabel: 'Turn off the lights',
  },
  {
    id: 'lights-out',
    tab: 'hearth',
    target: 'status',
    power: 'out',
    line: "Lights out. {devices} phones in your area lost power at the same moment, so it isn't just your fuse. The screen went to Night mode to save your eyes.",
    fallback:
      'Lights out. The screen went to Night mode to save your eyes. Once enough phones nearby agree, this line says how far the outage reaches.',
    nextLabel: 'Next',
  },
  {
    id: 'fridge',
    tab: 'hearth',
    target: 'tile-fridge',
    power: 'out',
    line: "Your fridge keeps food safe for {fridge} more. That's USDA rules plus a model of this fridge, not my opinion. I'm dead. I don't do opinions.",
    fallback:
      "Tell me about your fridge and I'll count down to the minute its food stops being safe. USDA rules, not my opinion. I'm dead. I don't do opinions.",
    nextLabel: 'Next',
  },
  {
    id: 'people',
    tab: 'hearth',
    target: 'tile-people',
    power: 'out',
    line: "{ghosts} of your people haven't been heard from since the lights went out, so they show as ghosts. When they check in, they turn solid. Lucky them.",
    fallback:
      "In here, a ghost is someone you're still waiting to hear from. When they check in, they turn solid. Lucky them.",
    nextLabel: 'Next',
  },
  {
    id: 'cold',
    tab: 'cold',
    target: 'cold-first',
    power: 'out',
    line: 'Can you still eat the yogurt? Every food gets its own verdict here, with the USDA rule it came from. Each fridge is a tombstone: its epitaph is the time left.',
    fallback:
      'Can you still eat the yogurt? Every food gets its own verdict here, with the USDA rule it came from. Each fridge is a tombstone: its epitaph is the time left.',
    nextLabel: 'Next',
  },
  {
    id: 'map',
    tab: 'lantern',
    target: 'lantern-map',
    power: 'out',
    line: 'This is the Lantern map. Lit squares still have power. A square only shows when at least {k} phones agree, so nobody can find your house. Not even me.',
    fallback:
      'This is the Lantern map. Lit squares still have power. A square only shows when enough phones agree, so nobody can find your house. Not even me.',
    nextLabel: 'Next',
  },
  {
    id: 'estimate',
    tab: 'lantern',
    target: 'lantern-estimate',
    power: 'out',
    line: "The utility promised {promise}. Here it usually runs late, so I'd bet on {estimate}. Drag the playback slider below to watch the night end.",
    fallback:
      'When the utility makes a promise, I check it against how late it ran here before. Drag the playback slider below to watch the night end.',
    nextLabel: 'Next',
  },
  {
    id: 'seance',
    tab: 'seance',
    target: 'seance-simulate',
    power: 'out',
    line: "No signal? Talk with light. Afterglow flashes I'm safe from one screen into a neighbour's camera. Tap the outlined button to watch the real decoder read it.",
    fallback:
      "No signal? Talk with light. Afterglow flashes I'm safe from one screen into a neighbour's camera. Tap the outlined button to watch the real decoder read it.",
    nextLabel: 'Next',
  },
  {
    id: 'graveyard',
    tab: 'plan',
    target: 'graveyard',
    power: 'out',
    line: "Your home reaches {threshold} at about {crossing}. The headstone marks it. That's when I'd stop being brave and go somewhere warm.",
    fallback:
      "The Graveyard Shift draws tonight's temperature in your home. A headstone marks the moment it crosses your line. That's when I'd stop being brave.",
    nextLabel: 'Next',
  },
  {
    id: 'ward',
    tab: 'plan',
    target: 'ward',
    power: 'out',
    line: "And I won't let you run a generator until every check here is a yes. Carbon monoxide is how a lot of us ghosts got started. Don't join the club.",
    fallback:
      "And I won't let you run a generator until every check here is a yes. Carbon monoxide is how a lot of us ghosts got started. Don't join the club.",
    nextLabel: 'Turn the power back on',
  },
  {
    id: 'power-back',
    tab: 'hearth',
    target: 'status',
    power: 'back',
    line: "Power's back, and {foodVerdict}. The chicken lives. You've heard from me all night, so I'm solid now. Goodnight.",
    fallback:
      "Power's back. Open Cold to see exactly what stayed safe. You've heard from me all night, so I'm solid now. Goodnight.",
    nextLabel: 'Finish',
  },
];
