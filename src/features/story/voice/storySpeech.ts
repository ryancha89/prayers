import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform } from 'react-native';
import type { Lang } from '../../../shared/i18n';

/**
 * The player's spoken line → text (native StorySpeech: iOS Speech framework, Android
 * SpeechRecognizer). A build without the module (an older binary on a new bundle) simply has no
 * mic button — `available()` is false — and the keyboard is still there.
 */
const Native: any = NativeModules.StorySpeech;
const emitter = Native ? new NativeEventEmitter(Native) : null;

export function available(): boolean {
  return !!Native;
}

export interface Listening {
  stop(): void;
}

/**
 * Starts listening. `onText` gets the transcript so far (and once with `final`); `onEnd` fires
 * once, when recognition is over for any reason. Resolves null if it could not start (no
 * permission, no recogniser for the language).
 */
export async function listen(
  lang: Lang,
  onText: (text: string, final: boolean) => void,
  onEnd: () => void,
): Promise<Listening | null> {
  if (!Native || !emitter) return null;
  if (Platform.OS === 'android') {
    const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (r !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  let ended = false;
  const subs = [
    emitter.addListener('StorySpeechResult', (e: { text?: string; final?: boolean }) => {
      if (typeof e?.text === 'string') onText(e.text, !!e.final);
    }),
    emitter.addListener('StorySpeechEnd', () => finish()),
  ];
  function finish() {
    if (ended) return;
    ended = true;
    subs.forEach(s => s.remove());
    onEnd();
  }
  const ok: boolean = await Native.start(lang).catch(() => false);
  if (!ok) {
    ended = true;
    subs.forEach(s => s.remove());
    return null;
  }
  return { stop: () => Native.stop() };
}
