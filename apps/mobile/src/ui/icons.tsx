import type { ReactNode } from 'react';

/**
 * Lantern Icons (night-vision rule 9): a 24 px grid, a 2 px round stroke, no fill,
 * drawn in `currentColor` so they take whatever token the text around them has.
 */

export type IconName =
  | 'hearth'
  | 'lantern'
  | 'seance'
  | 'tombstone'
  | 'candle'
  | 'bell'
  | 'user'
  | 'menu'
  | 'close'
  | 'arrowRight'
  | 'arrowUpRight'
  | 'check'
  | 'shield'
  | 'lock'
  | 'map'
  | 'signal'
  | 'bolt'
  | 'boltOff'
  | 'moon'
  | 'eye'
  | 'cloudOff'
  | 'code'
  | 'building'
  | 'radio'
  | 'pill'
  | 'snow'
  | 'people'
  | 'battery'
  | 'phone'
  | 'plug'
  | 'wave'
  | 'mic'
  | 'flashlight'
  | 'book'
  | 'chart'
  | 'clock'
  | 'globe'
  | 'key'
  | 'logout'
  | 'sparkle'
  | 'play'
  | 'heart'
  | 'help'
  | 'chevronDown'
  | 'settings';

const PATHS: Record<IconName, ReactNode> = {
  hearth: (
    <>
      <path d="M4 21V10a8 8 0 0 1 16 0v11" />
      <path d="M12 18c-2 0-3-1.3-3-2.8 0-1.8 2-2.7 2-4.7 1.7 1 4 2.6 4 5.1 0 1.4-1.1 2.4-3 2.4Z" />
    </>
  ),
  lantern: (
    <>
      <path d="M9 2.5h6M12 2.5V5" />
      <path d="M7.5 5h8l1.5 4v8a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2V9z" />
      <circle cx="11.5" cy="13" r="2" />
    </>
  ),
  seance: (
    <>
      <circle cx="12" cy="13" r="4" />
      <path d="M12 3v3M4.5 6.5l2 2M19.5 6.5l-2 2M3 13h2M19 13h2" />
    </>
  ),
  tombstone: (
    <>
      <path d="M6 21V10a6 6 0 0 1 12 0v11" />
      <path d="M3 21h18" />
      <path d="M12 9v5M10 11h4" />
    </>
  ),
  candle: (
    <>
      <path d="M12 3c1.5 2 2 3 0 5-2-2-1.5-3 0-5z" />
      <rect x="8" y="10" width="8" height="11" rx="1" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowUpRight: <path d="M7 17L17 7M8 7h9v9" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  shield: (
    <>
      <path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </>
  ),
  map: (
    <>
      <path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  signal: (
    <>
      <path d="M5 20v-3M10 20v-7M15 20V9M20 20V4" />
    </>
  ),
  bolt: <path d="M13 2L4.5 13.5H12L11 22l8.5-11.5H12z" />,
  boltOff: (
    <>
      <path d="M13 2l-2.6 3.5M8.2 8.5l-3.7 5H12L11 22l4.3-5.8M17.4 13.3l2.1-2.8H14" />
      <path d="M3 3l18 18" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  eye: (
    <>
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  cloudOff: (
    <>
      <path d="M7.5 18.5H6a4 4 0 0 1-.7-7.94M9.4 6.1A6 6 0 0 1 18 10h.5a3.5 3.5 0 0 1 2.2 6.2" />
      <path d="M3 3l18 18" />
    </>
  ),
  code: <path d="M8.5 7L3.5 12l5 5M15.5 7l5 5-5 5M13.5 4.5l-3 15" />,
  building: (
    <>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11" />
      <path d="M2.5 21h19M8 8h3M8 12h3M8 16h3" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  pill: (
    <>
      <rect x="2.6" y="8.2" width="18.8" height="7.6" rx="3.8" transform="rotate(-45 12 12)" />
      <path d="M8.6 8.6l6.8 6.8" />
    </>
  ),
  snow: (
    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" />
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
    </>
  ),
  battery: (
    <>
      <rect x="2.5" y="7" width="17" height="10" rx="2" />
      <path d="M22 10.5v3M6 10v4M9.5 10v4" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  plug: (
    <>
      <path d="M9 2.5v5M15 2.5v5M6 7.5h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 16.5v5" />
    </>
  ),
  wave: <path d="M2 12h3l2.5-6 4 12 3.5-9 2.5 6 1.5-3h3" />,
  mic: (
    <>
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4" />
    </>
  ),
  flashlight: (
    <>
      <path d="M8 2.5h8v4l-2 3v12h-4v-12l-2-3z" />
      <path d="M8 6.5h8M12 13v2" />
    </>
  ),
  book: (
    <>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z" />
      <path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3" />
    </>
  ),
  chart: <path d="M3.5 3.5v17h17M7.5 15l4-4.5 3 3 5.5-6.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      <path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2" />
    </>
  ),
  logout: <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M9.5 16.5L5 12l4.5-4.5M5 12h10" />,
  sparkle: (
    <path d="M12 3l1.8 5.4a2 2 0 0 0 1.3 1.3L20.5 11.5l-5.4 1.8a2 2 0 0 0-1.3 1.3L12 20l-1.8-5.4a2 2 0 0 0-1.3-1.3L3.5 11.5l5.4-1.8a2 2 0 0 0 1.3-1.3z" />
  ),
  play: <path d="M7 4.5v15l12.5-7.5z" />,
  heart: (
    <path d="M12 20s-8-4.6-8-10.5A4.5 4.5 0 0 1 12 6.6a4.5 4.5 0 0 1 8 2.9C20 15.4 12 20 12 20z" />
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.3" />
    </>
  ),
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1" />
    </>
  ),
};

export function Icon({
  name,
  size = 24,
  className,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  /** Give a title only when the icon stands alone and carries meaning. */
  title?: string;
}): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'block flex-none'}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}
