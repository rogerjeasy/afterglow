import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
  type ICognitoStorage,
} from 'amazon-cognito-identity-js';
import type { CloudConfig } from './config';

/**
 * Cognito, as the app needs it (cloud-accounts CA-09, CA-11). Sign-in uses SRP,
 * so the login secret is never sent. Tokens are kept in memory only: nothing about
 * the session is written to storage, and closing the tab or locking forgets it.
 */

export type CloudErrorCode =
  | 'exists'
  | 'unconfirmed'
  | 'bad-code'
  | 'auth-failed'
  | 'network'
  | 'limit'
  | 'signed-out'
  | 'unknown';

export class CloudError extends Error {
  readonly code: CloudErrorCode;
  constructor(code: CloudErrorCode, message: string) {
    super(message);
    this.name = 'CloudError';
    this.code = code;
  }
}

/** What the controller needs from an identity provider. Tests inject a fake. */
export interface CloudAuth {
  signUp(email: string, secret: string): Promise<void>;
  confirm(email: string, code: string): Promise<void>;
  resend(email: string): Promise<void>;
  signIn(email: string, secret: string): Promise<void>;
  /** A current access token, refreshed if needed; throws `signed-out` when there is no session. */
  accessToken(): Promise<string>;
  signOut(): void;
  deleteUser(): Promise<void>;
  /**
   * Replace the login secret after a passphrase change, then end every other session
   * (other devices must sign in with the new passphrase) and sign in again here.
   */
  changePassword(email: string, oldSecret: string, newSecret: string): Promise<void>;
}

/** Plain words for Cognito's errors. Never says which part of a credential was wrong. */
export function toCloudError(e: unknown): CloudError {
  const code =
    (e as { code?: string; name?: string } | null)?.code ??
    (e as { name?: string } | null)?.name ??
    '';
  const message = e instanceof Error ? e.message : '';
  switch (code) {
    case 'UsernameExistsException':
      return new CloudError(
        'exists',
        'An account with this email already exists. Sign in instead.',
      );
    case 'UserNotConfirmedException':
      return new CloudError('unconfirmed', 'Confirm your email first: enter the code we sent you.');
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
      return new CloudError('bad-code', 'That code did not work. Check it, or ask for a new one.');
    case 'NotAuthorizedException':
    case 'UserNotFoundException':
      return new CloudError('auth-failed', 'That email and passphrase did not open an account.');
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return new CloudError('limit', 'Too many tries. Wait a few minutes and try again.');
    case 'NetworkError':
      return new CloudError('network', 'No connection to the account service right now.');
    default:
      if (/network|fetch|failed to fetch/i.test(message)) {
        return new CloudError('network', 'No connection to the account service right now.');
      }
      return new CloudError(
        'unknown',
        'The account service could not do that. Nothing was changed.',
      );
  }
}

/** Session storage that lives only as long as this object: nothing reaches localStorage. */
function memoryStorage(): ICognitoStorage {
  const m = new Map<string, string>();
  return {
    setItem: (k, v) => void m.set(k, v),
    getItem: (k) => m.get(k) ?? null,
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

export function cognitoAuth(config: CloudConfig): CloudAuth {
  const storage = memoryStorage();
  const pool = new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.clientId,
    Storage: storage,
  });
  const userFor = (email: string) =>
    new CognitoUser({ Username: email, Pool: pool, Storage: storage });
  let current: CognitoUser | null = null;

  return {
    signUp(email, secret) {
      return new Promise((resolve, reject) => {
        pool.signUp(
          email,
          secret,
          [new CognitoUserAttribute({ Name: 'email', Value: email })],
          [],
          (err) => (err ? reject(toCloudError(err)) : resolve()),
        );
      });
    },
    confirm(email, code) {
      return new Promise((resolve, reject) => {
        userFor(email).confirmRegistration(code.trim(), true, (err) =>
          err ? reject(toCloudError(err)) : resolve(),
        );
      });
    },
    resend(email) {
      return new Promise((resolve, reject) => {
        userFor(email).resendConfirmationCode((err) =>
          err ? reject(toCloudError(err)) : resolve(),
        );
      });
    },
    signIn(email, secret) {
      const user = userFor(email);
      user.setAuthenticationFlowType('USER_SRP_AUTH');
      return new Promise((resolve, reject) => {
        user.authenticateUser(new AuthenticationDetails({ Username: email, Password: secret }), {
          onSuccess: () => {
            current = user;
            resolve();
          },
          onFailure: (err) => reject(toCloudError(err)),
          newPasswordRequired: () =>
            reject(
              new CloudError(
                'auth-failed',
                'This account needs a new passphrase. Contact support.',
              ),
            ),
          totpRequired: () =>
            reject(
              new CloudError('auth-failed', 'Two-step sign-in is not supported in this build yet.'),
            ),
        });
      });
    },
    accessToken() {
      const user = current;
      if (!user) return Promise.reject(new CloudError('signed-out', 'Signed out.'));
      return new Promise((resolve, reject) => {
        user.getSession((err: unknown, session: CognitoUserSession | null) => {
          if (err || !session?.isValid())
            reject(err ? toCloudError(err) : new CloudError('signed-out', 'Signed out.'));
          else resolve(session.getAccessToken().getJwtToken());
        });
      });
    },
    signOut() {
      current?.signOut();
      current = null;
      storage.clear();
    },
    async changePassword(email, oldSecret, newSecret) {
      const user = current;
      if (!user) throw new CloudError('signed-out', 'Signed out.');
      await new Promise<void>((resolve, reject) => {
        user.changePassword(oldSecret, newSecret, (err) =>
          err ? reject(toCloudError(err)) : resolve(),
        );
      });
      await new Promise<void>((resolve, reject) => {
        user.globalSignOut({
          onSuccess: () => resolve(),
          onFailure: (err) => reject(toCloudError(err)),
        });
      });
      current = null;
      storage.clear();
      await this.signIn(email, newSecret);
    },
    deleteUser() {
      const user = current;
      if (!user) return Promise.reject(new CloudError('signed-out', 'Signed out.'));
      return new Promise((resolve, reject) => {
        user.deleteUser((err) => {
          if (err) reject(toCloudError(err));
          else {
            current = null;
            storage.clear();
            resolve();
          }
        });
      });
    },
  };
}
