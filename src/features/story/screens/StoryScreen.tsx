import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleSheet, TextInput, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { GradientScrim } from '../../../shared/components/GradientScrim';
import { sfx } from '../../../shared/audio/sfx';
import { useLang, useT } from '../../../shared/i18n';
import { StoryScene } from '../components/StoryScene';
import { cheeseChapter1 } from '../data/cheeseChapter1';
import type { Expression } from '../data/plates';
import {
  advance, answered, historyForServer, initialState, jump, progressChoices, run, said,
  type Shown, type StoryState,
} from '../engine/storyEngine';
import { storyTurn, type TurnError } from '../api/storyApi';
import { useStoryStore } from '../store/storyStore';
import * as voice from '../voice/storyVoice';
import * as speech from '../voice/storySpeech';
import type { Beat, ProgressChoice } from '../types';

const STORY = 'cheese';
const TYPE_MS = 32;
const CAT_ORANGE = '#F0954A';

type Phase =
  | { kind: 'title' }
  | { kind: 'beat'; beat: Beat; queue: Beat[]; then: string | null }
  | { kind: 'free' }
  | { kind: 'waiting'; text: string }
  | { kind: 'end' };

/**
 * The story player: a visual-novel frame over the rendered room, where the cat talks to the
 * player face to face (the camera is the player — references/Animation_Reference_KO.md).
 *
 *  - Fixed beats play one at a time: narration in a quiet card, the cat's lines with his name tag,
 *    typed out while his mouth moves (and spoken, if the voice is on). Tap to continue.
 *  - Free talk opens the input: type (or dictate with the keyboard's mic), or tap one of three
 *    suggestions. The cat answers in character, and what the player MEANT moves the story — let
 *    him stay, ask him to leave (he waits outside the door), invite him back.
 *  - A gold "story" chip appears when the scene allows moving on ("다녀올게").
 *  - The log (지난 대화) and the voice switch sit top right; progress is saved on every step.
 */
export const StoryScreen: React.FC = () => {
  const navigation = useNavigation();
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const script = useMemo(() => cheeseChapter1(lang), [lang]);
  const saved = useStoryStore(s => s.saves[script.id]);
  const saveState = useStoryStore(s => s.save);
  const finishChapter = useStoryStore(s => s.finish);
  const resetChapter = useStoryStore(s => s.reset);
  const voiceOn = useStoryStore(s => s.voice);
  const setVoice = useStoryStore(s => s.setVoice);

  const [state, setState] = useState<StoryState>(() => saved?.state ?? initialState(script));
  const [phase, setPhase] = useState<Phase>({ kind: 'title' });
  /** The exchange shown while the player is typing: their last line and the cat's last reply. */
  const [lastMine, setLastMine] = useState<string | null>(null);
  const [lastCat, setLastCat] = useState<Beat | null>(null);
  const [typed, setTyped] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState<{ kind: TurnError; text: string } | null>(null);
  const [expression, setExpression] = useState<Expression>('idle');
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  /** Speaking instead of typing: the live transcript fills the box; silence (or a second tap) ends
   *  it and the line goes out on its own. */
  const [listening, setListening] = useState(false);
  const listenRef = useRef<speech.Listening | null>(null);
  const heardRef = useRef('');
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkingRef = useRef(false);

  const catLabel = state.catName || t('story.cat');
  const beat = phase.kind === 'beat' ? phase.beat : null;
  const typing = !!beat && typed < beat.text.length;

  // ── stepping through the script ───────────────────────────────────────────────────────────
  const show = useCallback((s: StoryState) => {
    const { state: next, shown } = run(script, s);
    setState(next);
    apply(shown, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [script]);

  const apply = (shown: Shown, next: StoryState) => {
    if (shown.kind === 'beat') {
      setTyped(0);
      setPhase({ kind: 'beat', beat: shown.beat, queue: [], then: null });
      if (shown.beat.role === 'cat') setLastCat(shown.beat);
      if (shown.beat.role !== 'cat') setLastMine(shown.beat.role === 'me' ? shown.beat.text : null);
      // Narration moves the scene on: the exchange before it no longer belongs under the input.
      if (shown.beat.role === 'narr') setLastCat(null);
    } else if (shown.kind === 'free') {
      setPhase({ kind: 'free' });
    } else if (shown.kind === 'end') {
      voice.stop();
      finishChapter(script.id);
      setPhase({ kind: 'end' });
    }
    if (shown.kind !== 'end') saveState(script.id, next);
  };

  const start = (mode: 'begin' | 'prologue' | 'resume') => {
    sfx.select();
    if (mode === 'resume' && saved) {
      const s = saved.state;
      // Resume parks on the free talk (or the beat) it was left at.
      const last = [...s.log].reverse().find(e => e.role === 'cat');
      if (last) setLastCat({ role: 'cat', text: last.text });
      show(s);
      return;
    }
    resetChapter(script.id);
    setLastMine(null);
    setLastCat(null);
    show(initialState(script, mode === 'prologue'));
  };

  // useCallback: `next` depends on it, and a new function every render would rebuild that callback
  // (and the typewriter/voice effects hanging off it) on every keystroke.
  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const next = useCallback(() => {
    if (phase.kind !== 'beat') return;
    if (typing) {
      setTyped(phase.beat.text.length);
      return;
    }
    sfx.tap();
    voice.stop();
    if (phase.queue.length) {
      setTyped(0);
      setLastCat(phase.queue[0]);
      setPhase({ ...phase, beat: phase.queue[0], queue: phase.queue.slice(1) });
      return;
    }
    if (phase.then) {
      // Letting him stay has no scene of its own — say that it landed.
      if (phase.then === 'stayed') flash(t('story.stayed', { name: catLabel }));
      show(jump(state, phase.then));
      return;
    }
    // A beat from the cat's free-talk reply: back to the input. A scripted beat: on through the script.
    if (state.stage && phase.beat.role === 'cat' && script.nodes[state.node]?.[state.index]?.kind === 'free') {
      setPhase({ kind: 'free' });
      return;
    }
    show(advance(state, phase.beat));
  }, [phase, typing, state, show, script, flash, t, catLabel]);

  // ── typewriter + voice + the cat's face ──────────────────────────────────────────────────
  useEffect(() => {
    if (!beat || typed >= beat.text.length) return;
    const id = setTimeout(() => setTyped(n => Math.min(beat.text.length, n + 1)), TYPE_MS);
    return () => clearTimeout(id);
  }, [beat, typed]);

  useEffect(() => {
    if (!beat || beat.role !== 'cat' || !voiceOn) return;
    let live = true;
    talkingRef.current = true;
    voice.speak(beat.text, lang).finally(() => { if (live) talkingRef.current = false; });
    return () => { live = false; talkingRef.current = false; };
  }, [beat, voiceOn, lang]);

  // Mouth: open/close with the voice's loudness, or with the typing when there is no voice.
  // Eyes: a blink every few seconds; a slow blink for the quiet acknowledgement (C08); the smug
  // look (C05) held at the start of a smug line.
  useEffect(() => {
    let blinkUntil = 0;
    let nextBlink = Date.now() + 2500;
    let flap = false;
    const moodHold = beat?.role === 'cat' && beat.mood === 'smug' ? Date.now() + 1400 : 0;
    if (beat?.role === 'cat' && beat.mood === 'quiet') blinkUntil = Date.now() + 650;
    const id = setInterval(() => {
      const now = Date.now();
      const speakingNow = beat?.role === 'cat' && (voice.speaking() ? voice.level() > 0.12 : talkingTyping());
      if (now >= nextBlink && !speakingNow) {
        blinkUntil = now + 140;
        nextBlink = now + 2600 + Math.random() * 3200;
      }
      flap = speakingNow ? !flap : false;
      if (now < blinkUntil) setExpression('blink');
      else if (now < moodHold && !flap) setExpression('smug');
      else setExpression(flap ? 'talk' : 'idle');
    }, 120);
    function talkingTyping() {
      return phaseRef.current.kind === 'beat' && typedRef.current < (phaseRef.current.beat.text.length ?? 0);
    }
    return () => clearInterval(id);
  }, [beat]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const typedRef = useRef(typed);
  typedRef.current = typed;

  // ── free talk ────────────────────────────────────────────────────────────────────────────
  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || !state.stage || phase.kind === 'waiting') return;
    sfx.send();
    Keyboard.dismiss();
    setInput('');
    setError(null);
    setLastMine(text);
    const before = said(state, text);
    setState(before);
    setPhase({ kind: 'waiting', text });
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    const r = await storyTurn({
      story: STORY,
      stage: state.stage,
      message: text,
      history: historyForServer(state),
      catName: state.catName,
      lang,
      signal: ac.signal,
    });
    if (ac.signal.aborted) return;
    if ('error' in r) {
      setState(state); // the line did not land — it goes back into the box
      setInput(text);
      setError({ kind: r.error, text });
      setPhase({ kind: 'free' });
      return;
    }
    const out = answered(script, before, r);
    if (r.name && r.name !== state.catName) flash(t('story.named', { name: r.name }));
    out.beats.forEach(b => voiceOn && voice.warm(b.text, lang));
    setState(out.state);
    saveState(script.id, out.state);
    const [first, ...rest] = out.beats;
    setTyped(0);
    setLastCat(first);
    setPhase({ kind: 'beat', beat: first, queue: rest, then: out.then });
  };

  const toggleMic = async () => {
    if (listening) {
      listenRef.current?.stop();
      return;
    }
    sfx.select();
    voice.stop();
    Keyboard.dismiss();
    setError(null);
    heardRef.current = '';
    setInput('');
    const armSilence = () => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => listenRef.current?.stop(), 1800);
    };
    const l = await speech.listen(
      lang,
      text => {
        heardRef.current = text;
        setInput(text);
        armSilence();
      },
      () => {
        if (silenceRef.current) clearTimeout(silenceRef.current);
        listenRef.current = null;
        setListening(false);
        const heard = heardRef.current.trim();
        if (heard) void send(heard);
      },
    );
    if (!l) {
      flash(t('story.micOff'));
      return;
    }
    listenRef.current = l;
    setListening(true);
    // Nothing said at all: give up after a while rather than listen forever.
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => listenRef.current?.stop(), 6000);
  };

  const choose = (p: ProgressChoice) => {
    sfx.select();
    Keyboard.dismiss();
    setError(null);
    show(jump(state, p.node));
  };


  useEffect(() => () => {
    abort.current?.abort();
    voice.stop();
    listenRef.current?.stop();
    if (silenceRef.current) clearTimeout(silenceRef.current);
  }, []);

  useEffect(() => {
    if (!voiceOn) voice.stop();
  }, [voiceOn]);

  const choices = phase.kind === 'free' ? progressChoices(script, state) : [];
  const suggestions = phase.kind === 'free' ? state.suggestions : [];

  // ── render ───────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StoryScene plate={state.plate ?? (phase.kind === 'title' ? 'sofa' : null)} expression={expression} />
      <GradientScrim height={460} opacity={0.94} />

      {/* tap-to-continue layer over the picture */}
      <Pressable style={StyleSheet.absoluteFill} onPress={next} disabled={phase.kind !== 'beat'}
        accessibilityRole="button" accessibilityLabel={t('story.tapToContinue')} />

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable hitSlop={12} style={styles.roundBtn} onPress={() => { sfx.back(); voice.stop(); navigation.goBack(); }}
          accessibilityRole="button" accessibilityLabel={t('story.exit')}>
          <Icon name="close" size={18} color="#fff" />
        </Pressable>
        <View style={styles.chapterPill}>
          <Text style={styles.chapterText} numberOfLines={1}>
            {t('story.chapter', { n: script.number })} · {script.title}
          </Text>
        </View>
        <Pressable hitSlop={10} style={styles.roundBtn} onPress={() => setLogOpen(true)}
          accessibilityRole="button" accessibilityLabel={t('story.log')}>
          <Icon name="book" size={18} color="#fff" />
        </Pressable>
        <Pressable hitSlop={10} style={styles.roundBtn} onPress={() => setVoice(!voiceOn)}
          accessibilityRole="switch" accessibilityState={{ checked: voiceOn }}
          accessibilityLabel={t(voiceOn ? 'story.voiceOff' : 'story.voiceOn')}>
          <Icon name="speaker" size={18} color={voiceOn ? '#fff' : 'rgba(255,255,255,0.4)'} />
        </Pressable>
      </SafeAreaView>

      {toast && (
        <View style={[styles.toast, { top: insets.top + 56 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottom} pointerEvents="box-none">
        <View style={[styles.dock, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} pointerEvents="box-none">
          {phase.kind === 'beat' && (
            <DialogueCard beat={phase.beat} typed={typed} catLabel={catLabel} mine={phase.beat.role === 'cat' ? lastMine : null}
              onPress={next} more={!typing} />
          )}
          {phase.kind === 'waiting' && (
            <DialogueCard beat={null} typed={0} catLabel={catLabel} mine={phase.text} onPress={() => {}} more={false} />
          )}
          {phase.kind === 'free' && (
            <>
              {lastCat && (
                <DialogueCard beat={lastCat} typed={lastCat.text.length} catLabel={catLabel}
                  mine={lastMine} onPress={() => {}} more={false} dim />
              )}
              {error && (
                <Pressable style={styles.errorRow} onPress={() => send(error.text)}>
                  <Text style={styles.errorText}>
                    {t(error.kind === 'limit' ? 'story.limit' : error.kind === 'offline' ? 'story.offline' : 'story.error')}
                  </Text>
                  {error.kind !== 'limit' && <Text style={styles.errorRetry}>{t('story.retry')}</Text>}
                </Pressable>
              )}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.chips}>
                {choices.map(c => (
                  <Pressable key={c.node} style={({ pressed }) => [styles.chip, styles.progressChip, pressed && styles.pressed]}
                    onPress={() => choose(c)} accessibilityRole="button"
                    accessibilityLabel={`${t('story.moveOn')} · ${c.label}`}>
                    <Icon name="next" size={13} color="#1A1330" />
                    <Text style={styles.progressText}>{c.label}</Text>
                  </Pressable>
                ))}
                {suggestions.map(s => (
                  <Pressable key={s} style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
                    onPress={() => send(s)} accessibilityRole="button">
                    <Text style={styles.chipText}>{s}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={styles.inputRow}>
                <TextInput
                  value={input}
                  onChangeText={setInput}
                  editable={!listening}
                  placeholder={listening ? t('story.listening') : t('story.inputPlaceholder', { name: catLabel })}
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  style={styles.input}
                  maxLength={300}
                  returnKeyType="send"
                  onSubmitEditing={() => send(input)}
                  blurOnSubmit={false}
                />
                {/* Empty box: the mic (say it). Something typed: send. Listening: stop. */}
                {(listening || !input.trim()) && speech.available() ? (
                  <Pressable onPress={toggleMic}
                    style={({ pressed }) => [styles.sendBtn, listening && styles.micOn, pressed && styles.pressed]}
                    accessibilityRole="button" accessibilityLabel={t(listening ? 'story.micStop' : 'story.mic')}>
                    {listening ? <PulseRing /> : null}
                    <Icon name={listening ? 'stop' : 'mic'} size={18} color="#fff" />
                  </Pressable>
                ) : (
                  <Pressable onPress={() => send(input)} disabled={!input.trim()}
                    style={({ pressed }) => [styles.sendBtn, !input.trim() && styles.sendOff, pressed && styles.pressed]}
                    accessibilityRole="button" accessibilityLabel={t('story.send')}>
                    <Icon name="send" size={18} color="#fff" />
                  </Pressable>
                )}
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {phase.kind === 'title' && (
        <TitleCard
          number={script.number}
          title={script.title}
          subtitle={script.subtitle}
          hasPrologue={!!script.prologue}
          canResume={!!saved && saved.state.log.length > 0}
          onStart={start}
          t={t}
        />
      )}
      {phase.kind === 'end' && (
        <EndCard
          number={script.number}
          next={script.next}
          onReplay={() => start('begin')}
          onExit={() => navigation.goBack()}
          t={t}
        />
      )}

      <Modal visible={logOpen} transparent animationType="slide" onRequestClose={() => setLogOpen(false)}>
        <View style={styles.logBackdrop}>
          <View style={[styles.logSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.logHead}>
              <Text style={styles.logTitle}>{t('story.log')}</Text>
              <Pressable hitSlop={12} onPress={() => setLogOpen(false)} accessibilityLabel={t('story.close')}>
                <Icon name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.logBody}>
              {state.log.map((e, i) => (
                <View key={i} style={[styles.logLine, e.role === 'me' && styles.logMine]}>
                  {e.role === 'cat' && <Text style={styles.logWho}>{catLabel}</Text>}
                  <Text style={e.role === 'narr' ? styles.logNarr : e.role === 'action' ? styles.logAction
                    : e.role === 'me' ? styles.logMeText : styles.logCatText}>
                    {e.role === 'action' ? `(${e.text})` : e.text}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ── pieces ──────────────────────────────────────────────────────────────────────────────────

const DialogueCard: React.FC<{
  beat: Beat | null;
  typed: number;
  catLabel: string;
  mine: string | null;
  onPress(): void;
  more: boolean;
  dim?: boolean;
}> = ({ beat, typed, catLabel, mine, onPress, more, dim }) => {
  const t = useT();
  const narr = beat?.role === 'narr';
  const me = beat?.role === 'me';
  return (
    <Pressable onPress={onPress} style={[styles.card, narr && styles.cardNarr, dim && styles.cardDim]}>
      {mine && !me && (
        <View style={styles.mineRow}>
          <Text style={styles.mineText} numberOfLines={2}>{mine}</Text>
        </View>
      )}
      {beat?.role === 'cat' || !beat ? (
        <View style={styles.nameTag}><Text style={styles.nameText}>{catLabel}</Text></View>
      ) : me ? (
        <View style={[styles.nameTag, styles.nameTagMe]}><Text style={styles.nameText}>{t('story.you')}</Text></View>
      ) : null}
      {beat?.action ? <Text style={styles.action}>{beat.action}</Text> : null}
      {beat ? (
        <Text style={narr ? styles.narrText : styles.lineText}>{beat.text.slice(0, typed)}</Text>
      ) : (
        <ThinkingDots />
      )}
      {more && <Text style={styles.more}>▾</Text>}
    </Pressable>
  );
};

/** A ring breathing out of the mic button while it listens. */
const PulseRing: React.FC = () => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <Animated.View pointerEvents="none" style={[styles.pulse, {
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
    }]} />
  );
};

const ThinkingDots: React.FC = () => {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map(i => (
        <Animated.View key={i} style={[styles.dot, {
          opacity: v.interpolate({ inputRange: [0, (i + 0.5) / 4, (i + 1.5) / 4, 1], outputRange: [0.25, 1, 0.25, 0.25] }),
        }]} />
      ))}
    </View>
  );
};

const TitleCard: React.FC<{
  number: number; title: string; subtitle: string; hasPrologue: boolean; canResume: boolean;
  onStart(mode: 'begin' | 'prologue' | 'resume'): void; t: ReturnType<typeof useT>;
}> = ({ number, title, subtitle, hasPrologue, canResume, onStart, t }) => {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [a]);
  return (
    <View style={styles.titleWrap}>
      <Animated.View style={[styles.titleInner, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
        <Text style={styles.series}>{t('story.cheese.title')}</Text>
        <Text style={styles.chapterBig}>{t('story.chapter', { n: number })}</Text>
        <Text style={styles.titleText}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        <View style={styles.titleBtns}>
          {canResume && (
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={() => onStart('resume')}>
              <Icon name="play" size={14} color="#1A1330" />
              <Text style={styles.primaryText}>{t('story.resume')}</Text>
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [canResume ? styles.secondary : styles.primary, pressed && styles.pressed]}
            onPress={() => onStart('begin')}>
            {!canResume && <Icon name="play" size={14} color="#1A1330" />}
            <Text style={canResume ? styles.secondaryText : styles.primaryText}>
              {t(canResume ? 'story.restart' : 'story.begin')}
            </Text>
          </Pressable>
          {hasPrologue && (
            <Pressable style={({ pressed }) => [styles.link, pressed && styles.pressed]} onPress={() => onStart('prologue')}>
              <Text style={styles.linkText}>{t('story.prologue')}</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </View>
  );
};

const EndCard: React.FC<{
  number: number; next: { title: string; note: string }; onReplay(): void; onExit(): void;
  t: ReturnType<typeof useT>;
}> = ({ number, next, onReplay, onExit, t }) => (
  <View style={styles.titleWrap}>
    <View style={styles.titleInner}>
      <Text style={styles.series}>{t('story.cheese.title')}</Text>
      <Text style={styles.chapterBig}>{t('story.end', { n: number })}</Text>
      <View style={styles.nextBox}>
        <Text style={styles.nextLabel}>{t('story.next')}</Text>
        <Text style={styles.nextTitle}>{next.title}</Text>
        <Text style={styles.nextNote}>{next.note}</Text>
        <View style={styles.soon}><Icon name="lock" size={12} color={colors.gold} /><Text style={styles.soonText}>{t('story.locked')}</Text></View>
      </View>
      <View style={styles.titleBtns}>
        <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={onExit}>
          <Text style={styles.primaryText}>{t('story.exit')}</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.link, pressed && styles.pressed]} onPress={onReplay}>
          <Text style={styles.linkText}>{t('story.replay')}</Text>
        </Pressable>
      </View>
    </View>
  </View>
);

const CARD_BG = 'rgba(22,16,12,0.86)';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  topBar: {
    position: 'absolute', left: 0, right: 0, top: 0, flexDirection: 'row', alignItems: 'center',
    gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
  },
  roundBtn: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  chapterPill: {
    flex: 1, height: 32, borderRadius: 16, justifyContent: 'center', paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.30)',
  },
  chapterText: { ...typography.caption, color: 'rgba(255,255,255,0.9)', textAlign: 'center' },
  toast: {
    position: 'absolute', alignSelf: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, backgroundColor: 'rgba(240,149,74,0.92)',
  },
  toastText: { ...typography.caption, color: '#2A1406', fontWeight: '700' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  dock: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  card: {
    backgroundColor: CARD_BG, borderRadius: radius.lg, paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg, paddingBottom: spacing.lg, minHeight: 112,
    borderWidth: 1, borderColor: 'rgba(240,149,74,0.22)',
  },
  cardNarr: { borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(10,10,15,0.80)', justifyContent: 'center' },
  cardDim: { minHeight: 0, paddingTop: spacing.md, paddingBottom: spacing.md },
  mineRow: {
    alignSelf: 'flex-end', maxWidth: '85%', marginBottom: spacing.sm, paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.violetDim,
  },
  mineText: { ...typography.caption, color: colors.violetSoft },
  nameTag: {
    alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: CAT_ORANGE, marginBottom: spacing.sm,
  },
  nameTagMe: { backgroundColor: colors.violet },
  nameText: { ...typography.tiny, color: '#1E0E04', fontWeight: '800' },
  action: { ...typography.caption, color: 'rgba(255,230,205,0.62)', fontStyle: 'italic', marginBottom: 4 },
  lineText: { fontSize: 17, lineHeight: 26, fontWeight: '600', color: '#FFF6EC' },
  narrText: { fontSize: 15.5, lineHeight: 25, color: 'rgba(255,255,255,0.86)', textAlign: 'center' },
  more: { position: 'absolute', right: spacing.lg, bottom: 6, color: 'rgba(255,255,255,0.55)', fontSize: 14 },
  dots: { flexDirection: 'row', gap: 6, paddingVertical: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF6EC' },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 9,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  chipText: { ...typography.caption, color: '#fff' },
  progressChip: { backgroundColor: colors.gold, borderColor: colors.gold },
  progressText: { ...typography.caption, color: '#1A1330', fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  input: {
    flex: 1, minHeight: 46, borderRadius: 23, paddingHorizontal: spacing.lg, color: '#fff', fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: CAT_ORANGE },
  sendOff: { opacity: 0.4 },
  micOn: { backgroundColor: '#D9534F' },
  pulse: { position: 'absolute', width: 46, height: 46, borderRadius: 23, backgroundColor: '#D9534F' },
  errorRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(120,30,30,0.6)',
  },
  errorText: { ...typography.caption, color: '#fff', flex: 1 },
  errorRetry: { ...typography.caption, color: colors.gold, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  titleWrap: {
    ...absoluteFill, backgroundColor: 'rgba(8,6,4,0.72)', justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl, paddingBottom: 72,
  },
  titleInner: { gap: spacing.sm },
  series: { ...typography.caption, color: CAT_ORANGE, fontWeight: '800', letterSpacing: 1 },
  chapterBig: { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  titleText: { ...typography.h2, color: '#fff' },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.75)', marginBottom: spacing.lg },
  titleBtns: { gap: spacing.md, marginTop: spacing.md },
  primary: {
    flexDirection: 'row', gap: spacing.sm, height: 52, borderRadius: 26, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.gold,
  },
  primaryText: { ...typography.bodyStrong, color: '#1A1330' },
  secondary: {
    height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  secondaryText: { ...typography.bodyStrong, color: '#fff' },
  link: { alignItems: 'center', paddingVertical: spacing.sm },
  linkText: { ...typography.caption, color: 'rgba(255,255,255,0.7)', textDecorationLine: 'underline' },
  nextBox: {
    marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg, gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  nextLabel: { ...typography.tiny, color: 'rgba(255,255,255,0.55)' },
  nextTitle: { ...typography.h3, color: '#fff' },
  nextNote: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  soonText: { ...typography.tiny, color: colors.gold },
  logBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  logSheet: {
    maxHeight: '78%', backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
  },
  logHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  logTitle: { ...typography.h3, color: colors.textPrimary },
  logBody: { padding: spacing.lg, gap: spacing.md },
  logLine: { gap: 2 },
  logMine: { alignItems: 'flex-end' },
  logWho: { ...typography.tiny, color: CAT_ORANGE },
  logNarr: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  logAction: { ...typography.caption, color: colors.textMuted, fontStyle: 'italic' },
  logMeText: {
    ...typography.body, color: colors.violetSoft, backgroundColor: colors.violetDim, paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.md, overflow: 'hidden',
  },
  logCatText: { ...typography.body, color: colors.textPrimary },
});
