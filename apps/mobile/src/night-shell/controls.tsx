import { type CSSProperties, type ReactNode, useState } from 'react';
import type { Key } from '../i18n/catalogue';
import { useT } from '../i18n/i18n';
import { Icon } from '../ui/icons';
import { cx } from '../ui/kit';
import { token } from './theme';

/**
 * Night Shell controls. Semantic tokens only (night-vision.md rule 4); targets
 * are at least 44 px with 56 px as the default; press feedback is a transform
 * and nothing animates layout.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  children,
  onClick,
  variant = 'secondary',
  size = 'md',
  disabled,
  ariaLabel,
  style,
  tourId,
  className,
}: {
  children: ReactNode;
  onClick?: (() => void) | undefined;
  variant?: ButtonVariant | undefined;
  size?: 'sm' | 'md' | undefined;
  disabled?: boolean | undefined;
  ariaLabel?: string | undefined;
  style?: CSSProperties | undefined;
  /** The guide's anchor for this button (`data-tour`). */
  tourId?: string | undefined;
  className?: string | undefined;
}): ReactNode {
  return (
    <button
      type="button"
      className={cx(
        'press inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] border text-label font-bold transition-[transform,opacity] duration-200 ease-out',
        size === 'sm' ? 'min-h-11 px-3.5' : 'min-h-14 px-5',
        variant === 'primary'
          ? 'border-ring bg-control-primary text-control-label'
          : variant === 'ghost'
            ? 'border-hairline bg-transparent text-primary'
            : 'border-hairline bg-control text-primary',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-px',
        className,
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-tour={tourId}
      style={style}
    >
      {children}
    </button>
  );
}

export function ChoiceChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={cx(
        'press inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-label transition-[transform,opacity] duration-200 ease-out',
        selected
          ? 'border-ring bg-control-primary text-control-label'
          : 'border-hairline bg-control text-secondary hover:text-primary',
      )}
      onClick={onClick}
      aria-pressed={selected}
    >
      {selected ? <Icon name="check" size={18} /> : null}
      {label}
    </button>
  );
}

export function Stepper({
  label,
  valueText,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
  hint,
}: {
  label: string;
  valueText: string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  hint?: string;
}): ReactNode {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
        <Button
          size="md"
          onClick={onDecrement}
          disabled={decrementDisabled}
          ariaLabel={`Decrease ${label}`}
          style={{ width: 56, padding: 0 }}
        >
          −
        </Button>
        <span
          className="clock"
          style={{
            minWidth: 96,
            textAlign: 'center',
            fontSize: 'var(--type-clock-md)',
            color: token('text.primary'),
          }}
        >
          {valueText}
        </span>
        <Button
          size="md"
          onClick={onIncrement}
          disabled={incrementDisabled}
          ariaLabel={`Increase ${label}`}
          style={{ width: 56, padding: 0 }}
        >
          +
        </Button>
      </div>
      {hint ? (
        <div
          style={{ marginTop: 6, fontSize: 'var(--type-caption)', color: token('text.secondary') }}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}): ReactNode {
  return (
    <label className="block">
      <span className="text-label text-secondary">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className={cx(FIELD, 'border-hairline')}
      />
    </label>
  );
}

const FIELD =
  'mt-2 block min-h-14 w-full rounded-[var(--radius-control)] border bg-surface-2 px-4 text-body font-semibold tracking-[inherit] text-primary caret-emphasis transition-colors duration-200 focus:border-ring disabled:opacity-50';

/**
 * A labelled text input. Password fields use the platform's password semantics
 * (so a password manager can help) and never echo; autofill is restyled in CSS
 * so it cannot flash a light background in the dark.
 */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  hint,
  error,
  disabled,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'password';
  autoComplete?: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  name?: string;
}): ReactNode {
  return (
    <label className="block">
      <span className="text-label text-secondary">{label}</span>
      <input
        type={type}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete ?? 'off'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        className={cx(FIELD, error ? 'border-ring' : 'border-hairline')}
      />
      {error || hint ? (
        <span
          className={cx(
            'mt-1.5 block text-caption [overflow-wrap:anywhere]',
            error ? 'text-emphasis' : 'text-secondary',
          )}
        >
          {error ?? hint}
        </span>
      ) : null}
    </label>
  );
}

export function Section({
  title,
  children,
  right,
  tourId,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  /** The guide's anchor for this section (`data-tour`). */
  tourId?: string;
}): ReactNode {
  return (
    <section data-tour={tourId} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-headline font-bold tracking-[-0.005em] text-emphasis">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** An inline notice on the quietest surface; says plainly what is known and what is not. */
export function Notice({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="rounded-[var(--radius-control)] border border-hairline bg-surface-1 px-4 py-3.5 text-caption text-secondary [overflow-wrap:anywhere]">
      {children}
    </div>
  );
}

export type TabId =
  | 'hearth'
  | 'lantern'
  | 'seance'
  | 'cold'
  | 'plan'
  | 'you'
  | 'alerts'
  | 'business'
  | 'beacon';

function Glyph({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Hearth: a flame in a hearth arch. */
const HearthGlyph = (): ReactNode => (
  <Glyph>
    <path d="M4 21V10a8 8 0 0 1 16 0v11" />
    <path d="M12 18c-2 0-3-1.3-3-2.8 0-1.8 2-2.7 2-4.7 1.7 1 4 2.6 4 5.1 0 1.4-1.1 2.4-3 2.4Z" />
  </Glyph>
);
/** Tombstone: an arched top over a square base. */
const TombstoneGlyph = (): ReactNode => (
  <Glyph>
    <path d="M6 21V10a6 6 0 0 1 12 0v11" />
    <path d="M3 21h18" />
    <path d="M12 9v5M10 11h4" />
  </Glyph>
);

/** You: a head and shoulders. */
const YouGlyph = (): ReactNode => (
  <Glyph>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Glyph>
);

/** Lantern: a hanging lantern with its flame (design 7.1). */
const LanternGlyph = (): ReactNode => (
  <Glyph>
    <path d="M9 2.5h6M12 2.5V5" />
    <path d="M8 5h8l1.5 4v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V9z" transform="translate(-0.5 0)" />
    <circle cx="12" cy="13" r="2" />
  </Glyph>
);

function SeanceGlyph(): ReactNode {
  // A lamp with rays: the séance (design 7.1).
  return (
    <Glyph>
      <circle cx="12" cy="13" r="4" />
      <path d="M12 3v3M4.5 6.5l2 2M19.5 6.5l-2 2M3 13h2M19 13h2" />
    </Glyph>
  );
}
function PlanGlyph(): ReactNode {
  // A candle: the plan (design 7.1).
  return (
    <Glyph>
      <path d="M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5z" />
      <rect x="8" y="10" width="8" height="11" rx="1" />
    </Glyph>
  );
}
const TABS: readonly { id: TabId; key: Key; glyph: () => ReactNode }[] = [
  { id: 'hearth', key: 'tab.hearth', glyph: HearthGlyph },
  { id: 'lantern', key: 'tab.lantern', glyph: LanternGlyph },
  { id: 'seance', key: 'tab.seance', glyph: SeanceGlyph },
  { id: 'cold', key: 'tab.cold', glyph: TombstoneGlyph },
  { id: 'plan', key: 'tab.plan', glyph: PlanGlyph },
];

/**
 * The Alerts centre's door (alerts spec, task 4): a bell with the count beside it.
 * The count is a number of alerts, never a severity colour (one hue: meaning is in
 * the number and the words).
 */
export function AlertsButton({
  active,
  count,
  critical,
  onClick,
}: {
  active: boolean;
  count: number;
  /** Any critical alert: the ring takes the focus tone and the label says so. */
  critical: boolean;
  onClick: () => void;
}): ReactNode {
  const label =
    count === 0
      ? 'Alerts: none'
      : `Alerts: ${count}${critical ? ', at least one needs you now' : ''}`;
  return (
    <button
      type="button"
      className={cx(
        'press relative flex size-11 flex-none items-center justify-center rounded-full border-solid transition-transform duration-200',
        critical ? 'border-2' : 'border',
        active || critical ? 'border-ring' : 'border-hairline',
        active
          ? 'bg-control-primary text-control-label'
          : 'bg-control text-secondary hover:text-primary',
      )}
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      <Glyph>
        <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </Glyph>
      {count > 0 ? (
        <span
          aria-hidden="true"
          // The caption minimum is 16 px everywhere (night-vision rule 6), badges included.
          className="clock absolute -top-2 -right-2 h-6 min-w-6 rounded-xl border border-ring bg-surface-3 px-[5px] text-center text-caption leading-[22px] text-emphasis"
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/**
 * "You" (settings, account, privacy) is not a destination of its own: the design
 * keeps five tabs and puts the rest behind "more" in the header (design 10.1). Six
 * tabs also do not fit at 320 px with labels, and a label is never dropped.
 */
export function YouButton({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className={cx(
        'press flex size-11 flex-none items-center justify-center rounded-full border transition-transform duration-200',
        active
          ? 'border-ring bg-control-primary text-control-label'
          : 'border-hairline bg-control text-secondary hover:text-primary',
      )}
      onClick={onClick}
      aria-label="You: settings, account and privacy"
      aria-current={active ? 'page' : undefined}
    >
      <YouGlyph />
    </button>
  );
}

/** The five destinations, in order, with their glyphs: shared by the tab bar and the sidebar. */
export const DESTINATIONS = TABS;

/**
 * The phone and tablet tab bar. Tabs are peers and never slide (design 10.1). On a
 * desk the sidebar takes over (web-experience WX-05), so the bar hides at `lg`.
 */
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}): ReactNode {
  const tr = useT();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 flex justify-center border-t border-hairline bg-surface-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <div className="flex w-full max-w-[640px]">
        {TABS.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              className={cx(
                'press-row relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 border-none bg-transparent text-caption transition-colors duration-200',
                selected ? 'text-emphasis' : 'text-secondary',
              )}
              onClick={() => onSelect(t.id)}
              aria-current={selected ? 'page' : undefined}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-emphasis transition-[transform,opacity] duration-300 ease-out',
                  selected ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0',
                )}
              />
              {t.glyph()}
              <span className="px-1 text-center leading-tight">{tr(t.key)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * A form or list that stays closed until asked for (NS-15): one button names the
 * action, and opening it shows the form with a way to close it again. Screens
 * answer their question first; forms wait.
 */
export function Fold({
  label,
  children,
  defaultOpen = false,
}: {
  /** The action, as the closed button says it: "Add a battery". */
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}): ReactNode {
  const [open, setOpen] = useState(defaultOpen);
  if (!open)
    return (
      <Button onClick={() => setOpen(true)} style={{ width: '100%' }}>
        {label}
      </Button>
    );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {children}
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Close
      </Button>
    </div>
  );
}

/** The "Edit" toggle for a section's list: management actions appear only while editing (NS-15). */
export function EditToggle({
  editing,
  onToggle,
}: {
  editing: boolean;
  onToggle: () => void;
}): ReactNode {
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onToggle}
      ariaLabel={editing ? 'Done editing' : 'Edit list'}
    >
      {editing ? 'Done' : 'Edit'}
    </Button>
  );
}
