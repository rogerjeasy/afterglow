import { checkPassphrase } from '@afterglow/adapters';
import { type ReactNode, useState } from 'react';
import { useNow } from '../household/useHousehold';
import { Button, ChoiceChip, Notice, Section, TextField } from '../night-shell/controls';
import { token } from '../night-shell/theme';
import { useSpace } from '../spaces/useSpace';

type Mode = 'home' | 'create' | 'signin' | 'recover';
type Manage = null | 'passphrase' | 'recovery' | 'delete';

function Honest(): ReactNode {
  return (
    <Notice>
      This account lives on this device only: there is no server yet, so it does not follow you to
      another phone. Your passphrase never leaves the device and cannot be reset by anyone. If you
      forget it and lose your recovery code, your data cannot be recovered. That is the price of
      keeping it private.
    </Notice>
  );
}

function RecoveryCodeCard({
  code,
  onDone,
}: {
  code: string;
  onDone: () => void;
}): ReactNode {
  const [saved, setSaved] = useState(false);
  return (
    <Section title="Your recovery code">
      <Notice>
        This code is shown once. If you forget your passphrase it is the only way back into your
        data. Write it on paper or save it in a password manager. Anyone with it and your device can
        reset your passphrase, so keep it private.
      </Notice>
      <div
        className="clock"
        style={{
          padding: '20px 16px',
          borderRadius: 'var(--radius-tile)',
          background: token('surface.2'),
          border: `1px solid ${token('focus.ring')}`,
          color: token('text.emphasis'),
          fontSize: 'var(--type-clock-md)',
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
          userSelect: 'all',
        }}
        aria-label={`Recovery code: ${code.split('').join(' ')}`}
      >
        {code}
      </div>
      <ChoiceChip
        label={saved ? 'Yes, I have saved it' : 'I have saved it somewhere safe'}
        selected={saved}
        onClick={() => setSaved(!saved)}
      />
      <Button variant="primary" disabled={!saved} onClick={onDone}>
        Continue
      </Button>
    </Section>
  );
}

export function You(): ReactNode {
  const { controller, space } = useSpace();
  const nowMs = useNow(1000);
  const [mode, setMode] = useState<Mode>('home');
  const [manage, setManage] = useState<Manage>(null);

  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [adult, setAdult] = useState(false);
  const [moveData, setMoveData] = useState(true);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [current, setCurrent] = useState('');
  const [sure, setSure] = useState(false);

  const resetFields = (): void => {
    setName('');
    setPass('');
    setPass2('');
    setAdult(false);
    setCode('');
    setCurrent('');
    setSure(false);
  };
  const go = (m: Mode): void => {
    controller.clearMessages();
    resetFields();
    setMode(m);
  };

  const guestHasData = (() => {
    const v = space.store.getState().view;
    return v.appliances.length > 0 || v.home !== null;
  })();
  const policy = pass.length > 0 ? checkPassphrase(pass, name) : null;
  const mismatch = pass2.length > 0 && pass !== pass2;
  const selected = accountId ?? space.accounts[0]?.id ?? null;
  // Lockout is read from the service for the account in view, so it cannot be lost by navigating.
  const lockTarget = space.kind === 'account' ? (space.account?.id ?? null) : selected;
  const lockedUntil = controller.retryUntil(lockTarget);
  const waitS = lockedUntil !== null ? Math.max(0, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;
  const locked = waitS > 0;

  const messages = (
    <>
      {space.error ? (
        <div role="alert">
          <Notice>
            <span style={{ color: token('text.emphasis') }}>{space.error}</span>
          </Notice>
        </div>
      ) : null}
      {locked ? <Notice>Locked for {waitS} more seconds after too many attempts.</Notice> : null}
      {space.notice ? <Notice>{space.notice}</Notice> : null}
    </>
  );

  const header = (
    <header>
      <h1 style={{ margin: 0, fontSize: 'var(--type-title)', color: token('text.emphasis') }}>
        You
      </h1>
      <p
        style={{ margin: '8px 0 0', fontSize: 'var(--type-body)', color: token('text.secondary') }}
      >
        {space.kind === 'account'
          ? `Signed in as ${space.account?.name ?? 'your account'}.`
          : space.kind === 'demo'
            ? 'You are in the demo.'
            : 'You are using Afterglow without an account.'}
      </p>
    </header>
  );

  const frame = (children: ReactNode): ReactNode => (
    <main
      style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '8px 20px 120px',
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
      }}
    >
      {header}
      {children}
    </main>
  );

  // The recovery code is shown once, before anything else.
  if (space.recoveryCode) {
    return frame(
      <RecoveryCodeCard
        code={space.recoveryCode}
        onDone={() => controller.acknowledgeRecoveryCode()}
      />,
    );
  }

  // ----------------------------------------------------------------------- demo
  if (space.kind === 'demo') {
    return frame(
      <Section title="Demo">
        <Notice>
          Everything in the demo is simulated and kept only in memory. Nothing is saved or sent, and
          it cannot touch your real data or any account. Leave the demo to sign in or create an
          account.
        </Notice>
        <Button variant="primary" onClick={() => controller.exitDemo()}>
          Exit demo and discard it
        </Button>
      </Section>,
    );
  }

  // -------------------------------------------------------------------- account
  if (space.kind === 'account') {
    return frame(
      <>
        {messages}
        {space.saveFailed ? (
          <div role="alert">
            <Notice>
              <span style={{ color: token('text.emphasis') }}>
                The last change could not be saved to the encrypted vault. Keep this page open and
                try again.
              </span>
            </Notice>
          </div>
        ) : null}
        <Section title="Your private space">
          <Notice>
            Your data is encrypted on this device with a key only your passphrase can open. It locks
            after 10 minutes without activity, except during an outage, when Afterglow stays open so
            you are never locked out in the dark.
          </Notice>
          <Button variant="primary" onClick={() => void controller.lock()}>
            Lock now
          </Button>
        </Section>

        <Section title="Account">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <ChoiceChip
              label="Change passphrase"
              selected={manage === 'passphrase'}
              onClick={() => {
                controller.clearMessages();
                resetFields();
                setManage(manage === 'passphrase' ? null : 'passphrase');
              }}
            />
            <ChoiceChip
              label="New recovery code"
              selected={manage === 'recovery'}
              onClick={() => {
                controller.clearMessages();
                resetFields();
                setManage(manage === 'recovery' ? null : 'recovery');
              }}
            />
            <ChoiceChip
              label="Delete account"
              selected={manage === 'delete'}
              onClick={() => {
                controller.clearMessages();
                resetFields();
                setManage(manage === 'delete' ? null : 'delete');
              }}
            />
          </div>

          {manage === 'passphrase' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void controller.changePassphrase(current, pass).then((ok) => {
                  if (ok) {
                    resetFields();
                    setManage(null);
                  }
                });
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <TextField
                label="Current passphrase"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={setCurrent}
              />
              <TextField
                label="New passphrase"
                type="password"
                autoComplete="new-password"
                value={pass}
                onChange={setPass}
                error={policy && !policy.ok ? policy.reason : null}
              />
              <Button
                variant="primary"
                disabled={space.busy || locked || current.length === 0 || !policy?.ok}
                onClick={() => {
                  void controller.changePassphrase(current, pass).then((ok) => {
                    if (ok) {
                      resetFields();
                      setManage(null);
                    }
                  });
                }}
              >
                {space.busy ? 'Working…' : 'Change passphrase'}
              </Button>
            </form>
          ) : null}

          {manage === 'recovery' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Notice>
                A new code replaces the old one. The old code stops working straight away.
              </Notice>
              <TextField
                label="Your passphrase"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={setCurrent}
              />
              <Button
                variant="primary"
                disabled={space.busy || locked || current.length === 0}
                onClick={() => {
                  void controller.regenerateRecoveryCode(current).then((ok) => {
                    if (ok) {
                      resetFields();
                      setManage(null);
                    }
                  });
                }}
              >
                {space.busy ? 'Working…' : 'Make a new recovery code'}
              </Button>
            </div>
          ) : null}

          {manage === 'delete' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Notice>
                This removes the account and its encrypted data from this device for good. It cannot
                be undone, and nobody, including us, can bring it back.
              </Notice>
              <TextField
                label="Your passphrase"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={setCurrent}
              />
              <ChoiceChip
                label={sure ? 'Yes, delete it for good' : 'I understand this cannot be undone'}
                selected={sure}
                onClick={() => setSure(!sure)}
              />
              <Button
                variant="primary"
                disabled={space.busy || locked || current.length === 0 || !sure}
                onClick={() => {
                  void controller.deleteAccount(current).then((ok) => {
                    if (ok) {
                      resetFields();
                      setManage(null);
                    }
                  });
                }}
              >
                {space.busy ? 'Deleting…' : 'Delete my account'}
              </Button>
            </div>
          ) : null}
        </Section>

        <Section title="Your data">
          <Notice>The file you export is not encrypted. Keep it somewhere private.</Notice>
          <Button
            onClick={() => {
              void controller.exportData().then((text) => {
                if (!text) return;
                const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = 'afterglow-export.json';
                a.click();
                window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              });
            }}
          >
            Export my data
          </Button>
        </Section>
      </>,
    );
  }

  // ---------------------------------------------------------------------- guest
  if (mode === 'create') {
    const ready =
      name.trim().length > 0 && policy?.ok === true && pass === pass2 && adult && !space.busy;
    return frame(
      <>
        {messages}
        <Section title="Create an account">
          <Honest />
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <TextField
              label="Account name"
              name="username"
              autoComplete="username"
              value={name}
              onChange={setName}
              hint="Shown on this device so you can pick your account. Not your real name unless you want it."
            />
            <TextField
              label="Passphrase"
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={setPass}
              error={policy && !policy.ok ? policy.reason : null}
              hint="At least 12 characters. A few ordinary words works well."
            />
            <TextField
              label="Passphrase again"
              type="password"
              autoComplete="new-password"
              value={pass2}
              onChange={setPass2}
              error={mismatch ? 'These do not match yet.' : null}
            />
            <ChoiceChip
              label={adult ? 'Yes, I am 18 or older' : 'I am 18 or older'}
              selected={adult}
              onClick={() => setAdult(!adult)}
            />
            {guestHasData ? (
              <ChoiceChip
                label={
                  moveData
                    ? 'Moving what I have now into the account'
                    : 'Start the account empty (keep what I have as a guest)'
                }
                selected={moveData}
                onClick={() => setMoveData(!moveData)}
              />
            ) : null}
            <Button
              variant="primary"
              disabled={!ready}
              onClick={() => {
                void controller
                  .createAccount({
                    name,
                    passphrase: pass,
                    confirmedAdult: adult,
                    moveGuestData: guestHasData && moveData,
                  })
                  .then((ok) => {
                    resetFields();
                    if (ok) setMode('home');
                  });
              }}
            >
              {space.busy ? 'Creating…' : 'Create account'}
            </Button>
            <Button variant="ghost" onClick={() => go('home')}>
              Cancel
            </Button>
          </form>
        </Section>
      </>,
    );
  }

  if (mode === 'signin' || mode === 'recover') {
    const recovering = mode === 'recover';
    const ready = recovering
      ? selected !== null && code.trim().length > 0 && policy?.ok === true && pass === pass2
      : selected !== null && pass.length > 0;
    return frame(
      <>
        {messages}
        <Section title={recovering ? 'Use your recovery code' : 'Sign in'}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {space.accounts.map((a) => (
              <ChoiceChip
                key={a.id}
                label={a.name}
                selected={selected === a.id}
                onClick={() => setAccountId(a.id)}
              />
            ))}
          </div>
          <form
            onSubmit={(e) => e.preventDefault()}
            style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            {recovering ? (
              <>
                <TextField
                  label="Recovery code"
                  value={code}
                  onChange={setCode}
                  hint="25 letters and numbers, in groups of five."
                />
                <TextField
                  label="New passphrase"
                  type="password"
                  autoComplete="new-password"
                  value={pass}
                  onChange={setPass}
                  error={policy && !policy.ok ? policy.reason : null}
                />
                <TextField
                  label="New passphrase again"
                  type="password"
                  autoComplete="new-password"
                  value={pass2}
                  onChange={setPass2}
                  error={mismatch ? 'These do not match yet.' : null}
                />
              </>
            ) : (
              <TextField
                label="Passphrase"
                type="password"
                autoComplete="current-password"
                value={pass}
                onChange={setPass}
              />
            )}
            <Button
              variant="primary"
              disabled={!ready || space.busy || locked}
              onClick={() => {
                if (selected === null) return;
                const job = recovering
                  ? controller.recover(selected, code, pass)
                  : controller.signIn(selected, pass);
                void job.then((ok) => {
                  resetFields();
                  if (ok) setMode('home');
                });
              }}
            >
              {space.busy ? 'Working…' : recovering ? 'Reset passphrase' : 'Unlock'}
            </Button>
            {recovering ? (
              <Button variant="ghost" onClick={() => go('signin')}>
                Back to sign in
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => go('recover')}>
                I forgot my passphrase
              </Button>
            )}
            <Button variant="ghost" onClick={() => go('home')}>
              Cancel
            </Button>
          </form>
        </Section>
      </>,
    );
  }

  return frame(
    <>
      {messages}
      <Section title="Without an account">
        <Notice>
          Everything works with no account: every clock, every answer, offline. Your data stays on
          this device in plain form, like any website's saved data. An account puts it in an
          encrypted vault that only your passphrase opens.
        </Notice>
      </Section>
      <Section title="Accounts">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Button variant="primary" onClick={() => go('create')}>
            Create an account
          </Button>
          {space.accounts.length > 0 ? (
            <Button onClick={() => go('signin')}>
              Sign in ({space.accounts.length} on this device)
            </Button>
          ) : null}
        </div>
      </Section>
      <Section title="Try it first">
        <Notice>
          The demo is a simulated household and neighbourhood. Nothing in it is saved or sent.
        </Notice>
        <Button onClick={() => controller.enterDemo()}>Open the demo</Button>
      </Section>
    </>,
  );
}
