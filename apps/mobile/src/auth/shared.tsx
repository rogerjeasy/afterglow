import { checkPassphrase } from '@afterglow/adapters';
import { type ReactNode, useState } from 'react';
import { ChoiceChip, Notice } from '../night-shell/controls';
import { Link } from '../router';
import type { SpaceState } from '../spaces/controller';
import { Icon } from '../ui/icons';
import { cx } from '../ui/kit';

/**
 * Pieces shared by the sign-in and sign-up pages. The flows themselves are the space
 * controller's (spaces/controller.ts), exactly as the You screen drives them.
 */

/** The form's primary action. A real submit button, so Enter submits the form. */
export function SubmitButton({
  children,
  disabled,
  busy,
}: {
  children: ReactNode;
  disabled?: boolean | undefined;
  busy?: boolean | undefined;
}): ReactNode {
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-busy={busy ? true : undefined}
      className={cx(
        'press group inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-full border border-ring bg-control-primary px-6 text-label font-bold text-control-label transition-[transform,opacity] duration-200 ease-out',
        disabled ? 'cursor-not-allowed opacity-50' : 'hover:-translate-y-px',
      )}
    >
      {children}
      {busy || disabled ? null : (
        <span className="transition-transform duration-300 ease-out group-hover:translate-x-1">
          <Icon name="arrowRight" size={20} />
        </span>
      )}
    </button>
  );
}

/** A quiet text action inside the card ("I forgot my passphrase"). */
export function TextAction({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press inline-flex min-h-11 items-center justify-center rounded-full px-3 text-caption font-bold text-secondary transition-colors hover:text-primary"
    >
      {children}
    </button>
  );
}

/** A link in the line under the card. */
export function FooterLink({ to, children }: { to: string; children: ReactNode }): ReactNode {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center font-bold text-primary underline decoration-hairline underline-offset-4 transition-colors hover:text-emphasis"
    >
      {children}
    </Link>
  );
}

/** Seconds left in a sign-in lockout for the account in view, or 0. */
export function lockSeconds(until: number | null, nowMs: number): number {
  return until !== null ? Math.max(0, Math.ceil((until - nowMs) / 1000)) : 0;
}

/** The controller's error, lockout and neutral notice, in that order. */
export function Messages({ space, waitS }: { space: SpaceState; waitS: number }): ReactNode {
  return (
    <>
      {space.error ? (
        <div role="alert">
          <Notice>
            <span className="flex items-start gap-2.5 text-emphasis">
              <span className="mt-0.5 flex-none">
                <Icon name="help" size={18} />
              </span>
              <span>{space.error}</span>
            </span>
          </Notice>
        </div>
      ) : null}
      {waitS > 0 ? (
        <output className="block">
          <Notice>
            Locked for <span className="clock text-primary">{waitS}</span> more seconds after too
            many attempts.
          </Notice>
        </output>
      ) : null}
      {space.notice ? <Notice>{space.notice}</Notice> : null}
    </>
  );
}

/** What a cloud account is, and is not (cloud-accounts CA-09, CA-10). */
export function CloudHonest(): ReactNode {
  return (
    <Notice>
      Your household is encrypted on this device before it goes anywhere. The server keeps only that
      ciphertext, so nobody else can read it: not another user, and not Afterglow. Your passphrase
      never leaves the device. If you forget it and lose your recovery code, nobody can recover the
      data. That is the price of keeping it private.
    </Notice>
  );
}

/** What a device-only account is, and is not. */
export function DeviceHonest(): ReactNode {
  return (
    <Notice>
      A device-only account lives on this phone and does not follow you to another one. Your
      passphrase never leaves the device and cannot be reset by anyone. If you forget it and lose
      your recovery code, your data cannot be recovered. That is the price of keeping it private.
    </Notice>
  );
}

const RULES: readonly { label: string; test: (p: string) => boolean }[] = [
  { label: 'At least 12 characters', test: (p) => [...p.normalize('NFKC')].length >= 12 },
  { label: 'A few ordinary words work well', test: (p) => /\S+[\s\-_.]+\S+/.test(p.trim()) },
];

/**
 * The passphrase's requirements, ticked as they are met, and the policy's own verdict.
 * The bar is the policy (adapters/accounts/policy.ts), never a guess of strength.
 */
export function PassphraseHint({ pass, name }: { pass: string; name: string }): ReactNode {
  if (pass.length === 0)
    return (
      <p className="m-0 -mt-2 text-caption text-secondary">
        At least 12 characters. A few ordinary words strung together works well. It never leaves
        this device.
      </p>
    );
  const policy = checkPassphrase(pass, name);
  const met = RULES.filter((r) => r.test(pass)).length + (policy.ok ? 1 : 0);
  return (
    <div className="-mt-2 flex flex-col gap-2.5" aria-live="polite">
      <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cx(
              'h-1.5 rounded-full transition-opacity duration-300',
              i < met ? 'bg-emphasis opacity-100' : 'bg-surface-3 opacity-100',
            )}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {RULES.map((r) => {
          const ok = r.test(pass);
          return (
            <li
              key={r.label}
              className={cx(
                'flex items-center gap-2 text-caption',
                ok ? 'text-primary' : 'text-secondary',
              )}
            >
              <span className={cx('flex-none', ok ? 'opacity-100' : 'opacity-40')}>
                <Icon name="check" size={16} />
              </span>
              {r.label}
            </li>
          );
        })}
        <li
          className={cx(
            'flex items-start gap-2 text-caption',
            policy.ok ? 'text-primary' : 'text-emphasis',
          )}
        >
          <span className={cx('mt-0.5 flex-none', policy.ok ? 'opacity-100' : 'opacity-40')}>
            <Icon name="check" size={16} />
          </span>
          {policy.ok ? 'Good. Write it down somewhere safe.' : policy.reason}
        </li>
      </ul>
    </div>
  );
}

/** The recovery code, shown once, before anything else (ACC-12). */
export function RecoveryCodeStep({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}): ReactNode {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (saved) onDone();
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-11 flex-none items-center justify-center rounded-xl border border-ring bg-control-primary text-control-label">
          <Icon name="key" size={22} />
        </span>
        <h2 className="m-0 text-headline font-bold text-emphasis">Your recovery code</h2>
      </div>
      <Notice>
        This code is shown once. If you forget your passphrase it is the only way back into your
        data. Write it on paper or save it in a password manager. Anyone with it and your device can
        reset your passphrase, so keep it private.
      </Notice>
      <div
        className="clock rounded-[var(--radius-tile)] border border-ring bg-surface-2 px-4 py-5 text-[length:var(--type-clock-md)] leading-snug text-emphasis select-all [overflow-wrap:anywhere]"
        aria-label={`Recovery code: ${code.split('').join(' ')}`}
      >
        {code}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(code)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
        className="press inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-full border border-hairline bg-control px-4 text-caption font-bold text-primary"
      >
        <Icon name={copied ? 'check' : 'book'} size={18} />
        {copied ? 'Copied' : 'Copy the code'}
      </button>
      <ChoiceChip
        label={saved ? 'Yes, I have saved it' : 'I have saved it somewhere safe'}
        selected={saved}
        onClick={() => setSaved(!saved)}
      />
      <SubmitButton disabled={!saved}>Continue to Afterglow</SubmitButton>
    </form>
  );
}

/** "Or" between two ways in. */
export function Divider({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-3 text-caption text-muted" aria-hidden="true">
      <span className="rule flex-1" />
      {children}
      <span className="rule flex-1" />
    </div>
  );
}
