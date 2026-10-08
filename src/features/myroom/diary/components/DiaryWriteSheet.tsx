import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View, type TextInput as RNTextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, spacing, typography } from '../../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { useScreen, column } from '../../../../shared/device/screen';
import { isDiaryKind, type ArchiveMemory, type DiaryKind } from '../../../archive/types';
import { useConversationsStore } from '../../../conversations/store/conversationsStore';
import { useDiaryStore } from '../diaryStore';
import { saveDiaryEntry } from '../diaryActions';
import { MAX_PHOTOS, discardPending, pickPhotos, sweepPending, type PickedPhoto } from '../photos';
import { codePoints, clampCodePoints, DIARY_MAX, formatDay, localDay, shiftDay } from '../text';
import { defaultDiaryTone } from '../counselors';
import { KindTabs } from './KindTabs';
import { MoodRow } from './MoodRow';
import { PhotoRow } from './PhotoRow';
import { PhotoViewer } from './PhotoViewer';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/** Whether Save may be pressed (spec 006 US1 2): text, and for a Diary a mood. Exported for tests. */
export const canSave = (kind: DiaryKind, text: string, mood?: string): boolean =>
  text.trim().length > 0 && (kind !== 'diary' || !!mood);

/**
 * Write (spec 006 US1, the 07-10 "Write Diary" mockup): kind tabs, the date, "How was your day?"
 * for a Diary, the text with a code-point counter, Add Photo, the reflection switch, and Save.
 *
 * Save lives in the header (08-10): My Room is landscape, 402pt tall, and a Save at the foot of the
 * form sat ~230pt below the fold with the keyboard over it. In landscape the form splits in two —
 * the choices on the left, the page filling the right — and a Done bar over the keyboard closes it
 * (Return is a new line in a multiline field).
 *
 * The counter counts code points and the input is clamped by hand rather than by `maxLength` — the
 * server's count (R16). Save writes on the phone and pushes in the background: it never waits on
 * the network, so offline Save still saves.
 */
export const DiaryWriteSheet: React.FC<{
  /** Edit this entry instead of writing a new one. */
  editing?: ArchiveMemory;
  initialKind?: DiaryKind;
  onClose(): void;
  onSaved(memory: ArchiveMemory, pushed: boolean): void;
}> = ({ editing, initialKind, onClose, onSaved }) => {
  const t = useT();
  const lang = useLang();
  const screen = useScreen();
  const safe = useSafeAreaInsets();
  const order = useConversationsStore(st => st.order);
  const byId = useConversationsStore(st => st.byId);
  const stored = useDiaryStore(st => (editing ? st.photos[editing.id] : undefined));

  const [kind, setKind] = useState<DiaryKind>(
    editing && isDiaryKind(editing.category) ? editing.category : initialKind ?? 'diary',
  );
  const today = localDay();
  const [date, setDate] = useState(editing?.details.date || today);
  const [mood, setMood] = useState<string | undefined>(editing?.details.mood);
  // Who reads it is not asked (08-10, Jeongmin: "diary is for the user"): the entry keeps its own, and a
  // new one gets the counsellor of the latest conversation, else Yuna — the voice of the reflection
  // and of Talk to Counselor.
  const [counselor] = useState(() => editing?.details.counselor ||
    defaultDiaryTone(order.map(id => byId[id]?.counselorId).filter((x): x is string => !!x), lang));
  const [text, setText] = useState(editing?.content ?? '');
  const [aiEnabled, setAiEnabled] = useState(editing?.aiEnabled ?? true);
  const [added, setAdded] = useState<PickedPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [photoNote, setPhotoNote] = useState<'denied' | 'unavailable' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  // Picks live in Documents/diary/_pending until Save moves them (photos.ts says why). Whatever is
  // still pending when the sheet goes without a save is deleted; leftovers of a sheet the app died
  // under are swept when the next one opens.
  const pending = useRef<PickedPhoto[]>([]);
  pending.current = added;
  const saved = useRef(false);
  useEffect(() => {
    sweepPending();
    return () => { if (!saved.current) discardPending(pending.current); };
  }, []);

  const shown = useMemo(
    () => [
      ...(stored ?? []).filter(p => !removed.includes(p.id)).map(p => ({ id: p.id, localUri: p.localUri, url: p.url })),
      ...added.map(p => ({ id: p.id, localUri: p.uri })),
    ],
    [stored, removed, added],
  );

  // Any change the player made, not only the text: a new mood, date or switch closes silently otherwise.
  const dirty = text.trim() !== (editing?.content ?? '').trim() || added.length > 0 || removed.length > 0
    || mood !== editing?.details.mood || date !== (editing?.details.date || today)
    || aiEnabled !== (editing?.aiEnabled ?? true) || (!editing && kind !== (initialKind ?? 'diary'));
  const close = () => {
    if (!dirty || saving) { onClose(); return; }
    Alert.alert(t('diary.write.discard'), undefined, [
      { text: t('diary.write.keep'), style: 'cancel' },
      { text: t('diary.write.discardBtn'), style: 'destructive', onPress: onClose },
    ]);
  };

  const addPhotos = async () => {
    sfx.tap();
    const r = await pickPhotos(MAX_PHOTOS - shown.length);
    if (r.status === 'ok') {
      setPhotoNote(r.failed > 0 ? 'failed' : null);
      // The latest list, not this render's: the picker was open across renders.
      const next = [...pending.current, ...r.photos];
      setAdded(next.slice(0, MAX_PHOTOS));
      discardPending(next.slice(MAX_PHOTOS));
    } else if (r.status === 'denied' || r.status === 'unavailable') setPhotoNote(r.status);
    else if (r.status === 'error') setPhotoNote('failed');
  };
  const removePhoto = (id: string) => {
    sfx.tap();
    const mine = added.find(p => p.id === id);
    if (mine) { setAdded(a => a.filter(p => p.id !== id)); discardPending([mine]); }
    else setRemoved(r => [...r, id]);
  };

  const ok = canSave(kind, text, mood) && !saving;
  const save = async () => {
    if (!ok) return;
    sfx.select();
    setSaving(true);
    // From here the picks belong to the entry: an unmount mid-save must not delete them.
    saved.current = true;
    const { memory, pushed } = await saveDiaryEntry(
      { kind, date, mood: kind === 'diary' ? mood : undefined, counselor, content: text, aiEnabled, added, removed },
      editing?.id,
    );
    setSaving(false);
    onSaved(memory, pushed);
  };

  const count = codePoints(text);
  const title = editing ? t('diary.write.edit') : t(`diary.write.title.${kind}` as TranslationKey);

  const input = useRef<RNTextInput>(null);
  const landscape = screen.landscape;

  const saveButton = (
    <Pressable
      testID="diary-save"
      disabled={!ok}
      onPress={() => { Keyboard.dismiss(); save(); }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('diary.write.save')}
      accessibilityState={{ disabled: !ok }}
      style={({ pressed }) => [styles.savePill, !ok && s.disabled, pressed && s.pressed]}>
      <Text style={styles.saveText} numberOfLines={1}>{t('diary.write.save')}</Text>
    </Pressable>
  );

  const choices = (
    <>
      <KindTabs value={kind} onChange={k => k !== 'all' && setKind(k)} locked={!!editing} testID="diary-kind" />

      <View style={styles.dateRow}>
        <Pressable onPress={() => setDate(d => shiftDay(d, -1))} accessibilityRole="button" style={styles.arrow}
          accessibilityLabel={t('diary.write.prevDay')} testID="diary-date-prev">
          <Icon name="back" size={18} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.date} testID="diary-date">{formatDay(date, lang)}</Text>
        {/* No future dates (FR-002): the arrow stops at today. */}
        <Pressable disabled={date >= today} onPress={() => setDate(d => shiftDay(d, 1))}
          accessibilityRole="button" accessibilityLabel={t('diary.write.nextDay')} testID="diary-date-next"
          style={[styles.arrow, date >= today && s.disabled]}>
          <View style={styles.mirror}><Icon name="back" size={18} color={colors.textPrimary} /></View>
        </Pressable>
      </View>

      {kind === 'diary' && (
        <View>
          <Text style={s.label}>{t('diary.write.mood')}</Text>
          <MoodRow value={mood} onChange={setMood} />
        </View>
      )}
    </>
  );

  const page = (fill: boolean) => (
    <View style={[s.panel, fill && styles.fill]}>
      <TextInput
        ref={input}
        testID="diary-text"
        style={[styles.input, fill ? styles.fill : { minHeight: screen.vh(0.26, 140, 260) }]}
        value={text}
        onChangeText={v => setText(clampCodePoints(v, DIARY_MAX))}
        placeholder={t(`diary.write.placeholder.${kind}` as TranslationKey)}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={title}
        inputAccessoryViewID={Platform.OS === 'ios' ? KEYBOARD_BAR : undefined}
        multiline
        textAlignVertical="top"
      />
      <Text style={[styles.counter, count >= DIARY_MAX && styles.counterFull]} testID="diary-counter">
        {count}/{DIARY_MAX}
      </Text>
    </View>
  );

  const extras = (
    <>
      <PhotoRow photos={shown} onAdd={addPhotos} onRemove={removePhoto} onOpen={setViewing} note={photoNote} />
      <View style={styles.aiRow}>
        <Text style={[styles.aiText, styles.flex]}>{t('diary.write.ai')}</Text>
        <Switch value={aiEnabled} onValueChange={setAiEnabled} trackColor={{ true: colors.gold }} testID="diary-ai"
          accessibilityLabel={t('diary.write.ai')} />
      </View>
    </>
  );

  return (
    <View style={s.root} testID="diary-write">
      <KeyboardAvoidingView style={s.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetHead title={title} onClose={close} closeTestID="diary-write-close" right={saveButton} />
        {landscape ? (
          // Landscape: the choices scroll on the left, the page fills the right to the bottom.
          <View style={[styles.split, { paddingLeft: safe.left + spacing.lg, paddingRight: safe.right + spacing.lg, paddingBottom: safe.bottom + spacing.md }]}>
            <ScrollView style={styles.left} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive"
              contentContainerStyle={styles.leftScroll}>
              {choices}
              {extras}
            </ScrollView>
            <View style={styles.right}>{page(true)}</View>
          </View>
        ) : (
          <ScrollView
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
            {choices}
            {page(false)}
            {extras}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
      {viewing != null && shown.length > 0 && (
        <PhotoViewer photos={shown} start={Math.min(viewing, shown.length - 1)} onClose={() => setViewing(null)} />
      )}
      {Platform.OS === 'ios' && (
        // Over the keyboard: Done closes it (Return is a new line), Save saves from where the player is.
        <InputAccessoryView nativeID={KEYBOARD_BAR}>
          <View style={styles.keyBar}>
            <Pressable testID="diary-keyboard-done" onPress={() => input.current?.blur()} accessibilityRole="button" style={styles.keyBtn}>
              <Text style={styles.keyDone}>{t('diary.write.done')}</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </View>
  );
};

/** The keyboard's accessory bar on the page field. */
const KEYBOARD_BAR = 'diary-write-keyboard';

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mirror: { transform: [{ scaleX: -1 }] },
  savePill: {
    minHeight: 36, minWidth: 72, paddingHorizontal: spacing.lg, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold,
  },
  saveText: { ...typography.bodyStrong, color: '#2A2140' },
  split: { flex: 1, flexDirection: 'row', gap: spacing.lg, paddingTop: spacing.md },
  left: { width: 320, flexGrow: 0 },
  leftScroll: { gap: spacing.md, paddingBottom: spacing.md },
  right: { flex: 1 },
  fill: { flex: 1 },
  aiText: { ...typography.caption, color: colors.textSecondary },
  keyBar: { flexDirection: 'row', justifyContent: 'flex-end', backgroundColor: '#1E1A3A', borderTopWidth: 1, borderTopColor: 'rgba(233,196,106,0.35)' },
  keyBtn: { minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  keyDone: { ...typography.bodyStrong, color: colors.gold },
  date: { ...typography.h3, color: colors.textPrimary },
  input: { ...typography.body, color: colors.textPrimary, lineHeight: 22, padding: 0 },
  counter: { ...typography.tiny, color: colors.textMuted, textAlign: 'right', marginTop: spacing.xs },
  counterFull: { color: colors.gold },
  flex: { flex: 1 },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
