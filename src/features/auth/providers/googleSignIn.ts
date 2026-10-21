import { Platform } from 'react-native';
import { SignInCancelledError } from './signInError';

/**
 * Google Sign-In, behind a guarded require — same reasoning as appleSignIn.ts.
 *
 * The client ids belong to Google Cloud project 1012229674984. The server verifies the token
 * and resolves a separate Prayers account in prayers_users.
 * Google only lets this package in once that project has an Android OAuth client for
 * `com.fortunetorch.prayers` with the signing key's SHA-1 — without it `signIn` rejects with
 * DEVELOPER_ERROR, which is a console setting, not a code bug.
 */
const WEB_CLIENT_ID = '1012229674984-07lvobg7mcma0orpng913fpn7bq3v0cb.apps.googleusercontent.com';
const IOS_CLIENT_ID = '1012229674984-fi6v2188t29ievf46v9kg95b06rheia5.apps.googleusercontent.com';

type GoogleUser = { idToken: string | null; serverAuthCode: string | null; user: { name: string | null; email: string } };
type GoogleModule = {
  GoogleSignin: {
    configure(options: { webClientId: string; iosClientId?: string }): void;
    hasPlayServices(options?: { showPlayServicesUpdateDialog: boolean }): Promise<boolean>;
    signIn(): Promise<{ type: 'success'; data: GoogleUser } | { type: 'cancelled'; data: null }>;
    signOut(): Promise<null>;
    revokeAccess(): Promise<null>;
  };
};

let configured = false;

function load(): GoogleModule | null {
  try {
    const mod = require('@react-native-google-signin/google-signin') as GoogleModule;
    if (!mod?.GoogleSignin) return null;
    if (!configured) {
      mod.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID });
      configured = true;
    }
    return mod;
  } catch {
    return null;
  }
}

export function googleSignInAvailable(): boolean {
  return load() != null;
}

/**
 * Returns Google's `data` object unchanged — `User.from_google_omniauth` reads `idToken`,
 * `serverAuthCode` and `user.name`/`user.email` off it verbatim (the v10 shape saju_front sends;
 * v13+ only wrapped it in `{type, data}`).
 */
export async function requestGoogleIdentity(): Promise<GoogleUser> {
  const google = load();
  if (!google) throw new Error('Google Sign-In is not in this build.');
  if (Platform.OS === 'android') {
    await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }
  // A previous session's account would be reused silently; signing out first shows the picker.
  await google.GoogleSignin.signOut().catch(() => null);
  const res = await google.GoogleSignin.signIn();
  if (res.type === 'cancelled') throw new SignInCancelledError();
  if (!res.data?.idToken) {
    throw new Error('Google returned no identity token. Please try signing in again.');
  }
  return res.data;
}

/**
 * On account deletion: drop Prayers' grant on the Google account (Google's own "third-party
 * access" entry). Best effort — it only works while the SDK still holds a session, and the account
 * is deleted either way.
 */
export async function revokeGoogleAccess(): Promise<void> {
  const google = load();
  if (!google) return;
  await google.GoogleSignin.revokeAccess().catch(() => null);
  await google.GoogleSignin.signOut().catch(() => null);
}
