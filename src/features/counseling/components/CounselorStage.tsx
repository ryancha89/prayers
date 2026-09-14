import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { absoluteFill, colors, typography } from '../../../shared/theme';
import { useT, TranslationKey } from '../../../shared/i18n';
import { CounselorEmotion } from '../types';

/**
 * Placeholder for the Unity 3D counseling stage (spec §18). Renders a seated
 * "presence" that reacts to the conversation state so the flow is testable
 * before the native Unity view is embedded — the real room replaces this View,
 * driven by the same room state (spec §51-P5/P6).
 */
export type RoomState = 'loading' | 'greeting' | 'idle' | 'listening' | 'thinking' | 'speaking';

const EMOTION_GLYPH: Record<CounselorEmotion, string> = {
  neutral: '•‿•',
  happy: '◕‿◕',
  thinking: '•_•',
  concerned: '•︵•',
  surprised: '•o•',
};

const STATE_LABEL_KEY: Record<RoomState, TranslationKey | ''> = {
  loading: 'state.preparing',
  greeting: 'state.greeting',
  idle: '',
  listening: 'state.listening',
  thinking: 'state.thinking',
  speaking: 'state.speaking',
};

export const CounselorStage: React.FC<{
  name: string;
  accent: string;
  state: RoomState;
  emotion: CounselorEmotion;
  closeUp: boolean;
}> = ({ name, accent, state, emotion, closeUp }) => {
  const t = useT();
  const breathe = useRef(new Animated.Value(0)).current;
  const talk = useRef(new Animated.Value(0)).current;
  const camera = useRef(new Animated.Value(0)).current;

  // Never fully frozen — subtle idle breathing (spec §22).
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe]);

  // Mouth/energy pulse while speaking (spec §28 simple mouth motion fallback).
  useEffect(() => {
    if (state === 'speaking') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(talk, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.timing(talk, { toValue: 0, duration: 160, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    talk.stopAnimation();
    Animated.timing(talk, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    return undefined;
  }, [state, talk]);

  // Camera default ↔ close-up (spec §21). Subtle, never aggressive.
  useEffect(() => {
    const move = Animated.timing(camera, {
      toValue: closeUp ? 1 : 0,
      duration: 700,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    });
    move.start();
    // The two loops above already stop themselves; this one did not, and leaving the room mid-move
    // is the ordinary case — the player taps out while the camera is still easing.
    return () => move.stop();
  }, [closeUp, camera]);

  const scale = Animated.add(
    breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }),
    camera.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] }),
  );
  const mouthScale = talk.interpolate({ inputRange: [0, 1], outputRange: [1, 1.6] });
  const ring = state === 'thinking' || state === 'listening';
  const stateKey = STATE_LABEL_KEY[state];
  const stateLabel = stateKey ? t(stateKey) : '';

  return (
    <View style={styles.room}>
      {/* Warm cinematic backdrop (spec §20, §46) */}
      <View style={[styles.backdrop, { backgroundColor: accent }]} />
      <View style={styles.vignette} />

      <Animated.View style={[styles.figure, { transform: [{ scale }] }]}>
        <View style={[styles.head, { borderColor: accent }, ring && styles.headActive]}>
          <Text style={styles.face}>{EMOTION_GLYPH[emotion]}</Text>
          <Animated.View
            style={[styles.mouth, { backgroundColor: accent, transform: [{ scaleY: mouthScale }] }]}
          />
        </View>
        <View style={[styles.body, { backgroundColor: accent }]} />
      </Animated.View>

      {/* Desk between counselor and camera (spec §20) */}
      <View style={styles.desk} />

      <View style={styles.nameplate}>
        <Text style={styles.name}>{name}</Text>
        {!!stateLabel && <Text style={styles.state}>{stateLabel}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  room: { ...absoluteFill, backgroundColor: colors.bg, overflow: 'hidden' },
  backdrop: { ...absoluteFill, opacity: 0.18 },
  vignette: { ...absoluteFill, backgroundColor: 'rgba(10,10,15,0.35)' },
  figure: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 },
  head: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headActive: { borderWidth: 3 },
  face: { fontSize: 40, color: colors.textPrimary, letterSpacing: 2 },
  mouth: { width: 26, height: 4, borderRadius: 2, marginTop: 6 },
  body: {
    width: 220,
    height: 150,
    borderTopLeftRadius: 110,
    borderTopRightRadius: 110,
    marginTop: -10,
    opacity: 0.9,
  },
  desk: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    height: 80,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  nameplate: { position: 'absolute', top: 90, alignSelf: 'center', alignItems: 'center', gap: 2 },
  name: { ...typography.h2, color: colors.textPrimary },
  state: { ...typography.caption, color: colors.violetSoft },
});
