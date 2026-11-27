import { checkPassphrase } from '@afterglow/adapters';
import { type ReactNode, useEffect, useState } from 'react';
import { ChoiceChip, TextField } from '../night-shell/controls';
import { navigate } from '../router';
import { useSpace } from '../spaces/useSpace';
import { Icon } from '../ui/icons';
import { cx } from '../ui/kit';
import { AuthLayout } from './AuthLayout';
import {
  CloudHonest,
  DeviceHonest,
  FooterLink,
  Messages,
  PassphraseHint,
  RecoveryCodeStep,
  SubmitButton,
  TextAction,
} from './shared';

/**
 * `/signup` (web-experience WX-08): details → the emailed code → the recovery code,
 * shown once → the product. Without the account service, a device-only account.
 * The flows are the space controller's, exactly as the You screen drives them.
 */

type Kind = 'cloud' | 'device';

const STEPS = ['Your details', 'Confirm your email', 'Save your recovery code'] as const;

function Steps({ at }: { at: 0 | 1 | 2 }): ReactNode {
  return (
    <ol className="m-0 flex list-none gap-2 p-0" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li
          key={s}
          aria-current={i === at ? 'step' : undefined}
          className="flex min-w-0 flex-1 flex-col gap-2"
        >
          <span
            aria-hidden="true"
            className={cx(
              'h-1 rounded-full transition-opacity duration-300',
              i <= at ? 'bg-emphasis' : 'bg-surface-3',
            )}
          />
          <span
            className={cx(
              'text-caption leading-tight',
              i === at ? 'text-primary' : 'text-secondary',
              i === at ? '' : 'sr-only sm:not-sr-only',
            )}
          >
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SignUp(): ReactNode {
  const { controller, space } = useSpace();
  const [kind, setKind] = useState<Kind>(space.cloudAvailable ? 'cloud' : 'device');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [adult, setAdult] = useState(false);
  const [moveData, setMoveData] = useState(true);
  const [code, setCode] = useState('');

  // Already signed in, with nothing left to show: the product.
  useEffect(() => {
    if (space.kind === 'account' && !space.recoveryCode) navigate('/app', { replace: true });
  }, [space.kind, space.recoveryCode]);

  const guestHasData =
    space.kind === 'guest' &&
    (() => {
      const v = space.store.getState().view;
      return v.appliances.length > 0 || v.home !== null;
    })();
  const footer = (
    <>
      <span>
        Already have an account? <FooterLink to="/signin">Sign in</FooterLink>
      </span>
      <span>
        Or <FooterLink to="/app">use it without an account</FooterLink>: everything works.
      </span>
    </>
  );

  // ----------------------------------------------------- 3. the recovery code
  if (space.recoveryCode) {
    return (
      <AuthLayout title="Your account is ready" lead="One last step, and it matters.">
        {kind === 'cloud' ? <Steps at={2} /> : null}
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

  // ------------------------------------------------- 2. the code from the email
  if (space.cloudPending) {
    const ready = code.trim().length >= 6 && !space.busy;
    const submit = (): void => {
      if (!ready) return;
      void controller.cloudConfirm(code).then((ok) => {
        if (ok) setCode('');
      });
    };
    return (
      <AuthLayout
        title="Check your email"
        lead={
          <>
            We sent a code to <span className="text-primary">{space.cloudPending.email}</span>. It
            can take a minute to arrive; look in spam too.
          </>
        }
        footer={footer}
      >
        <Steps at={1} />
        <Messages space={space} waitS={0} />
        <form
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Code from the email"
            name="one-time-code"
            autoComplete="one-time-code"
            value={code}
            onChange={setCode}
          />
          <SubmitButton disabled={!ready} busy={space.busy}>
            {space.busy ? 'Creating your account…' : 'Confirm and create my account'}
          </SubmitButton>
        </form>
        <div className="flex flex-wrap justify-center gap-1">
          <TextAction onClick={() => void controller.cloudResend()}>Send a new code</TextAction>
          <TextAction
            onClick={() => {
              controller.cloudCancel();
              setCode('');
            }}
          >
            Start again
          </TextAction>
        </div>
      </AuthLayout>
    );
  }

  // ------------------------------------------------------------ 1. details
  const cloud = kind === 'cloud' && space.cloudAvailable;
  const policyName = cloud ? email : name;
  const policy = pass.length > 0 ? checkPassphrase(pass, policyName) : null;
  const mismatch = pass2.length > 0 && pass !== pass2;
  const identityOk = cloud ? email.includes('@') : name.trim().length > 0;
  const ready = identityOk && policy?.ok === true && pass === pass2 && adult && !space.busy;
  const submit = (): void => {
    if (!ready) return;
    if (cloud) {
      void controller.cloudSignUp({
        email,
        passphrase: pass,
        confirmedAdult: adult,
        moveGuestData: guestHasData && moveData,
      });
    } else {
      void controller
        .createAccount({
          name,
          passphrase: pass,
          confirmedAdult: adult,
          moveGuestData: guestHasData && moveData,
        })
        .then((ok) => {
          if (ok) {
            setPass('');
            setPass2('');
          }
        });
    }
  };
  const switchKind = (k: Kind): void => {
    controller.clearMessages();
    setPass('');
    setPass2('');
    setKind(k);
  };

  return (
    <AuthLayout
      title={cloud ? 'Create your account' : 'Keep an account on this device'}
      lead={
        cloud
          ? 'Your household, encrypted, on every phone you sign in on. Free for every household.'
          : 'An encrypted vault on this device only, opened by a passphrase only you know.'
      }
      footer={footer}
    >
      {cloud ? <Steps at={0} /> : null}
      <Messages space={space} waitS={0} />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {cloud ? (
          <TextField
            label="Email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            hint="For signing in and the confirmation code. Never shared."
          />
        ) : (
          <TextField
            label="Account name"
            name="username"
            autoComplete="username"
            value={name}
            onChange={setName}
            hint="Shown on this device so you can pick your account. Not your real name unless you want it."
          />
        )}
        <TextField
          label="Passphrase"
          type="password"
          name="new-password"
          autoComplete="new-password"
          value={pass}
          onChange={setPass}
        />
        <PassphraseHint pass={pass} name={policyName} />
        <TextField
          label="Passphrase again"
          type="password"
          autoComplete="new-password"
          value={pass2}
          onChange={setPass2}
          error={mismatch ? 'These do not match yet.' : null}
        />
        <div className="flex flex-col items-start gap-2.5">
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
        </div>
        {cloud ? <CloudHonest /> : <DeviceHonest />}
        <SubmitButton disabled={!ready} busy={space.busy}>
          {space.busy ? (cloud ? 'Preparing…' : 'Creating…') : 'Create account'}
        </SubmitButton>
      </form>
      {space.cloudAvailable ? (
        <div className="flex justify-center">
          <TextAction onClick={() => switchKind(cloud ? 'device' : 'cloud')}>
            <span className="inline-flex items-center gap-2">
              <Icon name={cloud ? 'phone' : 'globe'} size={18} />
              {cloud ? 'Keep an account on this device only' : 'Create an account with my email'}
            </span>
          </TextAction>
        </div>
      ) : null}
    </AuthLayout>
  );
}
