import type { ReactNode } from 'react';
import { formatTimer } from '../format';
import { Candle, GhostGlyph } from '../night-shell/costume';
import { CellGlyph } from '../night-shell/lantern';
import { Icon } from '../ui/icons';
import { LogoMark, cx, useTicker } from '../ui/kit';

/**
 * Illustrations for the public site. Each draws the product's own costume from the
 * semantic tokens (an illustration carries data, night-vision rule 9), with figures
 * from the labelled demo household, never presented as a real reading.
 */

export function PhoneFrame({
  children,
  className,
}: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div
      className={cx(
        'relative w-full max-w-[360px] rounded-[48px] border border-hairline bg-surface-1 p-2.5',
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[40px] border border-hairline bg-bg">
        <div
          aria-hidden="true"
          className="absolute top-2.5 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-surface-2"
        />
        {children}
      </div>
    </div>
  );
}

/** The demo night started this long before the page opened (the README's deep link uses 45). */
const DEMO_ELAPSED_MS = 45 * 60_000;
const opened = Date.now();

function MiniStone({
  title,
  epitaph,
  dark,
}: { title: string; epitaph: string; dark: number }): ReactNode {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-t-[22px] border border-hairline border-t-glow bg-surface-3 px-3 pt-3.5 pb-3">
      <div aria-hidden="true" className="absolute inset-0 bg-bg" style={{ opacity: dark }} />
      <div className="relative">
        <div className="text-caption text-secondary">{title}</div>
        <div className="clock mt-1 text-[16px] leading-tight whitespace-nowrap text-primary">
          {epitaph}
        </div>
      </div>
    </div>
  );
}

/** A live miniature of the Hearth in the demo household's outage. */
export function HeroPhone(): ReactNode {
  const now = useTicker(opened);
  return (
    <PhoneFrame>
      <div className="flex flex-col gap-3 px-4 pt-11 pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-emphasis">
            <LogoMark size={24} />
            <span className="font-display text-[18px] font-semibold">Afterglow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full border border-hairline px-2.5 py-0.5 text-caption text-secondary">
              Night
            </span>
            <span className="flex size-8 items-center justify-center rounded-full border border-hairline text-secondary">
              <Icon name="bell" size={16} />
            </span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] border border-hairline border-t-glow bg-surface-1 p-4">
          <div
            aria-hidden="true"
            className="halo absolute -top-1/2 -left-1/3 h-[180%] w-full opacity-70"
          />
          <div className="relative">
            <div className="text-caption text-secondary">GRID DOWN</div>
            <div className="clock text-[34px] leading-none text-emphasis">
              {formatTimer(now - opened + DEMO_ELAPSED_MS)}
            </div>
            <p className="m-0 mt-2.5 text-caption leading-snug text-primary">
              41 devices in your cell lost power. This phone did too.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MiniStone title="Fridge" epitaph="2 h 23 m" dark={0.18} />
          <MiniStone title="Freezer" epitaph="47 h 13 m" dark={0.04} />
        </div>
        <div className="rounded-[18px] border border-hairline bg-surface-2 p-3">
          <div className="text-caption text-secondary">Your people</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="clock text-[16px] whitespace-nowrap text-primary">0 of 5 heard</span>
            <span className="flex gap-1">
              {[0, 1, 2, 3, 4].map((g) => (
                <GhostGlyph key={g} opacity={0.35} size={20} />
              ))}
            </span>
          </div>
        </div>
        <div className="rounded-[18px] border border-hairline bg-surface-2 p-3">
          <div className="text-caption text-secondary">Hours of safety</div>
          <div className="clock mt-1 text-[17px] text-primary">7 h 3 m</div>
        </div>

        <div className="-mx-4 mt-1 grid grid-cols-5 border-t border-hairline bg-surface-1 px-1 pt-2 pb-4 text-secondary">
          {(['hearth', 'lantern', 'seance', 'tombstone', 'candle'] as const).map((n, i) => (
            <span key={n} className={cx('flex justify-center', i === 0 && 'text-emphasis')}>
              <Icon name={n} size={20} />
            </span>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

type CellState = 'lit' | 'comingBack' | 'mixed' | 'dark' | 'unknown';
const MAP: readonly string[] = [
  'llmddduu',
  'llmdddud',
  'lmmdddcd',
  'mmddddcc',
  'uddddccl',
  'uudddcll',
];
const CODE: Record<string, CellState> = {
  l: 'lit',
  c: 'comingBack',
  m: 'mixed',
  d: 'dark',
  u: 'unknown',
};
const CELL_BG: Record<CellState, string> = {
  lit: 'bg-control-primary border-muted',
  comingBack: 'bg-control-primary border-emphasis',
  mixed: 'bg-surface-3 border-muted',
  dark: 'bg-bg border-hairline',
  unknown: 'bg-transparent border-dashed border-muted',
};

/** The lantern map as a pattern: lit, mixed, dark, unknown and coming back. */
export function MiniMap({ className }: { className?: string }): ReactNode {
  return (
    <div aria-hidden="true" className={cx('grid grid-cols-8 gap-1.5', className)}>
      {MAP.flatMap((row, r) =>
        row.split('').map((ch, c) => {
          const st = CODE[ch] ?? 'unknown';
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed illustration grid
              key={`${r}-${c}`}
              className={cx(
                'flex aspect-square items-center justify-center rounded-md border text-emphasis',
                CELL_BG[st],
              )}
            >
              <CellGlyph state={st} size={14} />
            </span>
          );
        }),
      )}
    </div>
  );
}

/** The Séance's light code: SAFE as a row of long and short flashes. */
export function FlashCode({ className }: { className?: string }): ReactNode {
  const bars = [3, 1, 1, 3, 1, 3, 3, 1, 1, 1, 3, 1];
  return (
    <div aria-hidden="true" className={cx('flex h-14 items-center gap-1.5', className)}>
      {bars.map((w, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed illustration
          key={i}
          className={cx('h-full rounded-md', i % 3 === 1 ? 'bg-surface-3' : 'bg-emphasis')}
          style={{ width: `${w * 8}px`, opacity: i % 3 === 1 ? 1 : 0.6 + (w / 3) * 0.4 }}
        />
      ))}
    </div>
  );
}

/** The Graveyard Shift: tonight's indoor temperature, with a headstone where it crosses the line. */
export function MiniGraveyard({ className }: { className?: string }): ReactNode {
  return (
    <svg aria-hidden="true" viewBox="0 0 320 140" className={cx('block h-auto w-full', className)}>
      <line
        x1="0"
        y1="96"
        x2="320"
        y2="96"
        strokeDasharray="4 6"
        style={{ stroke: 'var(--nontext-muted)' }}
        strokeWidth="1.5"
      />
      <path
        d="M0 30 C 60 34, 110 48, 160 70 S 250 104, 320 116"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        style={{ stroke: 'var(--text-emphasis)' }}
      />
      <path
        d="M0 30 C 60 34, 110 48, 160 70 S 250 104, 320 116 L 320 140 L 0 140 Z"
        style={{ fill: 'var(--glow)' }}
        opacity="0.35"
      />
      <g transform="translate(222 70)">
        <path
          d="M0 26V10a10 10 0 0 1 20 0v16z"
          style={{ fill: 'var(--surface-3)', stroke: 'var(--text-secondary)' }}
          strokeWidth="1.5"
        />
        <path
          d="M10 8v10M6 12h8"
          style={{ stroke: 'var(--text-secondary)' }}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** Candles: what a battery keeps running, as wax and a line for what remains. */
export function MiniCandles(): ReactNode {
  return (
    <div className="flex items-end gap-4">
      <Candle startPct={92} afterPct={64} label="Power bank" />
      <Candle startPct={70} afterPct={22} label="Laptop" />
      <Candle startPct={48} afterPct={40} label="Phone" />
    </div>
  );
}

/** Ghosts in a row: people heard from, and one still a ghost. */
export function MiniGhosts(): ReactNode {
  return (
    <div className="flex items-end gap-3">
      <GhostGlyph opacity={1} size={40} />
      <GhostGlyph opacity={1} size={40} />
      <GhostGlyph opacity={0.35} size={40} />
      <GhostGlyph opacity={1} size={40} loud />
    </div>
  );
}
