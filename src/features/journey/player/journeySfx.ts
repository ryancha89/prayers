import { sfxEnabled } from '../../../shared/audio/store';
import { bundledSoundBase, bundledSoundPath } from '../../../shared/audio/bundledSound';
import { devlog } from '../../../shared/devlog';
import type { MomentCue } from '../types';

/**
 * The sound of the cabin's effects — the explanation one-shots (a hologram, an orb, the season's
 * petals…) and the unlock.
 *
 * TIMING (shared with Unity): when RN fires a cue, Unity starts the counsellor's gesture at once and
 * blooms the VFX CUE_SFX_LEAD_MS later. The sound is scheduled for that same moment, so it lands with
 * the bloom rather than with the hand. Change one side and the other has to move with it.
 *
 * LEVEL: these sit under the narration, never over it. The files are levelled to about -19 LUFS
 * (Tools/audio/gen_journey_sfx.py, the narration's own level) and JOURNEY_SFX_VOLUME takes 12 dB off
 * on the way out. While one plays, the journey's BGM ducks (never the voice — it is the thing
 * these are decorating).
 *
 * They ride the interface-sounds switch, like the meditation bells: a player who turned the app's
 * noises off has said no to these too. The music is a separate switch and a separate layer.
 *
 * react-native-sound is optional as everywhere else: without it these are silent and nothing else
 * changes.
 */
let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

/** Unity blooms a cue's VFX this long after the cue arrives; the sound waits as long. */
export const CUE_SFX_LEAD_MS = 450;

export type JourneySfx =
  | 'hologram' | 'orb' | 'shootingStar' | 'cityLights' | 'petals' | 'maple' | 'leaves' | 'snow'
  | 'fireflies' | 'sparkle' | 'stars' | 'unlock' | 'coins'
  // The career card pick (CardPick): each card landing, the chosen one turning, its face blooming.
  | 'cardDeal' | 'cardFlip' | 'cardReveal'
  // The ride itself (Tools/audio/gen_journey_ambience.py): a station transition, the last one's
  // brakes and chime, and leaving the platform.
  | 'tunnel' | 'arrival' | 'departure';

/** Bundled natively via react-native.config.js `assets` + react-native-asset (snake_case on disk). */
export const JOURNEY_SFX_FILES: Record<JourneySfx, string> = {
  hologram: 'jsfx_hologram.m4a',
  orb: 'jsfx_orb.m4a',
  shootingStar: 'jsfx_shooting_star.m4a',
  cityLights: 'jsfx_city_lights.m4a',
  petals: 'jsfx_petals.m4a',
  maple: 'jsfx_maple.m4a',
  leaves: 'jsfx_leaves.m4a',
  snow: 'jsfx_snow.m4a',
  fireflies: 'jsfx_fireflies.m4a',
  sparkle: 'jsfx_sparkle.m4a',
  stars: 'jsfx_stars.m4a',
  unlock: 'jsfx_unlock.m4a',
  coins: 'jsfx_coins.m4a',
  cardDeal: 'jsfx_card_deal.m4a',
  cardFlip: 'jsfx_card_flip.m4a',
  cardReveal: 'jsfx_card_reveal.m4a',
  tunnel: 'jtrav_tunnel.m4a',
  arrival: 'jtrav_arrival.m4a',
  departure: 'jtrav_departure.m4a',
};

/** How long each one rings, for the BGM duck (the files' lengths, rounded up). */
const LENGTH_MS: Record<JourneySfx, number> = {
  hologram: 2200, orb: 2000, shootingStar: 1500, cityLights: 1200, petals: 1800, maple: 1800,
  leaves: 1800, snow: 1800, fireflies: 1500, sparkle: 800, stars: 800, unlock: 1200, coins: 600,
  cardDeal: 320, cardFlip: 500, cardReveal: 1300,
  // tunnel is generated TRANSITION_MS long (the generator reads it from journeyPlayer.ts).
  tunnel: 2800, arrival: 3200, departure: 3200,
};

/** Where the two-tone chime sits in jtrav_arrival.m4a (gen_journey_ambience.py ARRIVAL_CHIME_AT_S):
 *  the file starts this long before the train pulls in, so the brakes lead and the chime lands on
 *  the arrival. */
export const ARRIVAL_CHIME_AT_MS = 1400;

/**
 * The sound a cue makes. Every cue has one, so a new cue added to MomentCue fails to compile here
 * instead of blooming in silence. `hearts` borrows the glitter (it is a small burst, not a scene);
 * `reveal` is the unlock burst Unity plays by itself on locked → premium, so it sounds like one.
 */
const CUE_SFX: Record<MomentCue, JourneySfx> = {
  hologram: 'hologram',
  orb: 'orb',
  shootingStar: 'shootingStar',
  cityLights: 'cityLights',
  petals: 'petals',
  maple: 'maple',
  leaves: 'leaves',
  snow: 'snow',
  fireflies: 'fireflies',
  sparkle: 'sparkle',
  stars: 'stars',
  coins: 'coins',
  hearts: 'sparkle',
  reveal: 'unlock',
};

export function sfxForCue(cue: MomentCue | ''): JourneySfx | null {
  return cue ? CUE_SFX[cue] ?? null : null;
}

/** -12 dB: the files are at narration loudness, the effects belong ~12 dB under it. */
export const JOURNEY_SFX_VOLUME = 0.25;

// ── The BGM duck ─────────────────────────────────────────────────────────────────────────────

/** The BGM's level while an effect rings, as a share of its own (≈ -4.4 dB). */
export const BGM_DUCK = 0.6;
const DUCK_DOWN_MS = 200;
const DUCK_UP_MS = 600;
const DUCK_STEP_MS = 50;

let bgm: { sound: any; base: number } | null = null;
let bgmLevel = 1; // the duck's own factor, 1 = untouched
let duckUntil = 0;
let duckTimer: ReturnType<typeof setInterval> | null = null;

/** The layer to duck (the journey's own BGM) and its normal volume; null when it goes away. */
export function setDuckTarget(sound: any | null, base = 1) {
  if (!sound) {
    stopDuckTimer();
    bgm = null;
    bgmLevel = 1;
    duckUntil = 0;
    duckListeners.forEach(l => l(1));
    return;
  }
  bgm = { sound, base };
}

/** Other layers that follow the duck (the station ambience): told the factor on every step. */
const duckListeners = new Set<(level: number) => void>();

/** Follow the duck. Returns the unsubscribe. */
export function onDuck(listener: (level: number) => void): () => void {
  duckListeners.add(listener);
  return () => duckListeners.delete(listener);
}

function applyBgm() {
  try {
    bgm?.sound?.setVolume?.(bgm.base * bgmLevel);
  } catch {}
  duckListeners.forEach(l => l(bgmLevel));
}

function stopDuckTimer() {
  if (duckTimer) clearInterval(duckTimer);
  duckTimer = null;
}

/** Eased, not stepped: down in DUCK_DOWN_MS, held while anything rings, back up in DUCK_UP_MS. */
function duckStep() {
  const target = Date.now() < duckUntil ? BGM_DUCK : 1;
  const span = 1 - BGM_DUCK;
  if (bgmLevel > target) bgmLevel = Math.max(target, bgmLevel - span * (DUCK_STEP_MS / DUCK_DOWN_MS));
  else if (bgmLevel < target) bgmLevel = Math.min(target, bgmLevel + span * (DUCK_STEP_MS / DUCK_UP_MS));
  applyBgm();
  if (bgmLevel === 1 && target === 1) stopDuckTimer();
}

function duckFor(ms: number) {
  if (!bgm && duckListeners.size === 0) return;
  duckUntil = Math.max(duckUntil, Date.now() + ms);
  if (!duckTimer) duckTimer = setInterval(duckStep, DUCK_STEP_MS);
  duckStep();
}

/** The duck's current factor on the BGM (1 = untouched) — for tests and the devlog. */
export const bgmDuckLevel = () => bgmLevel;

// ── Playing ──────────────────────────────────────────────────────────────────────────────────

const loaded = new Map<JourneySfx, any>();

function instance(name: JourneySfx): any | null {
  if (!SoundModule) return null;
  const existing = loaded.get(name);
  if (existing) return existing;
  const sound = new SoundModule(bundledSoundPath(JOURNEY_SFX_FILES[name]), bundledSoundBase(SoundModule), (err: unknown) => {
    if (err) {
      loaded.delete(name);
      devlog(`[journey] sfx ${JOURNEY_SFX_FILES[name]} did not load — run npx react-native-asset and rebuild`);
      return;
    }
    sound.setVolume?.(JOURNEY_SFX_VOLUME);
  });
  loaded.set(name, sound);
  return sound;
}

/** Open every file now: the first effect of a ride must not be the one that loads its file (a
 *  react-native-sound that is still loading swallows play — see shared/audio/sfx.ts preload). */
export function preloadJourneySfx() {
  (Object.keys(JOURNEY_SFX_FILES) as JourneySfx[]).forEach(instance);
}

/** Play now (respecting the interface-sounds switch) and duck the BGM under it. */
export function playJourneySfx(name: JourneySfx) {
  if (!sfxEnabled()) return;
  const sound = instance(name);
  if (!sound) return;
  duckFor(LENGTH_MS[name]);
  try {
    if (typeof sound.isLoaded === 'function' && !sound.isLoaded()) {
      sound.play?.();
      return;
    }
    // Rewind: two month cards close together should both be heard.
    sound.stop?.(() => {
      sound.setCurrentTime?.(0);
      sound.play?.();
    });
  } catch {
    // A sound never breaks the ride.
  }
}

const pending = new Set<ReturnType<typeof setTimeout>>();

/** Play `name` in `delayMs` — if `stillCurrent()` still holds then (the ride has not moved on). */
export function scheduleJourneySfx(name: JourneySfx, delayMs: number, stillCurrent: () => boolean = () => true) {
  const timer = setTimeout(() => {
    pending.delete(timer);
    if (stillCurrent()) playJourneySfx(name);
  }, delayMs);
  pending.add(timer);
}

/** Forget every scheduled sound. `silence` also stops what is ringing and lifts the duck at once —
 *  for leaving the journey; a station change lets a tail finish. */
export function cancelJourneySfx(opts: { silence?: boolean } = {}) {
  pending.forEach(clearTimeout);
  pending.clear();
  if (!opts.silence) return;
  loaded.forEach(s => {
    try {
      s.stop?.();
    } catch {}
  });
  duckUntil = 0;
  stopDuckTimer();
  bgmLevel = 1;
  applyBgm();
}

/** Sounds waiting to play (tests). */
export const pendingJourneySfx = () => pending.size;

/** Free the files (leaving the journey). */
export function releaseJourneySfx() {
  cancelJourneySfx({ silence: true });
  loaded.forEach(s => {
    try {
      s.release?.();
    } catch {}
  });
  loaded.clear();
}
