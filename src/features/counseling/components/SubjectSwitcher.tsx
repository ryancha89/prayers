import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { HAIRLINE, IVORY, PLATE } from '../../../shared/components/hud/Hud';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { getUnityBridge } from '../bridge';
import { roomSubjects } from '../bridge/subjectPayload';
import type { CounselingSubject } from '../types';
import { ALL_ORIENTATIONS } from '../../coins/components/CoinShopSheet';

/**
 * Whose chart the room is reading, switchable without leaving it (10-13, "대화하는 사람 바꿀수있게").
 *
 * The account holder is the ground: anyone else goes to the room WITH the holder (SUBJECT_SWITCH
 * {subject, holder}), so the counsellor hears "the client is asking about their acquaintance" rather
 * than taking the other person for the client. The player's avatar and the room do not change —
 * only whose chart the next turn is about.
 */
export const SubjectSwitcher: React.FC<{ initialId: string }> = ({ initialId }) => {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const self = useSubjectsStore(s => s.self);
  const saved = useSubjectsStore(s => s.subjects);
  const [currentId, setCurrentId] = useState(initialId);
  const [open, setOpen] = useState(false);
  const safe = useSafeAreaInsets();

  const people = [self, ...saved];
  const current = people.find(p => p.id === currentId) ?? self;
  const label = (p: CounselingSubject) => (p.id === 'self' ? t('room.subject.me') : p.displayName);

  const choose = (p: CounselingSubject) => {
    setOpen(false);
    if (p.id === currentId) return;
    sfx.select();
    setCurrentId(p.id);
    getUnityBridge().sendEvent({ type: 'SUBJECT_SWITCH', payload: roomSubjects(p, self) });
  };

  return (
    <>
      <Pressable
        testID="room-subject"
        onPress={() => { sfx.tap(); setOpen(true); }}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('room.subject.title')}>
        <Icon name="person" size={14} color={colors.gold} />
        <Text style={styles.pillText} numberOfLines={1}>
          {current.id === 'self' ? t('room.subject.me') : t('room.subject.about', { name: current.displayName })}
        </Text>
        <Icon name="back" size={12} color={colors.gold} style={styles.chevron} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}
        supportedOrientations={[...ALL_ORIENTATIONS]}>
        <Pressable style={[styles.scrim, { paddingLeft: safe.left + spacing.xl, paddingRight: safe.right + spacing.xl,
          paddingTop: safe.top + spacing.md, paddingBottom: safe.bottom + spacing.md }]} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.title}>{t('room.subject.title')}</Text>
            <Text style={styles.note}>{t('room.subject.note')}</Text>
            <ScrollView style={styles.list}>
              {people.map(p => {
                const ready = hasBirthData(p);
                const selected = p.id === current.id;
                return (
                  <Pressable
                    key={p.id}
                    disabled={!ready}
                    onPress={() => choose(p)}
                    style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && styles.pressed, !ready && styles.rowDisabled]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: !ready }}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowName}>{label(p)}</Text>
                      <Text style={styles.rowMeta}>
                        {ready
                          ? [p.id === 'self' ? p.displayName : p.relationship || t('room.subject.acquaintance'), p.birthDate]
                              .filter(Boolean)
                              .join(' · ')
                          : t('room.subject.noBirth')}
                      </Text>
                    </View>
                    {selected && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              style={({ pressed }) => [styles.add, pressed && styles.pressed]}
              onPress={() => { sfx.tap(); setOpen(false); navigation.navigate('AddSubject'); }}>
              <Icon name="plus" size={16} color={colors.violetSoft} />
              <Text style={styles.addText}>{t('room.subject.add')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200,
    height: 36, paddingHorizontal: spacing.md, borderRadius: 18,
    backgroundColor: PLATE, borderWidth: 1, borderColor: HAIRLINE,
  },
  pillText: { ...typography.caption, color: IVORY, fontWeight: '700', flexShrink: 1 },
  chevron: { transform: [{ rotate: '-90deg' }] },
  pressed: { opacity: 0.7 },
  // Centred, phone-card width in landscape too — not a bar across the notch (10-17).
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: colors.bgElevated, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)', maxHeight: '100%', width: '100%', maxWidth: 440,
  },
  title: { ...typography.h3, color: colors.textPrimary },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: 4, marginBottom: spacing.md },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.xs, backgroundColor: colors.card,
  },
  rowSelected: { borderWidth: 1, borderColor: colors.gold },
  rowDisabled: { opacity: 0.45 },
  rowBody: { flex: 1 },
  rowName: { ...typography.bodyStrong, color: colors.textPrimary },
  rowMeta: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
  check: { ...typography.bodyStrong, color: colors.gold },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: spacing.md },
  addText: { ...typography.body, color: colors.violetSoft },
});
