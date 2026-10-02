/**
 * The controls for walking a consultation room: the world's analogue stick, and a Talk prompt that
 * appears when the counselor is within reach.
 *
 * WHY THEY ARE HERE AND NOT IN UNITY. They were in Unity first — a joystick and a gold CTA on an
 * engine canvas — and that crossed the line this product already drew: RN owns every pixel the
 * player touches in a consultation, Unity owns the room behind them. Two owners of one screen is
 * how the engine's "[E] Talk to …" pill once came up underneath the app's own input bar, naming a
 * key that does not exist on a phone. The room still decides WHO is in reach (it has the
 * geometry); it just no longer draws anything about it.
 *
 * WHY THE STICK, AFTER ALL (02-10). Three inputs were tried here before, in this order:
 *   • A JOYSTICK (the early one, on Unity's canvas). Analogue steering in a 3.6 m strip invited a
 *     hundred micro-corrections, and that is what made moving around in here tiring.
 *   • TAPPING THE FLOOR. Calm, but it asked the player to aim at a point in a 3D room, and a tap on
 *     the counselor or a bookshelf did nothing — an invisible control nobody could learn.
 *   • A FOUR-KEY D-PAD. Visible and impossible to miss, but it was the only place in the app that
 *     walked that way: the world and My Room had moved to the ZZZ-style stick, and the player was
 *     asked to learn a second control for the same act ("joystick... ở đây cũng làm đồng bộ đi chứ?").
 * The stick won on consistency, and it is acceptable here now where the old one was not: it has a
 * dead-zone (a resting thumb does not creep), its speed is analogue and rescaled past that
 * dead-zone (a small push is a slow, controllable step rather than a lurch across the strip), and
 * it only sends real changes — a held direction is still about one message, not a stream.
 *
 * THE RELEASE IS LOAD-BEARING. Unity keeps the last direction until it is told otherwise
 * (MapPlayerController.SetRemoteMove), so a missed {0,0} leaves the player walking into a wall
 * forever. WorldJoystick sends it on every way a touch can end — release, termination, hide and
 * unmount — and the stick stays mounted while hidden precisely so that `visible = false` reaches it
 * and releases it (the walk ends the moment the player sits, often under a thumb that is still down).
 *
 * THE TALK PROMPT ONLY EXISTS WHEN THE ROOM SAYS SO. `WALK_STATE` arrives on change; a button that
 * could be pressed at any distance would be a second answer to "is anyone near?", and the two
 * would disagree. It is the world's Enter pill (PromptButton), centred inside the safe area — the
 * old bottom-right one sat under the Dynamic Island in landscape.
 *
 * NO LOOK-AROUND. The world and My Room turn their camera with one finger (WORLD_CAMERA /
 * MYROOM_CAMERA); the consultation room has no such message, and its camera is framed by the room's
 * own shots. Adding one is a Unity change, not this file's.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { WorldJoystick } from '../../world/components/WorldJoystick';
import { PromptButton } from '../../world/components/PromptButton';
import { getUnityBridge } from '../bridge';
import type { UnityToRNEvent } from '../types';

export const WalkControls: React.FC<{ visible: boolean }> = ({ visible }) => {
  const t = useT();
  // Placed as the world places it: bottom-left, clear of the island and the home indicator.
  const safe = useSafeAreaInsets();
  const [canTalk, setCanTalk] = useState(false);

  useEffect(() => {
    return getUnityBridge().onEvent((e: UnityToRNEvent) => {
      if (e.type === 'WALK_STATE') setCanTalk(!!e.payload?.canTalk);
    });
  }, []);

  return (
    <>
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: safe.bottom + spacing.xs }]}>
        <WorldJoystick visible={visible} />
      </View>
      {visible && canTalk && (
        <PromptButton
          testID="walk-talk"
          label={t('room.talk')}
          onPress={() => getUnityBridge().sendEvent({ type: 'WALK_TALK' })}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  stick: { position: 'absolute' },
});
