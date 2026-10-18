/**
 * The Archive's pictures are drawn icons, not emoji (14-10: every category card showed a "?" box,
 * two for 🗺️ 🗓️ ❤️ — the variation selector is a second unrenderable glyph).
 *
 * Pinned: every category, mood and possession kind maps to an icon that exists — every value the
 * editor can store included — no map value is an emoji, and the Archive tab draws one Icon per
 * category card with no emoji anywhere in its text.
 */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(async () => undefined), apiHeaders: jest.fn() }));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Icon, ICON_NAMES, type IconName } from '../src/shared/components/Icon';
import { CATEGORIES, CATEGORY_ACCENT, CATEGORY_ICON, FIELDS, KIND_ICON, MOOD_ICON, type ArchiveCategory } from '../src/features/archive/types';
import { ArchiveScreen } from '../src/features/archive/screens/ArchiveScreen';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useLanguageStore } from '../src/shared/i18n';

const EMOJI = /\p{Extended_Pictographic}|️/u;

// Compile-time: the maps hold icon names, not strings.
const typed: [Record<ArchiveCategory, IconName>, Record<string, IconName>, Record<string, IconName>] = [CATEGORY_ICON, MOOD_ICON, KIND_ICON];

const optionsOf = (category: ArchiveCategory, key: string) => FIELDS[category].find(f => f.key === key)?.options ?? [];

describe('the Archive’s icon maps', () => {
  it('map every category, every mood the diary offers and every possession kind to a drawn icon', () => {
    expect(typed).toHaveLength(3);
    for (const c of CATEGORIES) expect([c, ICON_NAMES.includes(CATEGORY_ICON[c])]).toEqual([c, true]);
    const moods = optionsOf('diary', 'mood');
    expect(moods.length).toBeGreaterThan(0);
    for (const m of moods) expect([m, ICON_NAMES.includes(MOOD_ICON[m])]).toEqual([m, true]);
    const kinds = optionsOf('possession', 'kind');
    expect(kinds.length).toBeGreaterThan(0);
    for (const k of kinds) expect([k, ICON_NAMES.includes(KIND_ICON[k])]).toEqual([k, true]);
  });

  it('hold no emoji (the guard that would have caught the "?" boxes)', () => {
    for (const map of [CATEGORY_ICON, MOOD_ICON, KIND_ICON] as Record<string, string>[]) {
      for (const [k, v] of Object.entries(map)) expect([k, EMOJI.test(v)]).toEqual([k, false]);
    }
  });

  it('give each of the five moods its own face', () => {
    expect(new Set(Object.values(MOOD_ICON)).size).toBe(Object.keys(MOOD_ICON).length);
  });
});

describe('the Archive tab', () => {
  it('draws one Icon per category card, in that category’s own colour, and no emoji in any text', () => {
    useLanguageStore.setState({ lang: 'en' });
    useArchiveStore.setState({ memories: [], discoveries: [], answeredQuestions: [] } as never);
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<ArchiveScreen />); });
    for (const c of CATEGORIES) {
      const icon = tree.root.findAll(n => n.type === Icon && n.props.testID === `archive-cell-icon-${c}`);
      expect([c, icon.length, icon[0]?.props.name]).toEqual([c, 1, CATEGORY_ICON[c]]);
      expect(icon[0].props.size).toBe(22);
      expect(icon[0].props.color).toBe(CATEGORY_ACCENT[c]);
    }
    const strings: string[] = [];
    const walk = (node: unknown) => {
      if (typeof node === 'string') strings.push(node);
      else if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === 'object' && 'children' in node) walk((node as { children: unknown }).children);
    };
    walk(tree.toJSON());
    expect(strings.filter(x => EMOJI.test(x))).toEqual([]);
    act(() => tree.unmount());
  });
});
