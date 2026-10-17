/**
 * Kakao Login, behind a guarded require — same reasoning as appleSignIn.ts.
 *
 * Uses Prayers' own Kakao app (ID 1611187; the native key lives in Info.plist and
 * strings.xml, where the SDK reads it). Kakao refuses any bundle id / Android key hash not
 * registered on it ("invalid android_key_hash or ios_bundle_id"), so `com.fortunetorch.prayers`
 * and its signing keys' hashes must be added in Kakao Developers → 플랫폼.
 */
type KakaoToken = { accessToken: string; idToken?: string | null; refreshToken: string };
type KakaoModule = { login(): Promise<KakaoToken> };

function load(): KakaoModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-native-seoul/kakao-login') as KakaoModule;
    return typeof mod?.login === 'function' ? mod : null;
  } catch {
    return null;
  }
}

export function kakaoSignInAvailable(): boolean {
  return load() != null;
}

/**
 * Returns the SDK's token object unchanged: `User.from_kakao_omniauth` takes the uid from
 * `idToken`'s `sub` (OpenID Connect is on for this Kakao app) and stores `accessToken`.
 */
export async function requestKakaoIdentity(): Promise<KakaoToken> {
  const kakao = load();
  if (!kakao) throw new Error('Kakao Login is not in this build.');
  const token = await kakao.login();
  if (!token?.idToken) {
    throw new Error('Kakao returned no id token — check that OpenID Connect is enabled for the app.');
  }
  return token;
}
