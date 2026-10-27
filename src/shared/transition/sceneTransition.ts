import { create } from 'zustand';
import type { ImageSourcePropType } from 'react-native';
import type { TranslationKey } from '../i18n';
import { isNativeUnity } from '../../features/counseling/bridge';
import { MYROOM_PICTURE } from '../../features/myroom/picture';

/**
 * ONE scene transition for every 3D place (27-10, user: "nên có phần loading để mỗi lần chuyển scene
 * mượt hơn… kiểu giới thiệu và tips").
 *
 * Before this each Unity screen covered its own load its own way — a room photo here, a blurred
 * painting there, a dark veil, nothing at all on some — and Unity's SceneLoader faded through black
 * underneath, so moving between places flashed black or showed the last scene's frame. Now a screen
 * that opens a place calls `beginSceneTransition(place)` as it mounts; the overlay (App root,
 * SceneTransitionOverlay) comes up with the place's picture, name, a line about it and a tip, and goes
 * when Unity answers that place's READY — never sooner than MIN_MS (a tip has to be readable), never
 * later than MAX_MS (a scene that never answers must not trap the player).
 *
 * Without the embedded player (Expo, Jest, the mock) nothing is shown: there is no load to cover.
 */
export type ScenePlace = 'world' | 'myroom' | 'cafe' | 'meditation' | 'sleep' | 'journey' | 'lecture' | 'counsel' | 'creator';

export interface PlaceDef {
  art: ImageSourcePropType;
  title: TranslationKey;
  intro: TranslationKey;
  /** The Unity event that means "the place is on screen". */
  ready: string;
  tips: TranslationKey[];
}

export const MIN_MS = 1100;
export const MAX_MS = 10000;

/** Tips any load may show, mixed with the place's own. Only things the app really does. */
export const GENERAL_TIPS: TranslationKey[] = ['transition.tip.chart', 'transition.tip.character', 'transition.tip.recall'];

export const PLACES: Record<ScenePlace, PlaceDef> = {
  world: {
    art: require('../../features/world/assets/world_arrival.jpg'),
    title: 'transition.world.title', intro: 'transition.world.intro', ready: 'WORLD_READY',
    tips: ['transition.tip.world.doors', 'transition.tip.world.map'],
  },
  myroom: {
    art: MYROOM_PICTURE.portrait,
    title: 'world.zone.myroom', intro: 'transition.myroom.intro', ready: 'MYROOM_READY',
    tips: ['transition.tip.myroom.decor'],
  },
  cafe: {
    art: require('../../features/cafe/assets/coffee.jpg'),
    title: 'world.zone.cafe', intro: 'transition.cafe.intro', ready: 'CAFE_READY',
    tips: ['transition.tip.cafe.sit'],
  },
  meditation: {
    art: require('../../features/meditation/assets/room.jpg'),
    title: 'world.zone.meditation', intro: 'transition.meditation.intro', ready: 'MEDITATION_READY',
    tips: ['transition.tip.meditation.breath'],
  },
  sleep: {
    art: require('../../features/meditation/assets/sleep_card.jpg'),
    title: 'home.sleep', intro: 'transition.sleep.intro', ready: 'MEDITATION_READY',
    tips: ['transition.tip.sleep.dim'],
  },
  journey: {
    art: require('../../features/journey/assets/platform_night.jpg'),
    title: 'world.zone.journey', intro: 'transition.journey.intro', ready: 'JOURNEY_READY',
    tips: ['transition.tip.journey.stops'],
  },
  lecture: {
    art: require('../../features/philosophy/assets/schopenhauer_shot_front.jpg'),
    title: 'transition.lecture.title', intro: 'transition.lecture.intro', ready: 'LECTURE_READY',
    tips: [],
  },
  creator: {
    // replaced by the picked character's card art
    art: require('../../features/character/assets/basic_female.png'),
    title: 'transition.creator.title', intro: 'transition.creator.intro', ready: 'CHARACTER_READY',
    tips: ['transition.tip.creator.turn', 'transition.tip.character'],
  },
  counsel: {
    // replaced by the counselor's own card art when one is given
    art: require('../../features/world/assets/world_arrival.jpg'),
    title: 'world.zone.counseling', intro: 'transition.counsel.intro', ready: 'UNITY_READY',
    tips: ['transition.tip.counsel.specific', 'transition.tip.recall'],
  },
};

interface Active {
  place: ScenePlace;
  /** Overrides for this visit: a counselor's art and name. */
  art?: ImageSourcePropType;
  name?: string;
  tip: TranslationKey;
  startedAt: number;
  /** Bumped per visit, so a late READY from an earlier one cannot close this one. */
  seq: number;
}

interface TransitionState {
  active: Active | null;
  begin: (place: ScenePlace, extra?: { art?: ImageSourcePropType; name?: string }) => void;
  end: (seq?: number) => void;
}

let seq = 0;
let lastTip: TranslationKey | undefined;

/** A tip from the place's own and the general ones, never the same twice in a row. */
export function pickTip(place: ScenePlace, rand: () => number = Math.random): TranslationKey {
  const pool = [...PLACES[place].tips, ...GENERAL_TIPS].filter((t, i, a) => a.indexOf(t) === i);
  const choices = pool.length > 1 ? pool.filter(t => t !== lastTip) : pool;
  const tip = choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))];
  lastTip = tip;
  return tip;
}

export const useSceneTransition = create<TransitionState>(set => ({
  active: null,
  begin: (place, extra) => {
    if (!isNativeUnity()) return;
    seq += 1;
    set({ active: { place, art: extra?.art, name: extra?.name, tip: pickTip(place), startedAt: Date.now(), seq } });
  },
  end: s => set(state => (state.active && (s == null || s === state.active.seq) ? { active: null } : state)),
}));

/** Called by a screen as it opens its place. */
export const beginSceneTransition = (place: ScenePlace, extra?: { art?: ImageSourcePropType; name?: string }) =>
  useSceneTransition.getState().begin(place, extra);
