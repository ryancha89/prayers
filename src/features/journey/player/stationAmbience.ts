import { musicEnabled } from '../../../shared/audio/store';
import { bundledSoundBase, bundledSoundPath } from '../../../shared/audio/bundledSound';
import { devlog } from '../../../shared/devlog';
import { onDuck } from './journeySfx';

/**
 * The place outside the window — a soft loop per station, under the voice, the BGM and the
 * carriage's own train ambience (Tools/audio/gen_journey_ambience.py).
 *
 * One loop at a time, CROSS-FADED (AMBIENCE_FADE_MS) whenever the wanted one changes: a station
 * change, or the months station moving into another season as its month cards rise. During a
 * transition nothing is wanted, so the old station fades out as the train enters the tunnel and the
 * new one fades in as it pulls in: the tunnel has only the tunnel in it.
 *
 * It follows the MUSIC switch, not the interface-sounds one: it is a bed, listened under, like the
 * app's ambient music — not an answer to something the player did. Turning music off mid-ride
 * fades it out.
 *
 * It follows the effects' BGM duck too (journeySfx onDuck), so a hologram is not fighting a city.
 *
 * react-native-sound is optional: without it this is silent and nothing else changes.
 */
let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

export type StationAmbience =
  | 'platform' | 'city' | 'eveningCity' | 'meadow' | 'forest' | 'cosmic'
  | 'winter' | 'spring' | 'summer' | 'autumn' | 'arrival';

/** Bundled via react-native.config.js `assets` + react-native-asset (snake_case on disk). */
export const STATION_AMBIENCE_FILES: Record<StationAmbience, string> = {
  platform: 'jamb_platform.m4a',
  city: 'jamb_city.m4a',
  eveningCity: 'jamb_evening_city.m4a',
  meadow: 'jamb_meadow.m4a',
  forest: 'jamb_forest.m4a',
  cosmic: 'jamb_cosmic.m4a',
  winter: 'jamb_winter.m4a',
  spring: 'jamb_spring.m4a',
  summer: 'jamb_summer.m4a',
  autumn: 'jamb_autumn.m4a',
  arrival: 'jamb_arrival.m4a',
};

/** -14 dB on files levelled to about -20 LUFS: ~-34 LUFS, under the effects (~-31) and ~15 dB
 *  under the narration. */
export const STATION_AMBIENCE_VOLUME = 0.2;
export const AMBIENCE_FADE_MS = 1500;
const STEP_MS = 50;

/** The season a month sounds like — the same split as the months station's VFX (seasonCueOf). */
export function seasonAmbienceOf(month: number): StationAmbience {
  if (month === 12 || month <= 2) return 'winter';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'autumn';
}

/** What station `chapterId` sounds like. `month` only matters for the months station: the month
 *  card up (or the quarter being told); January — winter — before either. */
export function stationAmbienceOf(chapterId: string | undefined, month?: number | null): StationAmbience | null {
  switch (chapterId) {
    case 'intro': return 'platform';
    case 'career': return 'city';
    case 'wealth': return 'eveningCity';
    case 'love': return 'meadow';
    case 'health': return 'forest';
    case 'overall': return 'cosmic';
    case 'monthly': return seasonAmbienceOf(month ?? 1);
    case 'outro': return 'arrival';
    default: return null;
  }
}

interface Slot {
  key: StationAmbience;
  sound: any;
  /** 0..1, the cross-fade position. */
  level: number;
  target: 0 | 1;
  ready: boolean;
}

let slots: Slot[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let duck = 1;

function apply(slot: Slot) {
  if (!slot.ready) return;
  try {
    slot.sound.setVolume?.(STATION_AMBIENCE_VOLUME * slot.level * duck);
  } catch {}
}

function release(slot: Slot) {
  try {
    slot.sound.stop?.();
    slot.sound.release?.();
  } catch {}
}

function step() {
  const d = STEP_MS / AMBIENCE_FADE_MS;
  for (const s of slots) {
    s.level = s.target ? Math.min(1, s.level + d) : Math.max(0, s.level - d);
    apply(s);
  }
  const gone = slots.filter(s => s.target === 0 && s.level === 0);
  gone.forEach(release);
  slots = slots.filter(s => !gone.includes(s));
  if (slots.every(s => s.level === s.target)) stopTimer();
}

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

onDuck(level => {
  duck = level;
  slots.forEach(apply);
});

/** The station loop now wanted (null = none). Cross-fades from whatever plays; idempotent. */
export function setStationAmbience(key: StationAmbience | null) {
  const want = key && SoundModule && musicEnabled() ? key : null;
  if ((slots.find(s => s.target === 1)?.key ?? null) === want) return;
  slots.forEach(s => {
    s.target = 0;
  });
  if (want) {
    // Coming back to a loop that is still fading out (a quick there-and-back): turn it round.
    const fading = slots.find(s => s.key === want);
    if (fading) fading.target = 1;
    else {
      const slot: Slot = { key: want, sound: null, level: 0, target: 1, ready: false };
      slot.sound = new SoundModule(bundledSoundPath(STATION_AMBIENCE_FILES[want]), bundledSoundBase(SoundModule), (err: unknown) => {
        if (!slots.includes(slot)) return;
        if (err) {
          devlog(`[journey] ambience ${STATION_AMBIENCE_FILES[want]} did not load — run npx react-native-asset and rebuild`);
          slots = slots.filter(s => s !== slot);
          return;
        }
        slot.ready = true;
        slot.sound.setNumberOfLoops?.(-1);
        apply(slot);
        slot.sound.play?.();
      });
      slots.push(slot);
    }
  }
  if (!timer) timer = setInterval(step, STEP_MS);
}

/** Silence at once (leaving the journey). */
export function stopStationAmbience() {
  stopTimer();
  slots.forEach(release);
  slots = [];
}

/** What is playing or fading, for tests and the devlog. */
export const stationAmbienceSlots = () => slots.map(s => ({ key: s.key, level: s.level, target: s.target }));
