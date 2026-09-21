/**
 * The controls for walking a consultation room: a direction pad, and a Talk button that appears
 * when the counselor is within reach.
 *
 * WHY THEY ARE HERE AND NOT IN UNITY. They were in Unity first — a joystick and a gold CTA on an
 * engine canvas — and that crossed the line this product already drew: RN owns every pixel the
 * player touches in a consultation, Unity owns the room behind them. Two owners of one screen is
 * how the engine's "[E] Talk to …" pill once came up underneath the app's own input bar, naming a
 * key that does not exist on a phone. The room still decides WHO is in reach (it has the
 * geometry); it just no longer draws anything about it.
 *
 * WHY BUTTONS. Three inputs have been tried here, in this order, and the reasons are worth keeping:
 *   • A JOYSTICK. Analogue steering in a 3.6 m strip is precision nobody needs, and the hundred
 *     micro-corrections it invites are what made moving around in here tiring.
 *   • TAPPING THE FLOOR. One tap, one smooth walk — calm, but it asks the player to aim at a
 *     point in a 3D room, and a tap that lands on the counselor or a bookshelf does nothing. The
 *     control is invisible, so there is nothing to tell them where it works.
 *   • BUTTONS, which is this. They are visible, they cannot miss, and a held button is one
 *     message rather than twenty a second.
 *
 * A HELD BUTTON IS ONE MESSAGE. Unity keeps the last direction until it is told otherwise
 * (MapPlayerController.SetRemoteMove), so press sends the vector and release sends {0,0}. That
 * makes the RELEASE load-bearing: a missed one leaves the player walking into a wall forever,
 * which is why it is sent on every way a press can end — up, cancel, and unmount.
 *
 * THE TALK BUTTON ONLY EXISTS WHEN THE ROOM SAYS SO. `WALK_STATE` arrives on change; a button that
 * could be pressed at any distance would be a second answer to "is anyone near?", and the two
 * would disagree.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { getUnityBridge } from '../bridge';
import type { UnityToRNEvent } from '../types';

const KEY = 62;
const GAP = 6;

/** x = right, y = forward. Matches Unity's WALK_INPUT, which reads y as forward. */
const DIRECTIONS = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

type Dir = keyof typeof DIRECTIONS;

const GLYPH: Record<Dir, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };

export const WalkControls: React.FC<{ visible: boolean }> = ({ visible }) => {
  const [canTalk, setCanTalk] = useState(false);

  const send = useCallback((x: number, y: number) => {
    getUnityBridge().sendEvent({ type: 'WALK_INPUT', payload: { x, y } });
  }, []);

  const stop = useCallback(() => send(0, 0), [send]);

  useEffect(() => {
    return getUnityBridge().onEvent((e: UnityToRNEvent) => {
      if (e.type === 'WALK_STATE') setCanTalk(!!e.payload?.canTalk);
    });
  }, []);

  // Leaving the room, or the walk ending, must not leave the player mid-stride.
  useEffect(() => {
    if (!visible) stop();
    return stop;
  }, [visible, stop]);

  if (!visible) return null;

  const key = (dir: Dir, style: object) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={dir}
      style={({ pressed }) => [styles.key, style, pressed && styles.keyPressed]}
      onPressIn={() => send(DIRECTIONS[dir].x, DIRECTIONS[dir].y)}
      onPressOut={stop}>
      <Text style={styles.glyph}>{GLYPH[dir]}</Text>
    </Pressable>
  );

  return (
    <View style={styles.layer} pointerEvents="box-none">
      <View style={styles.pad} pointerEvents="box-none">
        {key('up', styles.up)}
        {key('left', styles.left)}
        {key('right', styles.right)}
        {key('down', styles.down)}
      </View>

      {canTalk && (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.talk, pressed && styles.talkPressed]}
          onPress={() => {
            sfx.tap();
            getUnityBridge().sendEvent({ type: 'WALK_TALK' });
          }}>
          <Text style={styles.talkLabel}>Talk</Text>
        </Pressable>
      )}
    </View>
  );
};

const PAD = KEY * 3 + GAP * 2;

const styles = StyleSheet.create({
  // box-none so the room behind stays visible and only the keys themselves take touches.
  layer: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  pad: {
    position: 'absolute',
    left: spacing.xl,
    bottom: spacing.xl,
    width: PAD,
    height: PAD,
  },
  key: {
    position: 'absolute',
    width: KEY,
    height: KEY,
    borderRadius: KEY / 2,
    backgroundColor: 'rgba(167,139,250,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: 'rgba(167,139,250,0.45)' },
  up: { left: KEY + GAP, top: 0 },
  left: { left: 0, top: KEY + GAP },
  right: { left: (KEY + GAP) * 2, top: KEY + GAP },
  down: { left: KEY + GAP, top: (KEY + GAP) * 2 },
  glyph: { color: '#E6DEFF', fontSize: 16, lineHeight: 20 },
  talk: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl + (PAD - 56) / 2,
    paddingHorizontal: spacing.xxl,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkPressed: { opacity: 0.85 },
  talkLabel: { ...typography.bodyStrong, color: colors.textPrimary },
});
