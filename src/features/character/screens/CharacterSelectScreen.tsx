import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { column } from '../../../shared/device/screen';
import { useSubjectsStore, type PlayerGender } from '../../subjects/store/subjectsStore';
import { charactersFor, effectiveCharacter } from '../characters';
import { UnityHost } from '../../counseling/components/UnityHost';
import { isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import type { FaceTrackingState } from '../../counseling/types';

/**
 * Who the player IS in the 3D world — asked once, right after the profile (26-10, "use new user
 * characters after profile create"), and changeable later from My Info.
 *
 * THE CHARACTER FOLLOWS THE PROFILE'S GENDER (user, 26-10: "Theo giới tính mà?"). With a gender
 * on the profile only that gender's characters are offered — one each today, more outfits later —
 * and changing the gender in My Info changes the body. Only a profile with no gender yet (the
 * "Later" path) is shown both. The pick is still stored (`playerCharacter`) so a deferred profile
 * has a body, and so a second character per gender has somewhere to live.
 *
 * The list lives in ../characters.ts (ids, art, which is each gender's default); several per gender
 * since 26-10 ("Thêm vài cô Rocketbox để chọn"), laid out two to a row.
 *
 * WITH UNITY (the app, not the tests): a live 3D pane on top — the picked body, framed on its face
 * (Unity CharacterPreview, CHARACTER_INIT/SET) — with a camera switch: the face then follows the
 * player's own through the front camera (ARKit; CHARACTER_TRACKING). The card art covers the pane
 * until CHARACTER_READY, and the cards shrink to a strip under it. The simulator and phones without
 * Face ID answer `unsupported`, and the line under the switch says so.
 *
 * BODY_READY says which gender Unity can actually mount; a `false` shows "Coming soon" and a note,
 * and still saves the pick so the body is there the day it lands.
 */
const BODY_READY: Record<PlayerGender, boolean> = { male: true, female: true };

/** The card art is 600×960: height = width × this. */
const ART_ASPECT = 960 / 600;

export const CharacterSelectScreen: React.FC = () => {
  const navigation = useNavigation();
  const onboarding = useRoute().name === 'CharacterSetup';
  const t = useT();
  const stored = useSubjectsStore(s => s.playerCharacter);
  const gender = useSubjectsStore(s => s.self.gender);
  const setPlayerCharacter = useSubjectsStore(s => s.setPlayerCharacter);
  const options = charactersFor(gender);
  const [picked, setPicked] = useState<string | undefined>(effectiveCharacter(gender, stored)?.id);
  const pickedDef = options.find(c => c.id === picked);
  // "Female 2" only when there is more than one of that gender to tell apart.
  const label = (c: (typeof options)[number]) => {
    const base = t(c.gender === 'male' ? 'character.male' : 'character.female');
    return options.filter(o => o.gender === c.gender).length > 1 ? `${base} ${c.n}` : base;
  };
  // Measured, not styled: an Image from require() takes its file's size (600×960 pt) whenever its
  // style has no NUMBER for width/height, and neither `width: '100%'` + aspectRatio nor stretch beat
  // that — both spilled the figures over the screen on the sim (26-10).
  const [artW, setArtW] = useState(0);

  // ── The 3D pane (native only) ────────────────────────────────────────────────────────────────
  const native = isNativeUnity();
  const lang = useLang();
  const { height: screenH } = useWindowDimensions();
  const paneH = Math.round(screenH * 0.42);
  const artOut = useRef(new Animated.Value(1)).current;
  const [cameraOn, setCameraOn] = useState(false);
  const [track, setTrack] = useState<FaceTrackingState>('off');
  const previewInit = (id?: string) => {
    const def = options.find(c => c.id === id);
    return { lang, playerGender: gender ?? def?.gender, playerCharacter: id };
  };
  useEffect(() => {
    if (!native) return undefined;
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type === 'CHARACTER_READY') {
        Animated.timing(artOut, { toValue: 0, duration: 450, useNativeDriver: true }).start();
      } else if (e.type === 'CHARACTER_TRACKING') {
        setTrack(e.payload.state);
        // Unity has already stopped the camera; the switch must not keep saying "off" is the next tap.
        if (e.payload.state === 'unsupported') setCameraOn(false);
      }
    });
    nativeUnityBridge.openCharacterPreview(previewInit(picked));
    return () => {
      off();
      nativeUnityBridge.closeCharacterPreview();
    };
    // Once per visit: a card tap is CHARACTER_SET (below), not a new scene.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (native && picked) nativeUnityBridge.setCharacterPreview(previewInit(picked));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  const toggleCamera = () => {
    const on = !cameraOn;
    sfx.tap();
    setCameraOn(on);
    setTrack(on ? 'starting' : 'off');
    nativeUnityBridge.setFaceTracking(on);
  };
  const TRACK_LINE: Record<FaceTrackingState, TranslationKey | null> = {
    off: null, starting: 'character.cam.starting', tracking: 'character.cam.tracking',
    no_face: 'character.cam.noFace', unsupported: 'character.cam.unsupported',
  };

  const onDone = () => {
    if (!picked) return;
    sfx.select();
    setPlayerCharacter(picked);
    if (onboarding) return; // the navigator drops this screen once a character is stored
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        {onboarding ? (
          <View style={styles.headerSpacer} />
        ) : (
          <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
            <Icon name="back" size={28} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{t('character.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        {native ? (
          <>
            {/* Solid parent, never faded: an embedded UnityView inside a transparent or animated
                parent stops drawing (meditation room, on device). The art fades OVER it instead. */}
            <View style={[styles.pane, { height: paneH }]} testID="character-preview">
              <UnityHost style={StyleSheet.absoluteFill} />
              {pickedDef ? (
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.paneArt, { opacity: artOut }]}>
                  <Image source={pickedDef.art} style={{ width: Math.round(paneH * 600 / 960), height: paneH }} resizeMode="contain" />
                </Animated.View>
              ) : null}
            </View>
            <View style={styles.cameraRow}>
              <Pressable
                testID="character-camera"
                accessibilityRole="switch"
                accessibilityState={{ checked: cameraOn }}
                onPress={toggleCamera}
                style={[styles.cameraBtn, cameraOn && styles.cameraBtnOn]}>
                <Text style={[styles.cameraLabel, cameraOn && styles.labelOn]}>
                  {t(cameraOn ? 'character.cameraOff' : 'character.cameraOn')}
                </Text>
              </Pressable>
              {TRACK_LINE[track] ? <Text style={styles.cameraState}>{t(TRACK_LINE[track]!)}</Text> : null}
            </View>
            {cameraOn ? <Text style={styles.hint}>{t('character.cam.privacy')}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {options.map(c => {
                const on = picked === c.id;
                return (
                  <Pressable
                    key={c.id}
                    testID={`character-${c.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => { sfx.tap(); setPicked(c.id); }}
                    style={[styles.thumb, on && styles.cardOn]}>
                    <Image source={c.art} style={styles.thumbArt} resizeMode="contain" />
                    <Text style={[styles.thumbLabel, on && styles.labelOn]}>{label(c)}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}
        {!native ? <Text style={styles.intro}>{t('character.intro')}</Text> : null}
        {!native ? <View style={styles.row}>
          {options.map(c => {
            const on = picked === c.id;
            return (
              <Pressable
                key={c.id}
                testID={`character-${c.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => { sfx.tap(); setPicked(c.id); }}
                onLayout={e => setArtW(Math.round(e.nativeEvent.layout.width - 2 * spacing.sm))}
                style={[styles.card, options.length === 1 ? styles.cardSolo : styles.cardHalf, on && styles.cardOn]}>
                {artW > 0 ? (
                  <Image source={c.art} style={{ width: artW, height: Math.round(artW * ART_ASPECT) }} resizeMode="contain" />
                ) : null}
                <View style={styles.labelRow}>
                  <Text style={[styles.label, on && styles.labelOn]}>{label(c)}</Text>
                  {!BODY_READY[c.gender] ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{t('character.soon')}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View> : null}
        {pickedDef && !BODY_READY[pickedDef.gender] ? (
          <Text style={[styles.hint, styles.soonHint]} testID="character-soon-note">{t('character.femaleSoon')}</Text>
        ) : null}
        {gender ? <Text style={styles.hint}>{t('character.byGender')}</Text> : null}
        {onboarding && !gender ? <Text style={styles.hint}>{t('character.hint')}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton
          label={onboarding ? t('character.start') : t('character.save')}
          onPress={onDone}
          disabled={!picked}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  headerSpacer: { width: 28 },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  intro: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    overflow: 'hidden',
  },
  // One card when the profile names a gender: not stretched across the row, so the figure keeps
  // the size it has beside a second card.
  cardSolo: { flex: 0, width: '62%' },
  // Two to a row: half the width less half the gap.
  cardHalf: { flex: 0, width: '47.5%' },
  cardOn: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...typography.bodyStrong, color: colors.textSecondary },
  labelOn: { color: colors.violetSoft },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  badgeText: { ...typography.caption, color: colors.textMuted },
  hint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  soonHint: { color: colors.violetSoft },
  pane: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#13101c' },
  paneArt: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#13101c' },
  cameraRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cameraBtn: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent',
  },
  cameraBtnOn: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  cameraLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  cameraState: { ...typography.caption, color: colors.violetSoft, flex: 1 },
  strip: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumb: {
    width: 88, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent',
  },
  thumbArt: { width: 64, height: 102 },
  thumbLabel: { ...typography.caption, color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
});
