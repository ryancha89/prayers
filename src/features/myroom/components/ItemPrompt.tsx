import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { CompassStar } from '../../../shared/components/Ornaments';
import { colors, spacing } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import type { MyRoomAction, MyRoomItemAnchor } from '../../counseling/types';
import { PROMPT_LIFT } from '../../world/components/PromptButton';
import { useScreen } from '../../../shared/device/screen';

/** The icon for a piece's action — the chair for sitting (07-10 mockup), and so on. */
export function actIcon(action: MyRoomAction): IconName {
  switch (action) {
    case 'sit': return 'armchair';
    case 'rest': return 'bed';
    case 'lamp': return 'lamp';
    case 'write': return 'pen';
    default: return 'book';
  }
}

/**
 * What the hanging prompt keeps clear of, per orientation.
 *
 * PORTRAIT: the top bar (the profile badge, ~64pt), and the whole bottom band — the stick's corner
 * (WorldJoystick, 220pt) sitting on the 편집 / share row spans most of the width there.
 *
 * LANDSCAPE: the same 272pt band would leave nothing — 402 tall minus 72 + 272 is a 58pt strip, and
 * the prompt clamped to the top whatever piece it named (sim 07-10). Sideways the stick and run stand
 * in the CORNERS, so the middle of the screen is free down to the bottom row; only a prompt that
 * reaches down into the corners' height is kept out of them sideways.
 * `corner`: the stick's corner on the left (zone 220 + a margin) and the run button's on the right,
 * both `height` tall above the safe bottom (the zone over the 편집 row).
 */
export const PROMPT_CLEAR = {
  portrait: { top: 72, bottom: 272, side: 8, corner: null },
  landscape: { top: 64, bottom: 64, side: 8, corner: { left: 228, right: 96, height: 272 } },
} as const;

type Clear = (typeof PROMPT_CLEAR)['portrait'] | (typeof PROMPT_CLEAR)['landscape'];

/**
 * Where the hanging prompt goes for an anchor at (ax, ay) px: the name chip's bottom-centre on the
 * anchor, the button under it — clamped inside the screen's free area for that orientation.
 * Exported for the tests.
 */
export function promptOrigin(
  ax: number, ay: number, w: number, chipH: number,
  screen: { width: number; height: number }, safe: { top: number; bottom: number; left: number; right: number },
  groupH: number,
  clear: Clear = screen.width > screen.height ? PROMPT_CLEAR.landscape : PROMPT_CLEAR.portrait,
) {
  const minX = safe.left + clear.side;
  const maxX = screen.width - safe.right - clear.side - w;
  const minY = safe.top + clear.top;
  const maxY = screen.height - safe.bottom - clear.bottom - groupH;
  let x = Math.max(minX, Math.min(maxX, ax - w / 2));
  let y = Math.max(minY, Math.min(maxY, ay - chipH));
  const c = clear.corner;
  if (c) {
    const cornerTop = screen.height - safe.bottom - c.height;
    if (y + groupH > cornerTop) {
      // Down where the stick and run are: stay between them; lift above them only when the gap
      // between the two corners is narrower than the prompt.
      const bandMin = safe.left + c.left;
      const bandMax = screen.width - safe.right - c.right - w;
      if (bandMax >= bandMin) x = Math.max(bandMin, Math.min(bandMax, x));
      else y = Math.max(minY, cornerTop - groupH);
    }
  }
  return { x, y };
}

const INK = '#2A2140';
const IVORY = '#F7F0E1';
/** The compass rose on the pill's right end, half over its edge. */
const ROSE = 30;

/**
 * The prompt for the piece in reach, hung on the piece itself (CHA JEONGMIN's mockup, 07-10): its
 * name in a small dark chip, a gold thread with two diamonds, and an ivory button with the action's
 * icon and a thin chevron, a gold compass rose over its right end. It follows the piece as the camera moves (MYROOM_ITEM_ANCHOR), easing between
 * updates, and pops in when a different piece is offered.
 */
export const ItemPrompt: React.FC<{
  name: string;
  label: string;
  action: MyRoomAction;
  /** Null: docked at the bottom centre, where the world's Enter is — no name, no thread. Used while
   *  the piece is in use (hung on the chair, the button sat on his chest — sim 07-10) and when the
   *  player build sends no anchor. */
  anchor: MyRoomItemAnchor | null;
  popKey: string;
  onPress(): void;
  testID?: string;
}> = ({ name: pieceName, label, action, anchor, popKey, onPress, testID }) => {
  const screen = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const landscape = useScreen().landscape;
  const docked = anchor == null;
  const name = docked ? '' : pieceName;
  const [size, setSize] = useState({ w: 200, h: 120, chip: 30 });
  const pos = useRef(new Animated.ValueXY({ x: -1000, y: -1000 })).current;
  const pop = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  const o = anchor
    ? promptOrigin(anchor.x * screen.width, anchor.y * screen.height, size.w, name ? size.chip : 0, screen, safe, size.h,
        landscape ? PROMPT_CLEAR.landscape : PROMPT_CLEAR.portrait)
    : { x: (screen.width - size.w) / 2,
        y: screen.height - safe.bottom - (landscape ? PROMPT_LIFT.landscape : PROMPT_LIFT.portrait) - size.h };
  useEffect(() => {
    // The first placement jumps there; later ones glide, so the 12/s updates read as one motion.
    if (!placed.current) { pos.setValue(o); placed.current = true; return; }
    Animated.timing(pos, { toValue: o, duration: 110, useNativeDriver: true }).start();
  }, [o.x, o.y, pos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [popKey, pop]);

  return (
    <Animated.View
      pointerEvents="box-none"
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (Math.abs(width - size.w) > 1 || Math.abs(height - size.h) > 1) setSize(s => ({ ...s, w: width, h: height }));
      }}
      style={[styles.group, { opacity: pop, transform: [...pos.getTranslateTransform(), { scale: pop }] }]}>
      {name !== '' && (
        <View
          style={styles.chip}
          onLayout={e => { const h = e.nativeEvent.layout.height; if (Math.abs(h - size.chip) > 1) setSize(s => ({ ...s, chip: h })); }}>
          <Text style={styles.chipText} numberOfLines={1}>{name}</Text>
        </View>
      )}
      {!docked && (
        <View style={styles.thread} pointerEvents="none">
          <View style={styles.diamond} />
          <View style={styles.line} />
          <View style={styles.diamond} />
        </View>
      )}
      <Pressable
        testID={testID}
        onPress={() => { sfx.select(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={name ? `${name} · ${label}` : label}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <View style={styles.pillInner}>
          <View style={styles.iconRing}>
            <Icon name={actIcon(action)} size={20} color={INK} />
          </View>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          <Svg width={10} height={18} viewBox="0 0 10 18">
            <Polyline points="2 2 8 9 2 16" fill="none" stroke={INK} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </View>
        <View style={styles.rose} pointerEvents="none">
          <CompassStar size={ROSE} />
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  group: { position: 'absolute', left: 0, top: 0, alignItems: 'center' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: 8,
    backgroundColor: 'rgba(16,14,40,0.82)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.7)',
  },
  chipText: { fontSize: 14, fontWeight: '700', color: '#F4EBDD', letterSpacing: 0.5 },
  thread: { alignItems: 'center', height: 30 },
  line: { width: 1.5, flex: 1, backgroundColor: colors.gold },
  diamond: { width: 7, height: 7, transform: [{ rotate: '45deg' }], borderWidth: 1.5, borderColor: colors.gold, backgroundColor: 'rgba(16,14,40,0.6)' },
  // Two borders: a gold rim, and inside it a thin gold line on the ivory (the mockup's framed plate).
  pill: {
    borderRadius: 30, padding: 3, backgroundColor: 'rgba(233,196,106,0.95)',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
  },
  pillInner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: 6, paddingRight: spacing.lg + ROSE / 2, paddingVertical: 6, minWidth: 168,
    borderRadius: 27, backgroundColor: IVORY, borderWidth: 1, borderColor: 'rgba(181,140,62,0.55)',
  },
  iconRing: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EFE4CC', borderWidth: 1, borderColor: 'rgba(181,140,62,0.6)',
  },
  label: { flex: 1, fontSize: 17, fontWeight: '700', color: INK, letterSpacing: 0.5 },
  // The mockup's plate ends in a compass rose: on a dark disc so the ring reads over the gold rim.
  rose: {
    position: 'absolute', right: -ROSE / 2 + 2, top: '50%', marginTop: -ROSE / 2,
    width: ROSE, height: ROSE, borderRadius: ROSE / 2, backgroundColor: 'rgba(16,14,40,0.92)',
  },
  pressed: { opacity: 0.8 },
});
