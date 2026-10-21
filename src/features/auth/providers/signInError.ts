export class SignInCancelledError extends Error {
  constructor() {
    super('Sign-in cancelled');
    this.name = 'SignInCancelledError';
  }
}

/** Native rejections can be plain objects rather than JavaScript Error instances. */
export function isSignInCancelled(error: unknown): boolean {
  if (error instanceof SignInCancelledError) return true;
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === 'cancelled' || code === 'SIGN_IN_CANCELLED' || code === 'ERR_REQUEST_CANCELED' ||
    (typeof message === 'string' && /\bcancel(?:led|ed)?\b/i.test(message));
}
