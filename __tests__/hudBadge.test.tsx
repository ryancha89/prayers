/**
 * The profile badge My Room and the World share (shared/components/hud/Hud.tsx).
 *
 * 07-10 on the simulator the English plate read "Pilgrim of the…" for "Pilgrim of the Road" (Lv 10):
 * the plate was squeezed by the top-right icons and the title ended in an ellipsis. Pinned: the
 * plate sizes up to badgeMaxWidth (≤ 60% of the screen, never into the right-hand icons); the title
 * shrinks rather than truncates; and for the longest title of every language the shrink floor is
 * enough on a 375-pt phone, in both screens' top rows.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { spacing } from '../src/shared/theme';
import { translations } from '../src/shared/i18n/translations';
import { TITLE_BANDS } from '../src/features/myroom/level';
import {
  BADGE_MAX_SHARE, HUD_ICON, ProfileBadge, TITLE_MIN_SCALE, badgeMaxWidth, estimateTitleWidth, titleRoom,
} from '../src/shared/components/hud/Hud';

const LANGS = ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const;
type Table = Record<string, string>;

/** The longest title (by the badge's own width estimate) of one language. */
function longestTitle(lang: (typeof LANGS)[number]): string {
  const table = translations[lang] as unknown as Table;
  return TITLE_BANDS.map(b => table[b.key])
    .reduce((a, b) => (estimateTitleWidth(b) > estimateTitleWidth(a) ? b : a));
}

/** What each top row keeps on its right (MyRoomScreen / WorldScreen), with no safe-area inset. */
const MYROOM_RESERVED = 2 * spacing.md + (4 * HUD_ICON + 3 * spacing.sm) + spacing.md;
const WORLD_RESERVED = 2 * spacing.md + (96 + spacing.sm + HUD_ICON) + spacing.md;

describe('badge width', () => {
  it('is at most 60% of the screen and never into the reserved right side', () => {
    expect(badgeMaxWidth(874, MYROOM_RESERVED)).toBe(Math.round(874 * BADGE_MAX_SHARE)); // landscape
    expect(badgeMaxWidth(375, MYROOM_RESERVED)).toBe(375 - MYROOM_RESERVED);
    expect(badgeMaxWidth(402, WORLD_RESERVED)).toBeLessThanOrEqual(402 * BADGE_MAX_SHARE);
  });

  it('every language’s longest title fits a 375-pt portrait row at the shrink floor, in both screens', () => {
    for (const lang of LANGS) {
      const title = longestTitle(lang);
      for (const reserved of [MYROOM_RESERVED, WORLD_RESERVED]) {
        const room = titleRoom(badgeMaxWidth(375, reserved));
        expect({ lang, title, fits: estimateTitleWidth(title) * TITLE_MIN_SCALE <= room }).toEqual({ lang, title, fits: true });
      }
    }
  });

  it('“Pilgrim of the Road” needs no shrinking at all with 60% of a landscape phone', () => {
    const room = titleRoom(badgeMaxWidth(874, MYROOM_RESERVED));
    expect(estimateTitleWidth('Pilgrim of the Road')).toBeLessThan(room);
  });
});

describe('ProfileBadge', () => {
  it.each(LANGS)('%s: the longest title is drawn whole — one line that shrinks, never an ellipsis', lang => {
    const title = longestTitle(lang);
    let r!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      r = ReactTestRenderer.create(
        <ProfileBadge testID="b" name="x" level={80} title={title} maxWidth={badgeMaxWidth(375, MYROOM_RESERVED)} onPress={() => {}} />,
      );
    });
    const text = r.root.findAll(n => n.props.testID === 'b-title' && typeof n.type !== 'string')[0];
    expect(text.props.children).toBe(title);
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.adjustsFontSizeToFit).toBe(true);
    expect(text.props.minimumFontScale).toBe(TITLE_MIN_SCALE);
    expect(text.props.ellipsizeMode).toBeUndefined();
    const pressable = r.root.findAll(n => n.props.testID === 'b' && n.props.accessibilityLabel != null)[0];
    expect(pressable.props.accessibilityLabel).toBe(`x · Lv. 80 · ${title}`);
    const style = StyleSheet.flatten(typeof pressable.props.style === 'function' ? pressable.props.style({ pressed: false }) : pressable.props.style);
    expect(style.maxWidth).toBe(badgeMaxWidth(375, MYROOM_RESERVED));
  });
});
