import { checkPassphrase } from '@afterglow/adapters';
import { type ReactNode, useEffect, useState } from 'react';
import { useNow } from '../household/useHousehold';
import { ChoiceChip, TextField } from '../night-shell/controls';
import { navigate } from '../router';
import { useSpace } from '../spaces/useSpace';
import { AuthLayout } from './AuthLayout';
import {
  Divider,
  FooterLink,
  Messages,
  RecoveryCodeStep,
  SubmitButton,
  TextAction,
  lockSeconds,
} from './shared';

/**
 * `/signin` (web-experience WX-08): the cloud account by email and passphrase, and the
 * device-only accounts on this device, with the recovery-code way back in. The flows
 * are the space controller's, exactly as the You screen drives them.
 */

type Way = 'cloud' | 'device' | 'recover';

export function SignIn(): ReactNode {
  const { controller, space } = useSpace();
  const nowMs = useNow(1000);
  // Cloud-linked accounts open through the email sign-in, so the server copy stays in step.
  const localAccounts = space.accounts.filter((a) => !(a.id in space.cloudLinks));
  const [way, setWay] = useState<Way>(space.cloudAvailable ? 'cloud' : 'device');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [code, setCode] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);

  const selected = accountId ?? localAccounts[0]?.id ?? null;
  const waitS = lockSeconds(controller.retryUntil(way === 'cloud' ? null : selected), nowMs);
  const locked = waitS > 0;

  // Already signed in: the product, not a form. A pending recovery code is shown first.
  useEffect(() => {
    if (space.kind === 'account' && !space.recoveryCode) navigate('/app', { replace: true });
  }, [space.kind, space.recoveryCode]);

  const switchTo = (w: Way): void => {
    controller.clearMessages();
    setPass('');
    setPass2('');
    setCode('');
    setWay(w);
  };

  if (space.recoveryCode) {
    return (
      <AuthLayout title="One more thing" lead="Save this before you go on. It is shown only once.">
        <RecoveryCodeStep
          code={space.recoveryCode}
          onDone={() => {
            controller.acknowledgeRecoveryCode();
            navigate('/app', { replace: true });
          }}
        />
      </AuthLayout>
    );
  }

  const footer = (
    <>
      <span>
        New here? <FooterLink to="/signup">Create an account</FooterLink>
      </span>
      <span>
        Or <FooterLink to="/app?tour=1">try the demo instead</FooterLink>, nothing is saved.
      </span>
    </>
  );

  // ------------------------------------------------------------------ cloud
  if (way === 'cloud' && space.cloudAvailable) {
    const ready = email.includes('@') && pass.length > 0 && !space.busy && !locked;
    const submit = (): void => {
      if (!ready) return;
      void controller.cloudSignIn(email, pass).then((ok) => {
        setPass('');
        if (ok) navigate('/app');
      });
    };
    return (
      <AuthLayout
        title="Welcome back"
        lead="Sign in to open your household on this device. It is decrypted here, never on a server."
        footer={footer}
      >
        <Messages space={space} waitS={waitS} />
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Email"
            name="email"
            autoComplete="username"
            value={email}
            onChange={setEmail}
          />
          <TextField
            label="Passphrase"
            type="password"
            name="password"
            autoComplete="current-password"
            value={pass}
            onChange={setPass}
          />
          <SubmitButton disabled={!ready} busy={space.busy}>
            {space.busy ? 'Opening your household…' : 'Sign in'}
          </SubmitButton>
        </form>
        {localAccounts.length > 0 ? (
          <>
            <Divider>or</Divider>
            <TextAction onClick={() => switchTo('device')}>
              Open a device-only account ({localAccounts.length})
            </TextAction>
          </>
        ) : null}
      </AuthLayout>
    );
  }

  // ----------------------------------------------------------- device-only
  if (localAccounts.length === 0) {
    return (
      <AuthLayout
        title="Sign in"
        lead="There is no account on this device yet."
        footer={
          <span>
            Or <FooterLink to="/app?tour=1">try the demo instead</FooterLink>, nothing is saved.
          </span>
        }
      >
        <p className="m-0 text-body text-secondary">
          Everything in Afterglow works without an account. An account puts your household in an
          encrypted vault that only your passphrase opens.
        </p>
        <SubmitButtonLink to="/signup">Create an account</SubmitButtonLink>
        <TextAction onClick={() => navigate('/app')}>Use it without an account</TextAction>
      </AuthLayout>
    );
  }

  const recovering = way === 'recover';
  const policy = pass.length > 0 ? checkPassphrase(pass, '') : null;
  const mismatch = pass2.length > 0 && pass !== pass2;
  const ready =
    selected !== null &&
    !space.busy &&
    !locked &&
    (recovering
      ? code.trim().length > 0 && policy?.ok === true && pass === pass2
      : pass.length > 0);
  const submit = (): void => {
    if (!ready || selected === null) return;
    const job = recovering
      ? controller.recover(selected, code, pass)
      : controller.signIn(selected, pass);
    void job.then((ok) => {
      setPass('');
      setPass2('');
      setCode('');
      // A recovery shows a fresh recovery code first; the effect above waits for it.
      if (ok && !recovering) navigate('/app');
    });
  };

  return (
    <AuthLayout
      title={recovering ? 'Use your recovery code' : 'Unlock this device'}
      lead={
        recovering
          ? 'Your recovery code resets the passphrase. Nobody else, including us, can do it for you.'
          : 'A device-only account lives here, encrypted with a key only your passphrase opens.'
      }
      footer={footer}
    >
      <Messages space={space} waitS={waitS} />
      <fieldset className="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
        <legend className="mb-2.5 p-0 text-label text-secondary">Account</legend>
        <div className="flex flex-wrap gap-2">
          {localAccounts.map((a) => (
            <ChoiceChip
              key={a.id}
              label={a.name}
              selected={selected === a.id}
              onClick={() => setAccountId(a.id)}
            />
          ))}
        </div>
      </fieldset>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
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
        <SubmitButton disabled={!ready} busy={space.busy}>
          {space.busy ? 'Working…' : recovering ? 'Reset passphrase' : 'Unlock'}
        </SubmitButton>
      </form>
      <div className="flex flex-wrap justify-center gap-1">
        {recovering ? (
          <TextAction onClick={() => switchTo('device')}>Back to unlock</TextAction>
        ) : (
          <TextAction onClick={() => switchTo('recover')}>I forgot my passphrase</TextAction>
        )}
        {space.cloudAvailable ? (
          <TextAction onClick={() => switchTo('cloud')}>Sign in with email</TextAction>
        ) : null}
      </div>
    </AuthLayout>
  );
}

/** A primary call to action that is a link, shaped like the form's submit button. */
function SubmitButtonLink({ to, children }: { to: string; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="press inline-flex min-h-14 w-full items-center justify-center rounded-full border border-ring bg-control-primary px-6 text-label font-bold text-control-label transition-transform duration-200 hover:-translate-y-px"
    >
      {children}
    </button>
  );
}
