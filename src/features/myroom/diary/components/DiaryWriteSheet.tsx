import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
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
import { CounselorPicker } from './CounselorPicker';
import { PhotoRow } from './PhotoRow';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/** Whether Save may be pressed (spec 006 US1 2): text, and for a Diary a mood. Exported for tests. */
export const canSave = (kind: DiaryKind, text: string, mood?: string): boolean =>
  text.trim().length > 0 && (kind !== 'diary' || !!mood);

/**
 * Write (spec 006 US1, the 07-10 "Write Diary" mockup): kind tabs, the date, "How was your day?"
 * for a Diary, who reads it, the text with a code-point counter, Add Photo, and a gold Save.
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
  // Preselected once: the most recent conversation's counsellor, else Yuna (Q2).
  const [counselor, setCounselor] = useState(() => editing?.details.counselor ||
    defaultDiaryTone(order.map(id => byId[id]?.counselorId).filter((x): x is string => !!x), lang));
  const [text, setText] = useState(editing?.content ?? '');
  const [aiEnabled, setAiEnabled] = useState(editing?.aiEnabled ?? true);
  const [added, setAdded] = useState<PickedPhoto[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);
  const [photoNote, setPhotoNote] = useState<'denied' | 'unavailable' | 'failed' | null>(null);
  const [saving, setSaving] = useState(false);

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

  const dirty = text.trim() !== (editing?.content ?? '').trim() || added.length > 0 || removed.length > 0;
  const close = () => {
    if (!dirty || saving) { onClose(); return; }
    Alert.alert(t('diary.write.discard'), undefined, [
      { text: t('archive.cancel'), style: 'cancel' },
      { text: t('diary.close'), style: 'destructive', onPress: onClose },
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

  return (
    <View style={s.root} testID="diary-write">
      <KeyboardAvoidingView style={s.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetHead title={title} onClose={close} closeTestID="diary-write-close" />
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <KindTabs value={kind} onChange={k => k !== 'all' && setKind(k)} locked={!!editing} testID="diary-kind" />

          <View style={styles.dateRow}>
            <Pressable hitSlop={10} onPress={() => setDate(d => shiftDay(d, -1))} accessibilityRole="button"
              accessibilityLabel={t('diary.write.prevDay')} testID="diary-date-prev">
              <Icon name="back" size={18} color={colors.gold} />
            </Pressable>
            <Text style={styles.date} testID="diary-date">{formatDay(date, lang)}</Text>
            {/* No future dates (FR-002): the arrow stops at today. */}
            <Pressable hitSlop={10} disabled={date >= today} onPress={() => setDate(d => shiftDay(d, 1))}
              accessibilityRole="button" accessibilityLabel={t('diary.write.nextDay')} testID="diary-date-next"
              style={date >= today && s.disabled}>
              <Icon name="arrowRight" size={18} color={colors.gold} />
            </Pressable>
          </View>

          {kind === 'diary' && (
            <View>
              <Text style={s.label}>{t('diary.write.mood')}</Text>
              <MoodRow value={mood} onChange={setMood} />
            </View>
          )}

          <View>
            <Text style={s.label}>{t('diary.write.counselor')}</Text>
            <CounselorPicker value={counselor} onChange={setCounselor} />
          </View>

          <View style={s.panel}>
            <TextInput
              testID="diary-text"
              style={[styles.input, { minHeight: screen.vh(0.26, 140, 260) }]}
              value={text}
              onChangeText={v => setText(clampCodePoints(v, DIARY_MAX))}
              placeholder={t(`diary.write.placeholder.${kind}` as TranslationKey)}
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
            <Text style={[styles.counter, count >= DIARY_MAX && styles.counterFull]} testID="diary-counter">
              {count}/{DIARY_MAX}
            </Text>
          </View>

          <PhotoRow photos={shown} onAdd={addPhotos} onRemove={removePhoto} note={photoNote} />

          <View style={styles.aiRow}>
            <Text style={[s.muted, styles.flex]}>{t('diary.write.ai')}</Text>
            <Switch value={aiEnabled} onValueChange={setAiEnabled} trackColor={{ true: colors.gold }} testID="diary-ai" />
          </View>

          <Pressable
            testID="diary-save"
            disabled={!ok}
            onPress={save}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ok }}
            style={({ pressed }) => [s.gold, !ok && s.disabled, pressed && s.pressed]}>
            <Text style={s.goldText}>{t('diary.write.save')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  date: { ...typography.h3, color: colors.textPrimary },
  input: { ...typography.body, color: colors.textPrimary, lineHeight: 22, padding: 0 },
  counter: { ...typography.tiny, color: colors.textMuted, textAlign: 'right', marginTop: spacing.xs },
  counterFull: { color: colors.gold },
  flex: { flex: 1 },
  aiRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
});
