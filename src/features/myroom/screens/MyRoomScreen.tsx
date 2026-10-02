import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import type { RootStackParamList } from '../../../navigation/types';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getMyRoomBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { CoinPill } from '../../coins/components/CoinPill';
import { useMyRoomCamera } from '../components/useMyRoomCamera';
import { WorldJoystick } from '../../world/components/WorldJoystick';
import { useCoins } from '../../coins/store/coinStore';
import { MYROOM_PICTURE } from '../picture';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * What of the room the screen's UI hides, for VIEW_INSETS: the top bar, in either orientation. The
 * stick is a small knob in a corner and is not counted — the player walks behind it, the camera does
 * not frame around it (the world's rule). Exported for the layout test.
 */
export function myRoomCoveredPx(r: MeasuredRects) {
  const { host, top } = r;
  if (!host) return null;
  return { top: top ? top.y + top.height : 0 };
}

/**
 * My Room (개인실) — the world's fifth door (02-10: "my room xài room hôm qua của tôi đi"), walkable
 * the same day ("cho đi vô phòng được và chỉnh camera tương tác với my room được luôn"): the player
 * walks in with the world's stick and looks round with the world's camera fingers — one-finger drag,
 * pinch, double-tap back behind the player. Decorating is announced (under the title), not built.
 *
 * UNITY IS THE ROOM, RN IS EVERYTHING YOU TOUCH, as on the world: the stick sends WALK_INPUT (Unity
 * routes it to the room's walker while the room is up), the camera gestures are read on a layer over
 * the UnityView and sent as MYROOM_CAMERA; Unity keeps the lens inside the room whatever it is asked.
 *
 * ONE UNITYVIEW AT A TIME. The world unmounts its host before navigating here (WorldScreen.leaveTo)
 * and mounts it again only after this screen has gone, at the 개인실 door (returnZone 'myroom'). This
 * screen's host is mounted once and never keyed on the orientation — a remount reloads the room.
 *
 * THE DOOR (02-10, "có cửa mà hỏng có nút mở hả"): walking up to the room's door makes Unity say
 * MYROOM_NEAR, and Leave pops in over the stick where the world's Enter does — the same way out as
 * the back button. Without the player there is no door to walk to, so the back button is the way.
 *
 * WITHOUT THE PLAYER (jest, a build with no Unity framework) the picture of the room stands in, and
 * the gestures go to the mock bridge, so the whole path in and out of the room can be walked.
 */
export const MyRoomScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const screen = useScreen();
  const landscape = screen.landscape;
  // Per piece, not a SafeAreaView: the room runs under the island and the home indicator.
  const safe = useSafeAreaInsets();
  const unity = isNativeUnity();
  const bridge = getMyRoomBridge();
  const [roomUp, setRoomUp] = useState(false);
  const [nearDoor, setNearDoor] = useState(false);

  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: myRoomCoveredPx,
  });

  // Ask for the room on the way in; close it on the way out. `lang` is read once: a language change
  // inside the room is not worth reloading it.
  useEffect(() => {
    const off = bridge.onEvent(e => {
      if (e.type === 'MYROOM_READY') setRoomUp(true);
      else if (e.type === 'MYROOM_NEAR') setNearDoor(e.payload?.near === true);
    });
    bridge.openMyRoom({ lang });
    return () => {
      off();
      bridge.closeMyRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // The stick and the look layer wait for the room (until READY the picture covers it, and a stick
  // pushed then would walk the player off on their own once it loads); the coin shop covers both.
  const shopOpen = useCoins(s => s.shopOpen);
  const controlsOn = (!unity || roomUp) && !shopOpen;
  const send = useCallback((c: Parameters<typeof bridge.sendMyRoomCamera>[0]) => bridge.sendMyRoomCamera(c), [bridge]);
  const look = useMyRoomCamera(controlsOn, send);

  // Back to the world: it re-opens at the 개인실 door it remembered on the way in.
  const toWorld = () => {
    sfx.back();
    navigation.goBack();
  };
  // Leave pops in when the door is near, rather than appearing on one frame (the world's Enter).
  const leaveIn = useRef(new Animated.Value(0)).current;
  const leaveOn = nearDoor && controlsOn;
  useEffect(() => {
    if (!leaveOn) return;
    leaveIn.setValue(0);
    Animated.spring(leaveIn, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [leaveOn, leaveIn]);

  const to2D = () => {
    sfx.back();
    navigation.navigate('Tabs', { screen: 'Home' });
  };

  return (
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded, and never inside a transparent parent: an embedded UnityView in one
          stops drawing (meditation room, measured on device). The picture sits OVER it until READY. */}
      {unity && <UnityHost style={styles.unity} />}
      {(!unity || !roomUp) && (
        <View style={styles.unity} testID="myroom-picture">
          <Image
            source={landscape ? MYROOM_PICTURE.landscape : MYROOM_PICTURE.portrait}
            style={styles.picture}
            resizeMode="cover"
          />
          {unity && (
            <View style={styles.loading}>
              <Text style={styles.loadingText}>{t('myroom.loading')}</Text>
            </View>
          )}
        </View>
      )}

      {/* The look-around layer: transparent, over the Unity view, under every control. A touch on
          the UnityView itself never reaches RN (useFollowCamera says why). */}
      {controlsOn && <View style={StyleSheet.absoluteFill} testID="myroom-look" {...look} />}

      <View
        style={[styles.top, { paddingTop: safe.top + spacing.sm, paddingLeft: safe.left + spacing.lg, paddingRight: safe.right + spacing.lg }]}
        onLayout={insets.track('top')}>
        <Pressable
          hitSlop={8}
          onPress={toWorld}
          accessibilityRole="button"
          accessibilityLabel={t('myroom.back')}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <Icon name="back" size={16} color={colors.textPrimary} />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={to2D}
          accessibilityRole="button"
          accessibilityLabel={t('world.toHome')}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <Icon name="home" size={16} color={colors.textPrimary} />
          <Text style={styles.pillText}>2D</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>{t('world.myroom.title')}</Text>
          {/* Up here, not a pill at the bottom: the bottom-left is the stick's. Landscape has no room. */}
          {!landscape && <Text style={styles.subtitle} numberOfLines={1}>{t('myroom.hint')}</Text>}
        </View>
        <CoinPill />
      </View>

      {/* The world's stick, bottom-left (WALK_INPUT). Hidden — and so released — while anything
          covers the room. */}
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: safe.bottom + spacing.xs }]}>
        <WorldJoystick visible={controlsOn} />
      </View>

      {/* At the door: the way out, where the world puts Enter. Hidden with the stick (shop open). */}
      {leaveOn && (
        <Animated.View
          pointerEvents="box-none"
          testID="myroom-leave"
          style={[styles.leaveWrap, { bottom: safe.bottom + (landscape ? 150 : 250), opacity: leaveIn, transform: [{ scale: leaveIn }] }]}>
          <Pressable
            onPress={toWorld}
            accessibilityRole="button"
            accessibilityLabel={t('myroom.leave')}
            style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
            <Text style={styles.leaveText}>{t('myroom.leave')}</Text>
            <Icon name="arrowRight" size={16} color="#1A1330" />
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0B0A26' },
  unity: { ...absoluteFill },
  // An explicit size, not just four zero insets: an Image given only absoluteFill lays out at the
  // bitmap's own size (MeditationRoomScreen's lesson).
  picture: { ...absoluteFill, width: '100%', height: '100%' },
  loading: { position: 'absolute', left: 0, right: 0, bottom: '30%', alignItems: 'center' },
  loadingText: {
    ...typography.caption, color: colors.textPrimary,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.6)', overflow: 'hidden',
  },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm,
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.8)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.6)',
  },
  pillText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  titleBox: { flex: 1, marginLeft: spacing.xs },
  title: {
    ...typography.h3, color: colors.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  subtitle: {
    ...typography.tiny, color: 'rgba(255,255,255,0.8)', fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 },
  },
  stick: { position: 'absolute' },
  // The world's Enter (WorldScreen styles.enter), so the two doors read as one control.
  leaveWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  leave: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  leaveText: { ...typography.h3, color: '#1A1330' },
  pressed: { opacity: 0.75 },
});
