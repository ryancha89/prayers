import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, TextInput } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import type { Lang } from '../../../shared/i18n/store';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import { HAIRLINE, IVORY, PLATE, RING_COMPACT, RingButton, SERIF } from '../../../shared/components/hud/Hud';
import type { RootStackParamList } from '../../../navigation/types';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getCafeBridge, isNativeUnity, nativeUnityBridge, unityApiBase } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import type { CafePhase, CafeReplyError, MyRoomCamera } from '../../counseling/types';
import { getUserAuth, useAuthStore, validGameToken } from '../../auth/store/authStore';
import { ensureGameToken } from '../../auth/api/session';
import { presenceUrl } from '../../../shared/config/api';
import { WorldJoystick } from '../../world/components/WorldJoystick';
import { PROMPT_LIFT } from '../../world/components/PromptButton';
import { useFollowCamera } from '../../world/components/useWorldCamera';
import { counselorRegistry } from '../../counselors/data/registry';
import { localizeCounselors } from '../../counselors/data/mockCounselors';
import { CoinPill } from '../../coins/components/CoinPill';
import { useCafeTable } from '../table/useCafeTable';
import { TablePanel } from '../components/TablePanel';
import { ConfirmSheet } from '../components/ConfirmSheet';
import { FortuneCard } from '../components/FortuneCard';
import { Bubble, GhostButton, Medallion, PanelBackdrop } from '../components/CafeChrome';
import { TAROT_TABLE } from '../table/tarotTable';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** How long the loading veil may say "Loading" before it offers a retry: past the bridge's last INIT retry. */
export const CAFE_STALL_MS = 9000;

/** Where every visit starts, and what a double-tap returns to: CafeEntry maps 0.5 / 0 / 0 onto the
 *  scene's own framing, so this side needs no copy of the scene's numbers. */
export const CAFE_HOME: MyRoomCamera = { zoom: 0.5, yaw: 0, pitch: 0 };

/** The seat ids Unity's cafe has (CAFE_READY.spots) that this app has words for. Any other id is
 *  offered as "sit together" rather than as its raw id. */
const SPOT_LABEL: Record<string, TranslationKey> = { bar: 'cafe.spot.bar', lounge: 'cafe.spot.lounge', tarot: 'cafe.spot.tarot' };
export const spotLabel = (spot: string): TranslationKey => SPOT_LABEL[spot] ?? 'cafe.spot.any';

const SEAT_REASONS = new Set(['unreachable', 'blocked', 'busy']);
const REPLY_ERRORS = new Set<CafeReplyError>(['no_session', 'no_chart', 'ticket', 'rate_limited', 'upstream', 'connection', 'busy']);

/** CAFE_REPLY's error key → its copy; an unknown key (a newer player) reads as the service being down. */
export const replyErrorKey = (error: string): TranslationKey =>
  `cafe.err.${REPLY_ERRORS.has(error as CafeReplyError) ? error : 'upstream'}` as TranslationKey;

/** The guest's persona (CAFE_READY.guest) → the name this app shows for that counselor, through the
 *  registry (persona → characterId) and the localized roster. Falls back to the persona id. */
export function guestName(persona: string, lang: Lang): string {
  const characterId = counselorRegistry.find(c => c.personaId === persona && c.characterId)?.characterId;
  const card = characterId ? localizeCounselors(lang).find(c => c.characterId === characterId) : undefined;
  return card?.name ?? persona;
}

/**
 * What of the cafe the screen's UI hides, for VIEW_INSETS: the top row, and the conversation panel
 * while seated — from the bottom in portrait, down the right in landscape. Exported for the tests.
 */
export function cafeCoveredPx(r: MeasuredRects, landscape: boolean) {
  const { host, top, panel } = r;
  if (!host) return null;
  const covered = { top: top ? top.y + top.height : 0 };
  if (!panel) return covered;
  // Sideways the panel is a right-hand column — except the reading's strip (spreading, picking,
  // revealing), which runs along the bottom edge in both orientations. Reported as a right inset it
  // read as ~80% of the view hidden, and Unity pushed the table to the left edge from metres away
  // (19-10, "góc ngang camera bị che"). A panel across most of the width covers the bottom.
  const across = panel.width > host.width * 0.6;
  return landscape && !across ? { ...covered, right: host.width - panel.x } : { ...covered, bottom: host.height - panel.y };
}

/**
 * The coffee shop (Afterglow) — the world's sixth door (16-10): walk in, sit down with the counselor
 * at the counter, talk.
 *
 * UNITY IS THE CAFE, RN IS EVERYTHING YOU TOUCH, as in My Room. The scene was built standalone with
 * its own English IMGUI; while this screen hosts it, Unity's CafeEntry turns that off and this draws
 * the controls instead: the world's stick (WALK_INPUT), the follow camera's fingers (CAFE_CAMERA), a
 * Sit button for the seat the player walked up to (CAFE_NEAR → CAFE_SIT), and once seated a
 * conversation panel (CAFE_SAY → CAFE_REPLY, CAFE_SHOT, CAFE_STAND). The words are this app's, in six
 * languages; the guest's answers come from the server the consultation rooms use, through Unity.
 *
 * SIT ANYWHERE (PM 21-10, Jeongmin: "just let user select anywhere and sit — after sitting the table,
 * order coffee would be better"). Nothing is asked at the door and nothing is listed: no table card,
 * no chips, no pins. The player is free in the room; a tap on any chair, stool, sofa or table goes out
 * as CAFE_TAP (the look layer's short tap) and Unity walks them there by themselves — no barista
 * escort. Walking up to a seat with the stick, Unity names it in CAFE_NEAR and a Sit button offers it.
 * A one-line hint says so until the first sit of the visit. Seated, the table's menu opens (Order
 * Coffee first): coffee at any table, tarot at the tarot table (from another one, the player walks
 * over first).
 *
 * ONE UNITYVIEW AT A TIME: the world unmounts its host before navigating here (WorldScreen.leaveTo)
 * and mounts it again at the cafe's door (returnZone 'cafe') once this screen has gone.
 *
 * AT A TABLE (spec 007, CAFE_SEATED): the table service takes over the bottom of the screen — coffee
 * with a fortune cookie, or a tarot reading with an AI reader — see table/useCafeTable.ts. The stick,
 * the look layer and the guest's panel stay down until the player stands again (CAFE_PHASE exploring),
 * so nothing of this screen sits between a finger and the cards on the table.
 *
 * WITHOUT THE PLAYER (jest, a build with no Unity framework) nothing answers CAFE_INIT: the screen
 * stays on its veil with the way back, which is the whole no-Unity experience.
 */
export const CafeScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const screen = useScreen();
  const landscape = screen.landscape;
  const safe = useSafeAreaInsets();
  const unity = isNativeUnity();
  const bridge = getCafeBridge();

  const [up, setUp] = useState(false);
  const [guest, setGuest] = useState('');
  /** The seat the player is walking to (CAFE_PHASE seating). */
  const [heading, setHeading] = useState('');
  /** The free seat the player stands by on foot (CAFE_NEAR), offered as the Sit button; '' = none. */
  const [nearSeat, setNearSeat] = useState('');
  /** Sat down once this visit: the "tap a seat" hint has done its job. */
  const [hasSat, setHasSat] = useState(false);
  const [phase, setPhase] = useState<CafePhase>('exploring');
  /** The player's last message and the guest's answer (or what went wrong) — the panel's two lines. */
  const [said, setSaid] = useState('');
  const [reply, setReply] = useState<{ text: string; error: boolean } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [draft, setDraft] = useState('');

  // No CAFE_READY after the bridge's retries: say so and offer another try (My Room's rule).
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!unity || up) { setStalled(false); return undefined; }
    const timer = setTimeout(() => setStalled(true), CAFE_STALL_MS);
    return () => clearTimeout(timer);
  }, [unity, up, attempt]);

  // A seat that could not be reached, said for a moment over the cafe.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((line: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(line);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);

  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: r => cafeCoveredPx(r, landscape),
  });

  // The Go presence server verifies the pgt_ token with Rails; without one the cafe opens alone.
  const initFor = useCallback(
    () => ({
      lang,
      apiBase: unityApiBase,
      auth: getUserAuth() ?? '',
      presenceUrl: presenceUrl(),
      gameToken: validGameToken() ?? '',
      name: useAuthStore.getState().displayName ?? '',
    }),
    [lang],
  );
  // Mint the token before the door opens, so the shared room is joined on the first try. A visit
  // left while the token was still on its way must not reopen the cafe behind the player's back.
  const visiting = useRef(false);
  const openWithToken = useCallback(() => {
    ensureGameToken()
      .catch(() => null)
      .finally(() => { if (visiting.current) bridge.openCafe(initFor()); });
  }, [bridge, initFor]);
  const retry = () => {
    sfx.tap();
    setStalled(false);
    setAttempt(a => a + 1);
    openWithToken();
  };

  /** The Sit button: the seat Unity named in CAFE_NEAR, walked to unguided. A taken one is refused
   *  `busy` and said so. */
  const sitHere = () => {
    if (!nearSeat) return;
    sfx.select();
    bridge.sendCafeSit(nearSeat);
  };

  // Ask for the cafe on the way in; close it on the way out. `lang` is read once, as in My Room.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    const off = bridge.onEvent(e => {
      switch (e.type) {
        case 'CAFE_READY':
          setUp(true);
          setGuest(e.payload?.guest ?? '');
          break;
        case 'CAFE_NEAR':
          setNearSeat(e.payload?.near && typeof e.payload.spot === 'string' ? e.payload.spot : '');
          break;
        case 'CAFE_PHASE': {
          const p = e.payload;
          if (!p) break;
          setPhase(p.phase);
          // Up from the floor, the Sit button's seat is no longer where they stand; Unity says it afresh.
          if (p.phase !== 'exploring') setNearSeat('');
          if (p.phase === 'seating') setHeading(p.spot ?? '');
          if (p.phase === 'talking') {
            setSaid('');
            setReply(null);
            setWaiting(false);
          }
          // A move to the tarot table refused (taken), or the table taken on the way back: still seated.
          if (p.phase !== 'exploring' && p.reason === 'busy') { say(tRef.current('cafe.move.busy')); break; }
          if (p.phase === 'exploring') {
            setWaiting(false);
            if (SEAT_REASONS.has(p.reason)) say(tRef.current(`cafe.seat.${p.reason}` as TranslationKey));
          }
          break;
        }
        case 'CAFE_REPLY': {
          const p = e.payload;
          setWaiting(false);
          if (!p) break;
          if (p.ok && p.text) setReply({ text: p.text, error: false });
          else setReply({ text: tRef.current(replyErrorKey(p.error)), error: true });
          break;
        }
      }
    });
    visiting.current = true;
    openWithToken();
    return () => {
      visiting.current = false;
      off();
      bridge.closeCafe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  const table = useCafeTable(bridge, lang, t);
  const atTable = table.state.seated;
  // Standing up from the table takes its panel's cover with it (the guest's panel reports its own).
  useEffect(() => {
    if (!atTable) insets.put('panel', null);
    else setHasSat(true);
  }, [atTable, insets]);

  const exploring = phase === 'exploring' && !atTable;
  const talking = phase === 'talking' && !atTable;
  const controlsOn = !unity || up;
  const look = useFollowCamera({
    enabled: controlsOn && exploring,
    home: CAFE_HOME,
    send: c => bridge.sendCafeCamera(c),
    doubleTapHome: true,
    // A tap on the room: Unity checks it against the furniture — a chair, stool, sofa or table is a seat.
    onTap: (x, y) => bridge.sendCafeTap(x, y),
  });

  const name = useMemo(() => (guest ? guestName(guest, lang) : ''), [guest, lang]);
  const toWorld = () => {
    sfx.back();
    navigation.goBack();
  };
  const stand = () => {
    sfx.tap();
    bridge.sendCafeStand();
  };
  const send = () => {
    const text = draft.trim();
    if (!text || waiting) return;
    sfx.send();
    setSaid(text);
    setReply(null);
    setWaiting(true);
    setDraft('');
    bridge.sendCafeSay(text);
  };

  const panelH = screen.vh(0.42, 240, 380);
  const bottomPad = safe.bottom + spacing.sm;

  return (
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded, and never inside a transparent parent: an embedded UnityView in one
          stops drawing (meditation room, measured on device). The veil sits OVER it until READY. */}
      {unity && <UnityHost style={styles.unity} />}
      {(!unity || !up) && (
        <View style={[styles.unity, styles.veil]} testID="cafe-veil">
          <Medallion icon="coffee" size={72} />
          {unity && (
            <>
              <Text style={styles.veilText}>{t(stalled ? 'cafe.stalled' : 'cafe.loading')}</Text>
              {stalled && (
                <Pressable style={styles.retry} onPress={retry} accessibilityRole="button" testID="cafe-retry">
                  <Text style={styles.retryText}>{t('myroom.retry')}</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      )}

      {/* The look-around layer: transparent, over the Unity view, under every control. */}
      {controlsOn && exploring && <View style={StyleSheet.absoluteFill} testID="cafe-look" {...look} />}

      {/* At the table the cards and the cookie are Unity's, but the touch is this screen's: the embedded
          view gets none (sim QA 20-10, not one card could be picked). Under the top row and the strip. */}
      {tapsToUnity(table.state) && <TapLayer onTap={(x, y) => bridge.sendCafeTap(x, y)} />}

      {/* Top row: the way back to the world on the left, the place's name beside it. */}
      <View
        testID="cafe-top"
        pointerEvents="box-none"
        style={[styles.top, { paddingTop: safe.top + spacing.sm, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md }]}
        onLayout={insets.track('top')}>
        <RingButton testID="cafe-back" icon="back" size={RING_COMPACT} label={t('myroom.back')} onPress={toWorld} />
        <View style={styles.titlePlate}>
          <Text style={styles.title} numberOfLines={1}>{t('world.zone.cafe')}</Text>
        </View>
        {atTable && (
          <>
            <View style={styles.grow} pointerEvents="none" />
            <CoinPill />
          </>
        )}
      </View>

      {/* On foot: the world's stick, bottom-left. */}
      <View pointerEvents="box-none" style={[styles.stick, { left: safe.left + spacing.xs, bottom: bottomPad }]}>
        <WorldJoystick visible={controlsOn && exploring} />
      </View>

      {/* On foot: the seat the player walked up to, offered — or, until the first sit, one line saying a
          tap on any seat will do. Above the stick; nothing else covers the room. */}
      {up && exploring && (nearSeat || !hasSat) && (
        <View pointerEvents="box-none" style={[styles.promptWrap, { bottom: safe.bottom + (landscape ? PROMPT_LIFT.landscape : PROMPT_LIFT.portrait) }]}>
          {nearSeat ? (
            <Pressable testID="cafe-sit" onPress={sitHere} accessibilityRole="button" accessibilityLabel={t('cafe.sit')}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Icon name="coffee" size={18} color={INK} />
              <Text style={styles.ctaText} numberOfLines={1}>{t('cafe.sit')}</Text>
            </Pressable>
          ) : (
            <View pointerEvents="none" style={styles.hint} testID="cafe-hint">
              <Text style={styles.hintText} numberOfLines={1}>{t('cafe.hint.tapSeat')}</Text>
            </View>
          )}
        </View>
      )}

      {/* On the way to the seat, by themselves. */}
      {phase === 'seating' && !atTable && (
        <View pointerEvents="box-none" style={[styles.promptWrap, { bottom: safe.bottom + (landscape ? PROMPT_LIFT.landscape : PROMPT_LIFT.portrait) }]} testID="cafe-seating">
          <View style={[styles.card, styles.row]}>
            <Medallion icon={heading === TAROT_TABLE ? 'sparkle' : 'coffee'} size={38} />
            <Text style={[styles.cardLine, styles.grow]}>{t(heading === TAROT_TABLE ? 'cafe.move.tarot' : 'cafe.walking')}</Text>
            <GhostButton testID="cafe-cancel" label={t('cafe.cancel')} onPress={stand} />
          </View>
        </View>
      )}

      {/* Seated: the conversation. Bottom panel upright, right-hand panel sideways. */}
      {talking && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={landscape ? [styles.sideDock, { top: 0, width: screen.sidePanel }] : styles.bottomDock}>
          <View
            testID="cafe-panel"
            onLayout={insets.track('panel')}
            style={[
              styles.panel,
              landscape
                ? [styles.panelSide, { paddingTop: safe.top + spacing.md, paddingRight: safe.right + spacing.md, paddingBottom: bottomPad }]
                : { height: panelH + safe.bottom, paddingBottom: bottomPad, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md },
            ]}>
            <PanelBackdrop side={landscape} />
            <View style={styles.panelHead}>
              <Text style={styles.guest} numberOfLines={1}>{name}</Text>
              <RingButton testID="cafe-angle" icon="image" size={RING_COMPACT} label={t('cafe.angle')} onPress={() => { sfx.tap(); bridge.sendCafeShot(); }} />
              <RingButton testID="cafe-leave" icon="exit" size={RING_COMPACT} label={t('cafe.leave')} onPress={stand} />
            </View>
            <ScrollView style={styles.lines} contentContainerStyle={styles.linesBody}>
              {said ? <Bubble mine who={t('cafe.you')} text={said} /> : null}
              <Bubble who={name} textID="cafe-reply" muted={waiting || !!reply?.error}
                text={waiting ? t('cafe.thinking') : reply ? reply.text : t('cafe.opening')} />
            </ScrollView>
            <View style={styles.inputRow}>
              <TextInput
                testID="cafe-input"
                style={[styles.input, { maxHeight: screen.vh(0.12, 64, 110) }]}
                value={draft}
                onChangeText={setDraft}
                placeholder={t('cafe.placeholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
              />
              <Pressable testID="cafe-send" onPress={send} disabled={waiting || !draft.trim()} accessibilityRole="button"
                accessibilityLabel={t('cafe.send')} accessibilityState={{ disabled: waiting || !draft.trim() }}
                style={({ pressed }) => [styles.send, (waiting || !draft.trim()) && styles.muted, pressed && styles.pressed]}>
                <Icon name="send" size={18} color={INK} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* At a table: the menu, the reading, the coffee — then what asks before a coin is spent, and the
          fortune from the cookie, over everything. */}
      <TablePanel table={table} safe={safe} onLayout={insets.track('panel')} />
      {table.state.stage === 'fortune' && table.state.fortune ? (
        <FortuneCard text={table.state.fortune} onClose={table.closeFortune} />
      ) : null}
      {table.state.confirm && (
        <ConfirmSheet paid={table.state.confirm} onPay={table.confirm} onCancel={table.cancelConfirm} onGetCoins={table.getCoins} />
      )}

      {note && (
        <View pointerEvents="none" style={[styles.noteWrap, { top: safe.top + RING_COMPACT + spacing.xl }]} testID="cafe-note">
          <Text style={styles.note}>{note}</Text>
        </View>
      )}
    </View>
  );
};

/** The table stages whose touches belong to the 3D table: choosing the seven, opening the cookie. */
export const tapsToUnity = (s: { seated: boolean; stage: string }) => s.seated && (s.stage === 'picking' || s.stage === 'cookie');

/** Further than this (points) between finger down and up, and it was not a tap. */
const TAP_SLOP = 12;

/** A transparent layer over the Unity view that hands each tap on as 0..1 of the view from its
 *  top-left (CAFE_TAP, WORLD_TAP's convention). A drag is not a tap. */
export const TapLayer: React.FC<{ onTap: (x: number, y: number) => void }> = ({ onTap }) => {
  const size = useRef({ w: 0, h: 0 });
  const down = useRef<{ x: number; y: number } | null>(null);
  return (
    <View
      style={StyleSheet.absoluteFill}
      testID="cafe-tap"
      onLayout={e => { size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={e => { down.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }; }}
      onResponderRelease={e => {
        const d = down.current;
        down.current = null;
        const { w, h } = size.current;
        const { locationX: x, locationY: y } = e.nativeEvent;
        if (!d || w <= 0 || h <= 0 || Math.hypot(x - d.x, y - d.y) > TAP_SLOP) return;
        onTap(x / w, y / h);
      }}
    />
  );
};

const INK = '#1A1330';
const NOTE_MS = 2600;

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0B0A26' },
  unity: { ...absoluteFill },
  veil: { backgroundColor: '#0B0A26', alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  veilText: { ...typography.caption, color: colors.textPrimary },
  retry: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.8)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.6)',
  },
  retryText: { ...typography.caption, color: colors.textPrimary },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm,
  },
  titlePlate: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: PLATE, borderWidth: 1, borderColor: HAIRLINE, maxWidth: '70%',
  },
  title: { fontFamily: SERIF, fontSize: 16, color: IVORY, letterSpacing: 0.4 },
  stick: { position: 'absolute' },
  promptWrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 400, padding: spacing.md, gap: spacing.sm, borderRadius: radius.xl,
    backgroundColor: 'rgba(22,14,46,0.9)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  grow: { flex: 1 },
  cardLine: { ...typography.body, color: colors.textPrimary },
  hint: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,12,40,0.72)', borderWidth: 1, borderColor: HAIRLINE,
  },
  hintText: { ...typography.caption, color: IVORY },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  ctaText: { ...typography.bodyStrong, color: INK, flexShrink: 1 },
  ghost: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill, borderWidth: 1, borderColor: HAIRLINE },
  ghostText: { ...typography.caption, color: IVORY },
  bottomDock: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sideDock: { position: 'absolute', right: 0, bottom: 0 },
  panel: {
    overflow: 'hidden', paddingTop: spacing.lg, paddingHorizontal: spacing.md, gap: spacing.md,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  // Sideways: a full-height column down the right, its edge on the left.
  panelSide: { flex: 1, borderTopRightRadius: 0 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  guest: { flex: 1, fontFamily: SERIF, fontSize: 18, color: IVORY },
  lines: { flex: 1 },
  linesBody: { gap: spacing.sm, paddingBottom: spacing.xs },
  said: { ...typography.caption, color: colors.textSecondary },
  reply: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  replyError: { color: colors.textSecondary, fontStyle: 'italic' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1, ...typography.body, color: colors.textPrimary, minHeight: 46,
    paddingHorizontal: spacing.lg, paddingTop: 13, paddingBottom: 13, borderRadius: 23,
    backgroundColor: 'rgba(10,8,26,0.55)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  send: {
    width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  muted: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  noteWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.xl },
  note: {
    ...typography.caption, color: IVORY, textAlign: 'center', overflow: 'hidden',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,12,40,0.86)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
});
