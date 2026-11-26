import type { CSSProperties, ReactNode } from 'react';
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
}): ReactNode {
  const fill =
    variant === 'primary'
      ? token('control.fill.primary')
      : variant === 'ghost'
        ? 'transparent'
        : token('control.fill');
  return (
    <button
      type="button"
      className="press"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-tour={tourId}
      style={{
        minHeight: size === 'sm' ? 44 : 56,
        padding: size === 'sm' ? '0 14px' : '0 20px',
        borderRadius: 'var(--radius-control)',
        border: `1px solid ${variant === 'primary' ? token('focus.ring') : token('hairline')}`,
        background: fill,
        color: variant === 'primary' ? token('control.label.primary') : token('text.primary'),
        fontSize: 'var(--type-label)',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
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
      className="press"
      onClick={onClick}
      aria-pressed={selected}
      style={{
        minHeight: 44,
        padding: '0 16px',
        borderRadius: 999,
        border: `1px solid ${selected ? token('focus.ring') : token('hairline')}`,
        background: selected ? token('control.fill.primary') : token('control.fill'),
        color: selected ? token('control.label.primary') : token('text.secondary'),
        fontSize: 'var(--type-label)',
      }}
    >
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
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 8,
          minHeight: 56,
          padding: '0 16px',
          borderRadius: 'var(--radius-control)',
          border: `1px solid ${token('hairline')}`,
          background: token('surface.2'),
          color: token('text.primary'),
          caretColor: token('text.emphasis'),
          fontSize: 'var(--type-body)',
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: 'inherit',
        }}
      />
    </label>
  );
}

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
    <label style={{ display: 'block' }}>
      <span style={{ fontSize: 'var(--type-label)', color: token('text.secondary') }}>{label}</span>
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
        style={{
          display: 'block',
          width: '100%',
          marginTop: 8,
          minHeight: 56,
          padding: '0 16px',
          borderRadius: 'var(--radius-control)',
          border: `1px solid ${error ? token('focus.ring') : token('hairline')}`,
          background: token('surface.2'),
          color: token('text.primary'),
          caretColor: token('text.emphasis'),
          fontSize: 'var(--type-body)',
          fontFamily: 'inherit',
          fontWeight: 600,
          letterSpacing: 'inherit',
        }}
      />
      {error || hint ? (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            fontSize: 'var(--type-caption)',
            color: error ? token('text.emphasis') : token('text.secondary'),
            overflowWrap: 'anywhere',
          }}
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
    <section data-tour={tourId} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--type-headline)',
            lineHeight: 1.25,
            color: token('text.emphasis'),
          }}
        >
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** An inline notice on the quietest surface; says plainly what is known and what is not. */
export function Notice({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 'var(--radius-control)',
        background: token('surface.1'),
        border: `1px solid ${token('hairline')}`,
        fontSize: 'var(--type-caption)',
        color: token('text.secondary'),
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </div>
  );
}

export type TabId = 'hearth' | 'lantern' | 'seance' | 'cold' | 'plan' | 'you';

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
const TABS: readonly { id: TabId; label: string; glyph: () => ReactNode }[] = [
  { id: 'hearth', label: 'Hearth', glyph: HearthGlyph },
  { id: 'lantern', label: 'Lantern', glyph: LanternGlyph },
  { id: 'seance', label: 'Séance', glyph: SeanceGlyph },
  { id: 'cold', label: 'Cold', glyph: TombstoneGlyph },
  { id: 'plan', label: 'Plan', glyph: PlanGlyph },
];

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
      className="press"
      onClick={onClick}
      aria-label="You: settings, account and privacy"
      aria-current={active ? 'page' : undefined}
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        border: `1px solid ${active ? token('focus.ring') : token('hairline')}`,
        background: active ? token('control.fill.primary') : token('control.fill'),
        color: active ? token('control.label.primary') : token('text.secondary'),
      }}
    >
      <YouGlyph />
    </button>
  );
}

/** The platform-style tab bar. Tabs are peers and never slide (design 10.1). */
export function TabBar({
  active,
  onSelect,
}: {
  active: TabId;
  onSelect: (id: TabId) => void;
}): ReactNode {
  return (
    <nav
      aria-label="Main"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        justifyContent: 'center',
        background: token('surface.1'),
        borderTop: `1px solid ${token('hairline')}`,
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 10,
      }}
    >
      <div style={{ display: 'flex', width: '100%', maxWidth: 520 }}>
        {TABS.map((t) => {
          const selected = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              className="press-row"
              onClick={() => onSelect(t.id)}
              aria-current={selected ? 'page' : undefined}
              style={{
                flex: 1,
                minHeight: 64,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: selected ? token('text.emphasis') : token('text.secondary'),
                fontSize: 'var(--type-caption)',
              }}
            >
              {t.glyph()}
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
