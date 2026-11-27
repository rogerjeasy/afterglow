import type { LuminanceMode } from '@afterglow/design-system';
import type { ReactNode } from 'react';
import { formatTimer } from '../format';
import type { Key } from '../i18n/catalogue';
import { useT } from '../i18n/i18n';
import { openLight } from '../light/LightMode';
import { ModeSwitch } from '../night-shell/components';
import { AlertsButton, TabBar, type TabId, YouButton } from '../night-shell/controls';
import { Link } from '../router';
import type { SpaceState } from '../spaces/controller';
import { Icon, type IconName } from '../ui/icons';
import { LogoMark, cx } from '../ui/kit';

/**
 * The product's frame (web-experience WX-05). On a desk: a sidebar with every
 * destination, named in costume and in plain words, and a slim top bar. On a phone
 * or tablet: a compact header and the five-tab bar. The content is the screen.
 */

export const TAB_PATH: Record<TabId, string> = {
  hearth: '/app',
  lantern: '/app/lantern',
  seance: '/app/seance',
  cold: '/app/cold',
  plan: '/app/plan',
  you: '/app/account',
  alerts: '/app/alerts',
  business: '/app/business',
  beacon: '/app/beacon',
  field: '/app/field',
};

export function tabFromPath(path: string): TabId {
  const seg = path.replace(/^\/app\/?/, '').split('/')[0] ?? '';
  switch (seg) {
    case 'lantern':
    case 'seance':
    case 'cold':
    case 'plan':
    case 'alerts':
    case 'business':
    case 'beacon':
    case 'field':
      return seg;
    case 'account':
    case 'you':
      return 'you';
    default:
      return 'hearth';
  }
}

interface NavItem {
  id: TabId;
  icon: IconName;
  label: string;
  key?: Key;
  hint: string;
}

const PRIMARY: readonly NavItem[] = [
  { id: 'hearth', icon: 'hearth', key: 'tab.hearth', label: 'Hearth', hint: 'Tonight at a glance' },
  { id: 'lantern', icon: 'lantern', key: 'tab.lantern', label: 'Lantern', hint: 'Your area, live' },
  { id: 'seance', icon: 'seance', key: 'tab.seance', label: 'Séance', hint: 'Your people' },
  { id: 'cold', icon: 'tombstone', key: 'tab.cold', label: 'Cold', hint: 'Food and medicine' },
  { id: 'plan', icon: 'candle', key: 'tab.plan', label: 'Plan', hint: 'Power and readiness' },
];

const ORG: readonly NavItem[] = [
  { id: 'business', icon: 'building', label: 'Business', hint: 'Pharmacies, clinics, shelters' },
  { id: 'beacon', icon: 'radio', label: 'Beacon', hint: 'Cities and responders' },
];

export const TAB_TITLE: Record<TabId, string> = {
  hearth: 'Hearth',
  lantern: 'Lantern',
  seance: 'Séance',
  cold: 'Cold',
  plan: 'Plan',
  you: 'You',
  alerts: 'Alerts',
  business: 'Business',
  beacon: 'Beacon',
  field: 'Field checks',
};

function SideLink({
  item,
  active,
  onGo,
  badge,
}: {
  item: NavItem;
  active: boolean;
  onGo: (id: TabId) => void;
  badge?: number | undefined;
}): ReactNode {
  const tr = useT();
  return (
    <button
      type="button"
      onClick={() => onGo(item.id)}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'group relative flex min-h-14 w-full items-center gap-3.5 rounded-2xl border px-3.5 text-left transition-colors duration-200',
        active
          ? 'border-hairline bg-surface-3 text-emphasis'
          : 'border-transparent bg-transparent text-secondary hover:bg-surface-2 hover:text-primary',
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          'absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-emphasis transition-[transform,opacity] duration-300 ease-out',
          active ? 'scale-y-100 opacity-100' : 'scale-y-0 opacity-0',
        )}
      />
      <span
        className={cx(
          'flex size-10 flex-none items-center justify-center rounded-xl border transition-colors duration-200',
          active
            ? 'border-ring bg-control-primary text-control-label'
            : 'border-hairline bg-surface-1',
        )}
      >
        <Icon name={item.icon} size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label leading-tight font-bold">
          {item.key ? tr(item.key) : item.label}
        </span>
        <span className="text-caption leading-tight text-secondary">{item.hint}</span>
      </span>
      {badge && badge > 0 ? (
        <span className="clock flex h-7 min-w-7 items-center justify-center rounded-full border border-ring bg-surface-2 px-2 text-caption text-emphasis">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function PowerPill({
  outageStartedAtMs,
  nowMs,
}: { outageStartedAtMs: number | null; nowMs: number }): ReactNode {
  const out = outageStartedAtMs !== null;
  return (
    <span
      className={cx(
        'inline-flex min-h-11 items-center gap-2.5 rounded-full border px-4 text-caption',
        out
          ? 'border-ring bg-surface-2 text-emphasis'
          : 'border-hairline bg-surface-1 text-secondary',
      )}
    >
      <Icon name={out ? 'boltOff' : 'bolt'} size={18} />
      {out ? (
        <>
          <span>Outage</span>
          <span className="clock text-primary">
            {formatTimer(nowMs - (outageStartedAtMs as number))}
          </span>
        </>
      ) : (
        <span>Mains on</span>
      )}
    </span>
  );
}

function spaceLabel(space: SpaceState): { title: string; detail: string } {
  if (space.kind === 'demo')
    return { title: 'Demo household', detail: 'Simulated. Nothing is saved.' };
  if (space.kind === 'account')
    return {
      title: space.cloud?.email ?? space.account?.name ?? 'Your account',
      detail: space.cloud ? 'Encrypted and synced' : 'Encrypted on this device',
    };
  return { title: 'Guest', detail: 'Saved on this device only' };
}

export function AppShell({
  tab,
  onGo,
  mode,
  onCycleMode,
  alertCount,
  critical,
  space,
  onExitDemo,
  onLock,
  outageStartedAtMs,
  nowMs,
  bare,
  children,
}: {
  tab: TabId;
  onGo: (id: TabId) => void;
  mode: LuminanceMode;
  onCycleMode: () => void;
  alertCount: number;
  critical: boolean;
  space: SpaceState;
  onExitDemo: () => void;
  onLock: () => void;
  outageStartedAtMs: number | null;
  nowMs: number;
  /** The first-run welcome: no navigation yet, only the header. */
  bare: boolean;
  children: ReactNode;
}): ReactNode {
  const who = spaceLabel(space);
  const signedIn = space.kind === 'account';
  const initial = (who.title.trim()[0] ?? 'G').toUpperCase();

  return (
    <div className={cx('relative min-h-dvh bg-bg', !bare && 'lg:pl-[300px]')}>
      {/* ---------------------------------------------------------------- sidebar */}
      {bare ? null : (
        <aside
          aria-label="Afterglow"
          className="fixed inset-y-0 left-0 z-10 hidden w-[300px] flex-col border-r border-hairline bg-surface-1 lg:flex"
        >
          <div className="flex h-[76px] flex-none items-center px-6">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-3 rounded-xl text-emphasis no-underline"
              aria-label="Afterglow, public site"
            >
              <LogoMark size={34} />
              <span className="font-display text-[24px] font-semibold tracking-[-0.01em]">
                Afterglow
              </span>
            </Link>
          </div>

          <nav
            aria-label="Product"
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3.5 pb-4"
          >
            <div className="px-3 pt-3 pb-2 text-caption text-muted">Tonight</div>
            {PRIMARY.map((item) => (
              <SideLink key={item.id} item={item} active={tab === item.id} onGo={onGo} />
            ))}
            <div className="px-3 pt-5 pb-2 text-caption text-muted">Inbox</div>
            <SideLink
              item={{ id: 'alerts', icon: 'bell', label: 'Alerts', hint: 'What needs you' }}
              active={tab === 'alerts'}
              onGo={onGo}
              badge={alertCount}
            />
            <SideLink
              item={{ id: 'you', icon: 'settings', label: 'You', hint: 'Account and privacy' }}
              active={tab === 'you'}
              onGo={onGo}
            />
            <SideLink
              item={{ id: 'field', icon: 'check', label: 'Field checks', hint: 'Test it yourself' }}
              active={tab === 'field'}
              onGo={onGo}
            />
            {signedIn ? (
              <>
                <div className="px-3 pt-5 pb-2 text-caption text-muted">Organisations</div>
                {ORG.map((item) => (
                  <SideLink key={item.id} item={item} active={tab === item.id} onGo={onGo} />
                ))}
              </>
            ) : null}
          </nav>

          <div className="flex flex-none flex-col gap-3 border-t border-hairline p-4">
            <button
              type="button"
              onClick={() => openLight()}
              className="press flex min-h-12 items-center gap-3 rounded-2xl border border-hairline bg-control px-4 text-label text-primary transition-transform duration-200 hover:-translate-y-px"
            >
              <Icon name="flashlight" size={22} />
              Use as a light
            </button>
            <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-2 p-3">
              <span className="flex size-11 flex-none items-center justify-center rounded-full border border-ring bg-control-primary font-display text-[20px] text-control-label">
                {space.kind === 'demo' ? <Icon name="sparkle" size={20} /> : initial}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-caption font-bold text-primary [overflow-wrap:anywhere]">
                  {who.title}
                </span>
                <span className="text-caption leading-tight text-secondary">{who.detail}</span>
              </span>
              {signedIn ? (
                <button
                  type="button"
                  onClick={onLock}
                  aria-label="Lock your account"
                  className="press flex size-11 flex-none items-center justify-center rounded-full border border-hairline bg-control text-secondary hover:text-primary"
                >
                  <Icon name="lock" size={20} />
                </button>
              ) : null}
            </div>
          </div>
        </aside>
      )}

      {/* ---------------------------------------------------------------- top bar */}
      <header className="sticky top-0 z-[9] border-b border-hairline bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-3 px-5 sm:px-8 lg:h-[76px] lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/"
              className={cx(
                'inline-flex min-h-11 items-center gap-2.5 rounded-xl text-emphasis no-underline',
                !bare && 'lg:hidden',
              )}
              aria-label="Afterglow, public site"
            >
              <LogoMark size={32} />
              <span className="font-display text-[clamp(20px,6vw,24px)] font-semibold tracking-[-0.01em]">
                Afterglow
              </span>
            </Link>
            {bare ? null : (
              <div className="hidden min-w-0 items-center gap-3 lg:flex">
                <span className="text-caption text-muted">Afterglow</span>
                <span className="text-caption text-muted" aria-hidden="true">
                  /
                </span>
                <span className="text-label font-bold text-primary">{TAB_TITLE[tab]}</span>
              </div>
            )}
          </div>

          <div className="flex flex-none items-center gap-2 sm:gap-2.5">
            <span className="hidden md:inline-flex">
              <PowerPill outageStartedAtMs={outageStartedAtMs} nowMs={nowMs} />
            </span>
            <span className="sm:hidden">
              <ModeSwitch mode={mode} onCycle={onCycleMode} compact />
            </span>
            <span className="hidden sm:inline-flex">
              <ModeSwitch mode={mode} onCycle={onCycleMode} />
            </span>
            {bare ? null : (
              <>
                <AlertsButton
                  active={tab === 'alerts'}
                  count={alertCount}
                  critical={critical}
                  onClick={() => onGo('alerts')}
                />
                <span className="lg:hidden">
                  <YouButton active={tab === 'you'} onClick={() => onGo('you')} />
                </span>
                {space.kind === 'guest' ? (
                  <Link
                    to="/signin"
                    className="press hidden min-h-11 items-center rounded-full border border-ring bg-control-primary px-4 text-caption font-bold text-control-label no-underline xl:inline-flex"
                  >
                    Sign in
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------- space banner */}
      {space.kind === 'demo' && !bare ? (
        <div className="mx-auto max-w-[1240px] px-5 pt-4 sm:px-8 lg:px-10">
          <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border border-ring bg-surface-2 px-4 py-2.5 sm:py-3">
            <p className="m-0 flex items-start gap-2.5 text-caption text-secondary">
              <span className="mt-0.5 text-emphasis">
                <Icon name="sparkle" size={18} />
              </span>
              <span>
                <span className="font-bold text-primary">Demo: </span>
                simulated household and neighbourhood.
                <span className="hidden sm:inline">
                  {' '}
                  Nothing is saved or sent, and it cannot touch real data.
                </span>
              </span>
            </p>
            <button
              type="button"
              onClick={onExitDemo}
              className="press inline-flex min-h-11 flex-none items-center justify-center rounded-full border border-ring bg-control-primary px-4 text-caption font-bold text-control-label"
            >
              Exit demo
            </button>
          </div>
        </div>
      ) : null}

      {children}

      {bare ? null : <TabBar active={tab} onSelect={onGo} />}
    </div>
  );
}
