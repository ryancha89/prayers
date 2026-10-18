import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { LECTURE_COUNT, SCHOPENHAUER_ART, chapterOf, seriesFor, type LectureChapter } from '../data/lecture';
import { LECTURE_SPEEDS, SPEED_BASE, SUBTITLE_LINES, useLectureProgress } from '../store/lectureProgress';
import { pauseLine, playLine, resumeLine, setLineSpeed, stopLine } from '../lectureVoice';
import { UnityHost } from '../../counseling/components/UnityHost';
import { isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useFollowCamera } from '../../world/components/useWorldCamera';
import { ALL_ORIENTATIONS } from '../../coins/components/CoinShopSheet';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'Lecture'>;

const LAST = LECTURE_COUNT;
const ON_GOLD = '#1A1330';
/** The lecture framing Unity starts on: zoom 0.5 = LectureRoomBuilder's shot, facing him. */
/** Height one subtitle line takes (styles.line lineHeight). */
const SUBTITLE_LINE_H = 32;
const LECTURE_CAMERA_HOME = { zoom: 0.5, yaw: 0, pitch: 0 };
/** Sentences per camera angle before the cut. */
const SHOT_LINES = 4;

/**
 * One chapter of the Schopenhauer series, played line by line over his portrait.
 *
 * The listener steers, not a script: any chapter from the 목차 sheet, the previous or next sentence,
 * pause, and "다음 강의" at any moment — not only at the end (user: "챕터를 임의로 선택할수있고
 * 중간에 다음 챕터갈수있게"). Each line is its own recording, so the subtitle is always the sentence
 * being spoken and a skip lands on a sentence boundary.
 *
 * A chapter closes on its question, spoken and then left on screen — something to sit with. No
 * answer is asked for and nothing is sent anywhere: this is a lecture, not a consultation.
 *
 * HE IS IN 3D (16-10, user: "3d캐릭터로 나와야하는데"). As in the meditation room, Unity is the
 * scenery only — the study and the old man in it, gesturing while he speaks (LECTURE_STATE) — and
 * the voice, subtitles and controls stay here. The UnityView sits at the back at full opacity (an
 * embedded player under a transparent parent stops drawing — see MeditationRoomScreen), and the
 * painted portrait covers it until LECTURE_READY, then fades. No room, no harm: the portrait stays.
 */
export const LectureScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const lang = useLang();
  const series = seriesFor(lang);
  const markDone = useLectureProgress(s => s.markDone);
  const setAt = useLectureProgress(s => s.setAt);
  const done = useLectureProgress(s => s.done);
  const speed = useLectureProgress(s => s.speed);
  const setSpeed = useLectureProgress(s => s.setSpeed);

  const [chapter, setChapter] = useState<LectureChapter>(() => chapterOf(lang, params.chapter) ?? series.chapters[0]);
  // 0..lines.length-1 = a line; lines.length = the closing question.
  const [index, setIndex] = useState(() => Math.min(params.line ?? 0, chapter.lines.length));
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [sheet, setSheet] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // The portrait is framed, not cropped by `cover` across the whole screen: that zoomed a tall phone
  // onto one cheek. His head and shoulders fill the top two thirds, centred, the subtitles below.
  const win = useWindowDimensions();
  const artH = Math.max(win.height * 0.78, win.width * 1.5);
  const artW = artH * (2 / 3);
  const artOut = useRef(new Animated.Value(1)).current;

  // THE CAMERA MOVES (16-10, user: "앵글 움직여야하고 지금 비율이 너무 커보임"): three angles on the
  // model, a cut every SHOT_LINES sentences (cross-faded, like an edit), the front one for the
  // closing question; and under them a slow push and drift that never stops, so even a held shot
  // is never a still. Unity's room replaces all of this once it answers (LECTURE_READY).
  const shotCount = SCHOPENHAUER_ART.shots.length;
  const shotFades = useRef(SCHOPENHAUER_ART.shots.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  // TURN HIM ROUND (16-10, user: "이거 유저가 돌릴수있게 해야해"): one finger drags the camera round
  // him and up/down, two fingers pinch in/out, a double-tap returns to the lecture framing. Only
  // once the 3D room is up — over the still renders there is nothing to turn.
  const [roomUp, setRoomUp] = useState(false);
  // While the 3D room loads, a plain dark cover — not the still renders, which flashed up for a
  // moment before him on every entry (16-10, user: "첨 누를때 이게 살짝 나오는데 이거 안나와야해").
  // The stills are only the fallback: no embedded player, or a room that has not answered in 8 s.
  const [stills, setStills] = useState(!isNativeUnity());
  useEffect(() => {
    if (!isNativeUnity()) return undefined;
    const t = setTimeout(() => setStills(true), 8000);
    return () => clearTimeout(t);
  }, []);
  const cameraHandlers = useFollowCamera({
    enabled: roomUp,
    home: LECTURE_CAMERA_HOME,
    send: c => nativeUnityBridge.sendLectureCamera(c),
    doubleTapHome: true,
  });

  // Ask Unity for the room once, on the way in; close it on the way out.
  useEffect(() => {
    if (!isNativeUnity()) return undefined;
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type !== 'LECTURE_READY') return;
      setRoomUp(true);
      setStills(false);
      Animated.timing(artOut, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
    nativeUnityBridge.openLectureRoom({ lang, chapter: chapter.no });
    return () => {
      off();
      nativeUnityBridge.closeLectureRoom();
    };
    // Once per visit: a chapter change is LECTURE_STATE, not a new room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = chapter.lines.length;
  const atQuestion = index >= total;
  const current = atQuestion ? chapter.question : chapter.lines[index];
  const shot = atQuestion ? 0 : (Math.floor(index / SHOT_LINES) + chapter.no) % shotCount;
  useEffect(() => {
    Animated.parallel(
      shotFades.map((v, i) =>
        Animated.timing(v, { toValue: i === shot ? 1 : 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
  }, [shot, shotFades]);

  // Called when a line plays out. Reads the line from a ref rather than inside a setIndex updater:
  // an updater must be pure, and marking the chapter heard (a store write) from one updated Home's
  // LectureSeriesCard while this screen was rendering — React's "Cannot update a component while
  // rendering a different component" (16-10).
  const indexRef = useRef(index);
  indexRef.current = index;
  const advance = useCallback(() => {
    if (indexRef.current >= total) {
      setEnded(true);
      setPlaying(false);
      markDone(chapter.no);
      return;
    }
    setIndex(indexRef.current + 1);
  }, [total, chapter.no, markDone]);

  // Whatever is current and wanted, play it. Changing the line or the chapter starts the new take.
  useEffect(() => {
    setAt(chapter.no, index);
    if (!playing || ended) return;
    playLine(current.file, advance, () => setPlaying(false));
    // Only a change of line (or chapter) restarts the voice; pause/resume are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.no, index, ended]);

  useEffect(() => () => stopLine(), []);
  // He gestures while a line plays, rests when paused or done, and turns to the listener on the question.
  useEffect(() => {
    if (!isNativeUnity()) return;
    nativeUnityBridge.sendLectureState({ speaking: playing && !ended, chapter: chapter.no, atQuestion });
  }, [playing, ended, chapter.no, atQuestion]);
  // Before the first line starts (effects run in order), and on every change after.
  useEffect(() => setLineSpeed(speed * SPEED_BASE), [speed]);

  // The speed button opens a list to choose from (16-10, user: "누르면 다음단계로 가는게 아니라 내가
  // 선택으로 속도 조정하게"), rather than stepping to the next speed on each tap.
  const [speedMenu, setSpeedMenu] = useState(false);
  const subtitleLines = useLectureProgress(s => s.subtitleLines);
  const autoplay = useLectureProgress(s => s.autoplay);
  const setAutoplay = useLectureProgress(s => s.setAutoplay);
  const setSubtitleLines = useLectureProgress(s => s.setSubtitleLines);
  const [linesMenu, setLinesMenu] = useState(false);
  // The whole chapter so far is in the subtitle box — scroll up to read what he already said (16-10,
  // user: "이전 자막도 볼수있게 스크롤로"); the box is `subtitleLines` lines tall and follows the voice.
  const subtitleScroll = useRef<ScrollView>(null);
  // "N줄" = room for N sentences of up to two wrapped lines each — a sentence is never cut in half.
  const boxH = subtitleLines * (SUBTITLE_LINE_H * 2 + 6);
  const pickLines = (n: number) => {
    sfx.select();
    setSubtitleLines(n);
    setLinesMenu(false);
  };
  const pickSpeed = (s: number) => {
    sfx.select();
    setSpeed(s);
    setSpeedMenu(false);
  };

  const goChapter = useCallback(
    (no: number) => {
      const next = chapterOf(lang, no);
      if (!next) return;
      stopLine();
      setSheet(false);
      setEnded(false);
      setPlaying(true);
      setChapter(next);
      setIndex(0);
      scroll.current?.scrollTo({ y: 0, animated: false });
    },
    [lang],
  );

  const toggle = () => {
    sfx.tap();
    if (ended) {
      // Played out: the button starts the chapter over.
      goChapter(chapter.no);
      return;
    }
    if (playing) {
      pauseLine();
      setPlaying(false);
    } else {
      setPlaying(true);
      resumeLine(advance);
    }
  };

  const step = (by: number) => {
    sfx.tap();
    stopLine();
    setEnded(false);
    setPlaying(true);
    setIndex(i => Math.max(0, Math.min(total, i + by)));
  };

  // AUTOPLAY: when a chapter has played out (its question too), the next one starts at once
  // (16-10, user: "5초후말고 바로").
  useEffect(() => {
    if (ended && autoplay && chapter.no < LAST) goChapter(chapter.no + 1);
  }, [ended, autoplay, chapter.no, goChapter]);

  const nextChapter = () => {
    sfx.select();
    if (chapter.no < LAST) goChapter(chapter.no + 1);
  };

  return (
    <View style={styles.root}>
      {isNativeUnity() && <UnityHost style={StyleSheet.absoluteFill} />}
      <Animated.View style={[StyleSheet.absoluteFill, styles.cover, { opacity: artOut }]} pointerEvents="none">
        {!stills && !roomUp && <ActivityIndicator style={styles.loading} color={colors.gold} />}
        {stills && SCHOPENHAUER_ART.shots.map((src, i) => (
          <Animated.Image
            key={i}
            source={src}
            style={{
              position: 'absolute', top: 0, left: (win.width - artW) / 2, width: artW, height: artH,
              opacity: shotFades[i],
              transform: [
                { scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
                { translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [i === 1 ? -6 : 6, i === 1 ? 6 : -6] }) },
              ],
            }}
            resizeMode="cover"
          />
        ))}
      </Animated.View>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="lectureFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#05041A" stopOpacity={0.55} />
            <Stop offset="0.16" stopColor="#05041A" stopOpacity={0} />
            <Stop offset="0.45" stopColor="#05041A" stopOpacity={0.15} />
            <Stop offset="0.68" stopColor="#05041A" stopOpacity={0.85} />
            <Stop offset="1" stopColor="#05041A" stopOpacity={0.97} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#lectureFade)" />
      </Svg>

      {/* The turning surface: everything above the subtitles, under the controls. */}
      <View style={styles.turn} {...cameraHandlers} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.top} pointerEvents="box-none">
          <Pressable
            style={styles.ring}
            onPress={() => { sfx.back(); navigation.goBack(); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('lecture.back')}>
            <Icon name="back" size={20} color={colors.textPrimary} />
          </Pressable>
          {/* 16-10 (user: "1강 2강 이부분 좀 ui개선"): a tiny gold "1강" floating over the window and
              rooftops was hard to read. Now one plate: the number as a gold badge, the title beside
              it — tapping it opens the contents, where the chapters are. */}
          <Pressable
            style={styles.topTitle}
            onPress={() => { sfx.tap(); setSheet(true); }}
            accessibilityRole="button"
            accessibilityLabel={`${t('lecture.chapterNo', { no: chapter.no })} · ${chapter.title}`}>
            <View style={styles.titlePlate}>
              <View style={styles.chapterBadge}>
                <Text style={styles.chapterBadgeText}>{String(chapter.no).padStart(2, '0')}</Text>
              </View>
              <View style={styles.titleText}>
                <Text style={styles.eyebrow} numberOfLines={1}>{t('lecture.series')}</Text>
                <Text style={styles.title} numberOfLines={1}>{chapter.title}</Text>
              </View>
            </View>
          </Pressable>
          <Pressable
            testID="lecture-contents"
            style={styles.ring}
            onPress={() => { sfx.tap(); setSheet(true); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('lecture.contents')}>
            <Icon name="menu" size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.spacer} pointerEvents="none" />

        <View style={styles.stage} pointerEvents="box-none">
          {atQuestion ? (
            <View style={styles.questionCard} testID="lecture-question">
              <Text style={styles.questionLabel}>{t('lecture.question')}</Text>
              <Text style={styles.questionText}>{chapter.question.text}</Text>
            </View>
          ) : (
            <ScrollView
              testID="lecture-line"
              ref={subtitleScroll}
              style={{ maxHeight: boxH }}
              contentContainerStyle={styles.subtitleBody}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => subtitleScroll.current?.scrollToEnd({ animated: true })}>
              {chapter.lines.slice(0, index).map((l, k) => (
                <Text key={k} style={[styles.line, styles.linePast]}>{l.text}</Text>
              ))}
              <Text style={styles.line}>{current.text}</Text>
            </ScrollView>
          )}
        </View>

        {/* One tick per sentence, and the question. */}
        <View style={styles.ticks}>
          {Array.from({ length: total + 1 }, (_, i) => (
            <View key={i} style={[styles.tick, i < index && styles.tickDone, i === index && styles.tickNow]} />
          ))}
        </View>

        <View style={styles.controls}>
          <Pressable
            testID="lecture-speed"
            style={styles.speed}
            onPress={() => { sfx.tap(); setLinesMenu(false); setSpeedMenu(m => !m); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${t('lecture.speed')} ${speed}x`}>
            <Text style={styles.speedText}>{`${speed.toFixed(1)}×`}</Text>
          </Pressable>
          <Pressable style={styles.ctl} onPress={() => step(-1)} disabled={index === 0} accessibilityLabel={t('lecture.prev')}>
            <Icon name="prev" size={24} color={index === 0 ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          <Pressable
            testID="lecture-play"
            style={styles.play}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={playing ? t('lecture.pause') : t('lecture.play')}>
            <Icon name={ended ? 'undo' : playing ? 'pause' : 'play'} size={26} color={ON_GOLD} />
          </Pressable>
          <Pressable style={styles.ctl} onPress={() => step(1)} disabled={atQuestion} accessibilityLabel={t('lecture.nextLine')}>
            <Icon name="next" size={24} color={atQuestion ? colors.textMuted : colors.textPrimary} />
          </Pressable>
          {/* Balances the speed button, so play stays in the middle. */}
          <Pressable
            testID="lecture-lines"
            style={styles.speed}
            onPress={() => { sfx.tap(); setSpeedMenu(false); setLinesMenu(m => !m); }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('lecture.lines', { n: subtitleLines })}>
            <Text style={styles.speedText}>{t('lecture.lines', { n: subtitleLines })}</Text>
          </Pressable>
        </View>

        <View style={styles.bottomRow}>
        <Pressable
          testID="lecture-autoplay"
          style={[styles.autoplay, autoplay && styles.autoplayOn]}
          onPress={() => { sfx.tap(); setAutoplay(!autoplay); }}
          accessibilityRole="switch"
          accessibilityState={{ checked: autoplay }}
          accessibilityLabel={t('lecture.autoplay')}>
          {/* Says which state it is in, in words — "자동 재생 중" / "자동 재생 꺼짐" — not only by colour
              (16-10, user: "자동 재생중이면 자동 재생중이라고 명확하게"). */}
          <View style={[styles.autoplayDot, autoplay && styles.autoplayDotOn]} />
          <Text style={[styles.autoplayText, autoplay && styles.autoplayTextOn]}>
            {autoplay ? t('lecture.autoplayOn') : t('lecture.autoplayOff')}
          </Text>
        </Pressable>
        {chapter.no < LAST ? (
          <Pressable
            testID="lecture-next-chapter"
            style={({ pressed }) => [styles.nextChapter, ended && styles.nextChapterLead, pressed && styles.pressed]}
            onPress={nextChapter}
            accessibilityRole="button">
            <Text style={[styles.nextChapterText, ended && styles.nextChapterTextLead]} numberOfLines={1}>
              {`${t('lecture.nextChapter', { no: chapter.no + 1 })} · ${chapterOf(lang, chapter.no + 1)!.title}`}
            </Text>
            <Icon name="arrowRight" size={14} color={ended ? ON_GOLD : colors.gold} />
          </Pressable>
        ) : (
          ended ? <Text style={[styles.finished, styles.nextGrow]}>{t('lecture.finished')}</Text> : <View style={styles.nextGrow} />
        )}
        </View>
      </SafeAreaView>

      {speedMenu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSpeedMenu(false)} testID="lecture-speed-dismiss" />
          <View style={styles.speedMenu} testID="lecture-speed-menu">
            <Text style={styles.speedMenuTitle}>{t('lecture.speed')}</Text>
            {[...LECTURE_SPEEDS].reverse().map(s => (
              <Pressable
                key={s}
                testID={`lecture-speed-${s}`}
                style={[styles.speedRow, s === speed && styles.speedRowOn]}
                onPress={() => pickSpeed(s)}
                accessibilityRole="button"
                accessibilityState={{ selected: s === speed }}>
                <Text style={[styles.speedRowText, s === speed && styles.speedRowTextOn]}>{`${s.toFixed(1)}×`}</Text>
                {s === speed && <Icon name="check" size={14} color={ON_GOLD} />}
              </Pressable>
            ))}
          </View>
        </>
      )}

      {linesMenu && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setLinesMenu(false)} />
          <View style={[styles.speedMenu, styles.linesMenu]} testID="lecture-lines-menu">
            <Text style={styles.speedMenuTitle}>{t('lecture.subtitles')}</Text>
            {SUBTITLE_LINES.map(n => (
              <Pressable
                key={n}
                testID={`lecture-lines-${n}`}
                style={[styles.speedRow, n === subtitleLines && styles.speedRowOn]}
                onPress={() => pickLines(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: n === subtitleLines }}>
                <Text style={[styles.speedRowText, n === subtitleLines && styles.speedRowTextOn]}>{t('lecture.lines', { n })}</Text>
                {n === subtitleLines && <Icon name="check" size={14} color={ON_GOLD} />}
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Modal visible={sheet} transparent animationType="slide" onRequestClose={() => setSheet(false)}
        supportedOrientations={[...ALL_ORIENTATIONS]}>
        <Pressable style={styles.sheetScrim} onPress={() => setSheet(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetGrip} />
          <Text style={styles.sheetTitle}>{t('lecture.contents')}</Text>
          <ScrollView ref={scroll} contentContainerStyle={styles.sheetList}>
            {series.chapters.map(c => (
              <Pressable
                key={c.no}
                testID={`lecture-chapter-${c.no}`}
                style={[styles.row, c.no === chapter.no && styles.rowNow]}
                onPress={() => { sfx.select(); goChapter(c.no); }}>
                <Text style={styles.rowNo}>{String(c.no).padStart(2, '0')}</Text>
                <Text style={styles.rowTitle} numberOfLines={2}>{c.title}</Text>
                {done.includes(c.no) && <Icon name="check" size={16} color={colors.gold} />}
              </Pressable>
            ))}
            <Text style={styles.notice}>{t('lecture.notice')}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05041A' },
  cover: { backgroundColor: '#05041A' },
  loading: { position: 'absolute', top: '40%', alignSelf: 'center' },
  turn: { position: 'absolute', top: 0, left: 0, right: 0, bottom: '38%' },
  safe: { flex: 1, paddingHorizontal: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  ring: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,12,40,0.72)',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  topTitle: { flex: 1, alignItems: 'center' },
  titlePlate: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    maxWidth: '100%',
    paddingLeft: 5, paddingRight: spacing.md, paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
    backgroundColor: 'rgba(14,12,40,0.78)',
  },
  chapterBadge: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  chapterBadgeText: { ...typography.caption, color: ON_GOLD, fontWeight: '800' },
  titleText: { flexShrink: 1 },
  eyebrow: { ...typography.tiny, color: 'rgba(233,196,106,0.85)', letterSpacing: 0.5 },
  title: { ...typography.bodyStrong, color: '#F4EBDD' },
  spacer: { flex: 1 },
  stage: { minHeight: 150, justifyContent: 'flex-end', gap: spacing.md, marginBottom: spacing.lg },
  line: {
    fontSize: 21, lineHeight: 32, fontWeight: '600',
    color: '#F4EBDD', textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.85)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
  questionCard: {
    backgroundColor: 'rgba(14,12,40,0.85)',
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)',
    padding: spacing.lg, gap: spacing.sm,
  },
  questionLabel: { ...typography.caption, color: colors.gold, textAlign: 'center' },
  questionText: { fontSize: 19, lineHeight: 29, fontWeight: '700', color: '#F4EBDD', textAlign: 'center' },
  ticks: { flexDirection: 'row', gap: 3, marginBottom: spacing.lg },
  tick: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)' },
  tickDone: { backgroundColor: 'rgba(233,196,106,0.55)' },
  tickNow: { backgroundColor: colors.gold },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  speed: {
    width: 56, paddingVertical: 6, alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)',
    backgroundColor: 'rgba(14,12,40,0.72)',
  },
  speedText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  linesMenu: { left: undefined, right: spacing.lg },
  // Earlier sentences kept on screen above the current one, dimmed.
  linePast: { opacity: 0.45 },
  subtitleBody: { gap: 6, justifyContent: 'flex-end', flexGrow: 1 },
  // The list opens just above the speed button, bottom-left.
  speedMenu: {
    position: 'absolute', left: spacing.lg, bottom: 150,
    width: 132, paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)',
    backgroundColor: 'rgba(14,12,40,0.96)',
  },
  speedMenuTitle: { ...typography.tiny, color: colors.textMuted, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  speedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: spacing.xs, paddingVertical: 9, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  speedRowOn: { backgroundColor: colors.gold },
  speedRowText: { ...typography.body, color: '#F4EBDD' },
  speedRowTextOn: { color: ON_GOLD, fontWeight: '700' },
  ctl: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.gold,
  },
  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  nextGrow: { flex: 1 },
  autoplay: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
    backgroundColor: 'rgba(14,12,40,0.72)',
  },
  autoplayOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  autoplayText: { ...typography.caption, color: colors.textMuted },
  autoplayDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.textMuted },
  autoplayDotOn: { borderColor: ON_GOLD, backgroundColor: ON_GOLD },
  autoplayTextOn: { color: ON_GOLD, fontWeight: '700' },
  nextChapter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    flex: 1,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)',
    backgroundColor: 'rgba(14,12,40,0.72)',
  },
  // Once the chapter has played out, the way on is the gold button.
  nextChapterLead: { backgroundColor: colors.gold, borderColor: colors.gold },
  nextChapterText: { ...typography.caption, color: '#F4EBDD', flexShrink: 1 },
  nextChapterTextLead: { color: ON_GOLD, fontWeight: '700' },
  finished: { ...typography.body, color: colors.gold, textAlign: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
  pressed: { opacity: 0.8 },

  sheetScrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    maxHeight: '72%',
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
  },
  sheetGrip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
  sheetTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sheetList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  rowNow: { backgroundColor: 'rgba(233,196,106,0.12)' },
  rowNo: { ...typography.bodyStrong, color: colors.gold, width: 26 },
  rowTitle: { ...typography.body, color: colors.textPrimary, flex: 1 },
  notice: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 16 },
});
