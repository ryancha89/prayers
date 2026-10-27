import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
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
import { useCharacterView } from '../useCharacterView';
import { HAIR_COLORS, knownHair } from '../hairColors';
import { beginSceneTransition } from '../../../shared/transition/sceneTransition';
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
 * 27-10, THE CREATOR (step 1 of "làm giống" a game's character creator): with Unity the screen IS
 * the 3D view — full screen, the body standing whole on a lit stage, the controls laid over it. One
 * finger turns the body, two zoom to the face (CHARACTER_VIEW); a pill jumps between the two shots.
 * Unity fits the body into the band the top bar and the bottom panel leave clear
 * (CharacterPreviewStage._topCover / _bottomCover = 12% / 30% of the height — keep them in step
 * with TOP_COVER / BOTTOM_COVER below).
 *
 * Steps (27-10, creator steps 2-4): Character → Hair → Done, a bar under the header. Each step has
 * its own shot — the whole body to pick a character, the head and shoulders for the hair, the whole
 * body again to finish. A new body comes round onto the camera (Unity), and "start" turns it once
 * (CHARACTER_CONFIRM) before the pick is stored. The hair colour (`playerHair`) is stored with the
 * character and travels on every *_INIT like it, so the World walks the same hair.
 *
 * BODY_READY says which gender Unity can actually mount; a `false` shows "Coming soon" and a note,
 * and still saves the pick so the body is there the day it lands.
 */
const BODY_READY: Record<PlayerGender, boolean> = { male: true, female: true };

/** The face-tracking camera on the creator: "coming soon" for now (27-10). */
export const CAMERA_READY = false;

/** The share of the screen the creator's top bar and bottom panel cover (Unity frames around them). */
const TOP_COVER = 0.12;
const BOTTOM_COVER = 0.3;

/** The creator's steps, and the zoom each one frames (0 whole body … 1 face). */
const ALL_STEPS = ['look', 'hair', 'done'] as const;
type Step = (typeof ALL_STEPS)[number];
const STEP_ZOOM: Record<Step, number> = { look: 0, hair: 0.8, done: 0 };
const STEP_LABEL: Record<Step, TranslationKey> = { look: 'character.step.look', hair: 'character.step.hair', done: 'character.step.done' };
/** How long Unity's confirm turn takes (CharacterPreviewStage.ConfirmTime) before the pick is stored. */
const CONFIRM_MS = 1250;

/** The card art is 600×960: height = width × this. */
const ART_ASPECT = 960 / 600;

export const CharacterSelectScreen: React.FC = () => {
  const navigation = useNavigation();
  const onboarding = useRoute().name === 'CharacterSetup';
  const t = useT();
  const stored = useSubjectsStore(s => s.playerCharacter);
  const gender = useSubjectsStore(s => s.self.gender);
  const setPlayerCharacter = useSubjectsStore(s => s.setPlayerCharacter);
  const storedHair = useSubjectsStore(s => s.playerHair);
  const setPlayerHair = useSubjectsStore(s => s.setPlayerHair);
  const setCreatorSeen = useSubjectsStore(s => s.setCreatorSeen);
  const [hair, setHair] = useState(knownHair(storedHair));
  // 27-10 ("làm phần chọn character cho hợp lý"): with a gender on the profile there is ONE
  // character to pick, and a step that "chooses" from a single card is a step for nothing. The
  // character step only appears when there is a choice to make.
  const options = charactersFor(gender);
  const STEPS: readonly Step[] = options.length > 1 ? ALL_STEPS : ALL_STEPS.filter(s => s !== 'look');
  const [step, setStep] = useState<Step>(STEPS[0]);
  const [confirming, setConfirming] = useState(false);
  // No gender and no pick yet (the "Later" path): in the 3D creator, the first card — with no id
  // Unity mounted its fallback, Theo, who is not one of the choices (review 27-10). The card grid
  // (no Unity) keeps asking for a deliberate pick.
  const [picked, setPicked] = useState<string | undefined>(
    effectiveCharacter(gender, stored)?.id ?? (isNativeUnity() ? options[0]?.id : undefined));
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
  const bandH = Math.round(screenH * (1 - TOP_COVER - BOTTOM_COVER));
  const [zoomed, setZoomed] = useState(false);
  const [turned, setTurned] = useState(false);
  const zoomedRef = useRef(false);
  // The overlay's real extent, measured (review 27-10: the bottom panel ran ~281 pt on a 852 pt
  // phone against the 30% Unity framed to, and the top bar ~127 against 12%): sent with every view
  // so Unity fits the body between what is really there.
  const covers = useRef<{ top?: number; bottom?: number }>({});
  const view = useCharacterView(
    v => {
      nativeUnityBridge.setCharacterView({ ...v, ...covers.current });
      const z = v.zoom > 0.5;
      if (z !== zoomedRef.current) { zoomedRef.current = z; setZoomed(z); }
    },
    // the hint goes when a finger turns the body, not when a step sets the shot
    () => { if (!turned) setTurned(true); },
  );
  const measure = (which: 'top' | 'bottom') => (e: { nativeEvent: { layout: { height: number } } }) => {
    const f = Math.round((e.nativeEvent.layout.height / Math.max(1, screenH)) * 1000) / 1000;
    if (covers.current[which] === f) return;
    covers.current = { ...covers.current, [which]: f };
    view.set({ ...view.current.current });
  };
  // Each step frames its own shot; the turn the player gave the body is kept, except at the end.
  useEffect(() => {
    if (!native) return;
    view.set({ yaw: step === 'done' ? 0 : view.current.current.yaw, zoom: STEP_ZOOM[step] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const goStep = (to: Step) => {
    if (confirming || to === step) return;
    sfx.tap();
    setStep(to);
  };
  const stepIndex = STEPS.indexOf(step);
  // Loading the character (27-10, "nếu nặng cũng nên có loading nhân vật"): opening the creator goes
  // through the shared scene transition (the picked character's card, the creator's own tips); a card
  // switch mounts a new body in Unity, whose first frame is the heavy part — an indicator over the
  // stage from the tap until Unity's CHARACTER_BODY (never under 350 ms, never over 6 s).
  const [bodyLoading, setBodyLoading] = useState(false);
  const bodySince = useRef(0);
  const bodyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPick = useRef(true);
  const stopBodyLoading = (afterMs = 0) => {
    if (bodyTimer.current) clearTimeout(bodyTimer.current);
    bodyTimer.current = setTimeout(() => { bodyTimer.current = null; setBodyLoading(false); }, afterMs);
  };
  useEffect(() => {
    if (!native || !picked) return;
    if (firstPick.current) { firstPick.current = false; return; }
    setBodyLoading(true);
    bodySince.current = Date.now();
    stopBodyLoading(6000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  useEffect(() => () => { if (bodyTimer.current) clearTimeout(bodyTimer.current); }, []);
  const toggleShot = () => {
    sfx.tap();
    view.set({ yaw: view.current.current.yaw, zoom: zoomed ? 0 : 1 });
  };
  const artOut = useRef(new Animated.Value(1)).current;
  const [cameraOn, setCameraOn] = useState(false);
  const [track, setTrack] = useState<FaceTrackingState>('off');
  const previewInit = (id?: string) => {
    const def = options.find(c => c.id === id);
    return { lang, playerGender: gender ?? def?.gender, playerCharacter: id, playerHair: hair };
  };
  useEffect(() => {
    if (!native) return undefined;
    beginSceneTransition('creator', { art: options.find(c => c.id === picked)?.art });
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type === 'CHARACTER_BODY') {
        stopBodyLoading(Math.max(0, bodySince.current + 350 - Date.now()));
        return;
      }
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
  }, [picked, hair]);
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

  // Leaving during the confirm turn must not store the pick later and navigate a screen that is gone.
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);
  const commit = () => {
    if (!picked) return;
    setPlayerHair(hair);
    setPlayerCharacter(picked);
    setCreatorSeen();
    if (onboarding) return; // the navigator drops this screen once a character is stored
    navigation.goBack();
  };
  const onDone = () => {
    if (!picked) return;
    sfx.select();
    commit();
  };
  // The creator: "Next" walks the steps; on the last, the body turns once, then the pick is stored.
  const onNext = () => {
    if (!picked || confirming) return;
    if (step !== 'done') { goStep(STEPS[stepIndex + 1]); return; }
    sfx.select();
    setConfirming(true);
    nativeUnityBridge.confirmCharacter();
    confirmTimer.current = setTimeout(() => { confirmTimer.current = null; commit(); }, CONFIRM_MS);
  };
  const onBack = () => {
    if (stepIndex > 0) goStep(STEPS[stepIndex - 1]);
    else navigation.goBack();
  };

  const cards = options.map(c => {
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
  });

  if (native) {
    return (
      // Solid parent, never faded: an embedded UnityView inside a transparent or animated parent
      // stops drawing (meditation room, on device). The art fades OVER it instead.
      <View style={styles.stage} testID="character-preview">
        <UnityHost style={StyleSheet.absoluteFill} />
        {pickedDef ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.stageArt, { top: Math.round(screenH * TOP_COVER), height: bandH, opacity: artOut }]}>
            <Image source={pickedDef.art} style={{ width: Math.round(bandH * 600 / 960), height: bandH }} resizeMode="contain" />
          </Animated.View>
        ) : null}
        {/* The turntable: under the controls, so they keep their taps. */}
        <View style={StyleSheet.absoluteFill} testID="character-turntable" {...view.handlers} />
        {bodyLoading ? (
          <View pointerEvents="none" style={[styles.bodyLoading, { top: Math.round(screenH * TOP_COVER), height: bandH }]} testID="character-body-loading">
            <View style={styles.bodyLoadingCard}>
              <ActivityIndicator color={colors.violetSoft} />
              <Text style={styles.bodyLoadingText}>{t('character.loadingBody')}</Text>
            </View>
          </View>
        ) : null}

        <SafeAreaView edges={['top', 'left', 'right']} style={styles.topBar} pointerEvents="box-none" onLayout={measure('top')}>
          <View style={styles.header}>
            {onboarding && stepIndex === 0 ? (
              <View style={styles.headerSpacer} />
            ) : (
              <Pressable hitSlop={8} onPress={onBack} testID="character-back">
                <Icon name="back" size={28} />
              </Pressable>
            )}
            <Text style={styles.headerTitle}>{t('character.title')}</Text>
            {/* Coming soon (27-10): the tracked face's lines sat over the character's own face, and
                the face shot is the creator's. The switch stays visible, disabled, so the feature is
                announced; CAMERA_READY flips it back on with the code below untouched. */}
            <Pressable
              testID="character-camera"
              accessibilityRole="switch"
              accessibilityState={{ checked: cameraOn, disabled: !CAMERA_READY }}
              disabled={!CAMERA_READY}
              onPress={toggleCamera}
              style={[styles.pill, cameraOn && styles.cardOn, !CAMERA_READY && styles.pillOff]}>
              <Text style={[styles.pillLabel, cameraOn && styles.labelOn, !CAMERA_READY && styles.pillLabelOff]}>
                {CAMERA_READY ? t(cameraOn ? 'character.cameraOff' : 'character.cameraOn') : `${t('character.cameraOn')} · ${t('character.soon')}`}
              </Text>
            </Pressable>
          </View>
          <View style={styles.steps}>
            {STEPS.map((st, i) => (
              <Pressable
                key={st}
                testID={`character-step-${st}`}
                disabled={i > stepIndex || confirming}
                onPress={() => goStep(st)}
                style={styles.stepItem}>
                <View style={[styles.stepDot, i <= stepIndex && styles.stepDotOn]} />
                <Text style={[styles.stepLabel, i === stepIndex && styles.stepLabelOn]}>{t(STEP_LABEL[st])}</Text>
              </Pressable>
            ))}
          </View>
          {CAMERA_READY && TRACK_LINE[track] ? <Text style={styles.overlayLine}>{t(TRACK_LINE[track]!)}</Text> : null}
          {CAMERA_READY && cameraOn ? <Text style={styles.overlayLine}>{t('character.cam.privacy')}</Text> : null}
        </SafeAreaView>

        {!turned ? (
          <Text pointerEvents="none" style={[styles.gestureHint, { bottom: Math.round(screenH * BOTTOM_COVER) + spacing.sm }]}>
            {t('character.view.hint')}
          </Text>
        ) : null}

        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.panel, { minHeight: Math.round(screenH * BOTTOM_COVER) }]} onLayout={measure('bottom')}>
          <View style={styles.panelRow}>
            <Text style={styles.panelName}>{pickedDef ? label(pickedDef) : ''}</Text>
            <Pressable testID="character-shot" onPress={toggleShot} style={styles.pill}>
              <Text style={styles.pillLabel}>{t(zoomed ? 'character.view.full' : 'character.view.face')}</Text>
            </Pressable>
          </View>
          {step === 'look' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
              {cards}
            </ScrollView>
          ) : null}
          {step === 'hair' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
              {HAIR_COLORS.map(c => {
                const on = hair === c.hex;
                return (
                  <Pressable
                    key={c.hex || 'original'}
                    testID={`character-hair-${c.hex ? c.hex.slice(1) : 'original'}`}
                    accessibilityRole="button"
                    accessibilityLabel={c.hex || t('character.hair.original')}
                    accessibilityState={{ selected: on }}
                    onPress={() => { sfx.tap(); setHair(c.hex); }}
                    style={[styles.swatchRing, on && styles.swatchRingOn]}>
                    {c.hex ? (
                      <View style={[styles.swatch, { backgroundColor: c.swatch }]} />
                    ) : (
                      <View style={[styles.swatch, styles.swatchOriginal]}>
                        <Text style={styles.swatchOriginalText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{t('character.hair.original')}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
          {step === 'done' ? <Text style={styles.doneTitle}>{t('character.done.title')}</Text> : null}
          <PrimaryButton
            label={step !== 'done' ? t('character.next') : onboarding ? t('character.start') : t('character.save')}
            onPress={onNext}
            disabled={!picked || confirming}
          />
        </SafeAreaView>
      </View>
    );
  }

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
        <Text style={styles.intro}>{t('character.intro')}</Text>
        <View style={styles.row}>
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
        </View>
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
  // ── the creator (native) ──
  stage: { flex: 1, backgroundColor: '#13101c' },
  bodyLoading: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  bodyLoadingCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.lg,
    backgroundColor: 'rgba(19,16,28,0.78)',
  },
  bodyLoadingText: { ...typography.caption, color: colors.textPrimary },
  stageArt: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  overlayLine: { ...typography.caption, color: colors.violetSoft, paddingHorizontal: spacing.lg, textAlign: 'center' },
  gestureHint: {
    position: 'absolute', left: 0, right: 0, textAlign: 'center',
    ...typography.caption, color: 'rgba(255,255,255,0.7)',
  },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'transparent',
  },
  pillLabel: { ...typography.caption, color: colors.textPrimary },
  pillOff: { opacity: 0.55 },
  pillLabelOff: { color: colors.textMuted },
  panel: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm,
    backgroundColor: 'rgba(19,16,28,0.88)',
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  steps: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg, paddingVertical: spacing.xs },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  stepDotOn: { backgroundColor: colors.violet },
  stepLabel: { ...typography.caption, color: colors.textMuted },
  stepLabelOn: { color: colors.textPrimary },
  swatches: { gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
  swatchRing: { padding: 3, borderRadius: 26, borderWidth: 2, borderColor: 'transparent' },
  swatchRingOn: { borderColor: colors.violet },
  swatch: { width: 40, height: 40, borderRadius: 20 },
  swatchOriginal: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  swatchOriginalText: { fontSize: 9, color: colors.textPrimary, textAlign: 'center' },
  doneTitle: { ...typography.body, color: colors.violetSoft, textAlign: 'center', paddingVertical: spacing.sm },
  panelName: { ...typography.h3, color: colors.textPrimary },
  strip: { gap: spacing.sm, paddingVertical: spacing.xs },
  thumb: {
    width: 88, alignItems: 'center', paddingVertical: spacing.xs, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1.5, borderColor: 'transparent',
  },
  thumbArt: { width: 64, height: 102 },
  thumbLabel: { ...typography.caption, color: colors.textSecondary },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md },
});
