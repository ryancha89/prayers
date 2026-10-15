import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { journeyRecord, useJourneyPlayer } from '../player/journeyPlayer';

/**
 * The ride's record (10-08, "이전에 이미 지나간것도 다시 볼수있어야해 기록으로 다시 볼 수 있고"): every
 * station passed so far, with all it said, to read back. A station's title travels there again
 * (`onStation`); without it (the result screen) the record is read only.
 */
export const JourneyRecordSheet: React.FC<{
  visible: boolean;
  onClose(): void;
  guideName?: string;
  onStation?: (chapterIndex: number) => void;
}> = ({ visible, onClose, guideName, onStation }) => {
  const t = useT();
  const insets = useSafeAreaInsets();
  const journeyId = useJourneyPlayer(s => s.journeyId);
  const content = useJourneyPlayer(s => s.content);
  const heard = useJourneyPlayer(s => s.heard);
  const status = useJourneyPlayer(s => s.status);
  const current = useJourneyPlayer(s => s.chapterIndex);
  const record = useMemo(() => journeyRecord({ journeyId, content, heard, status }), [journeyId, content, heard, status]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('journey.record.close')} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.grip} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('journey.record.title')}</Text>
          <Pressable hitSlop={12} onPress={() => { sfx.back(); onClose(); }} accessibilityRole="button">
            <Text style={styles.close}>{t('journey.record.close')}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>
          {record.length === 0 && <Text style={styles.empty}>{t('journey.record.empty')}</Text>}
          {record.map(station => (
            <View key={station.id} style={styles.station}>
              <Pressable
                disabled={!onStation}
                onPress={() => { sfx.tap(); onStation?.(station.chapterIndex); onClose(); }}
                style={styles.stationHead}
                accessibilityRole={onStation ? 'button' : 'header'}>
                <Text style={[styles.stationTitle, station.chapterIndex === current && status !== 'done' && styles.stationNow]}>
                  {t(station.title as 'journey.continue')}
                </Text>
                {onStation ? (
                  <View style={styles.againRow}>
                    <Text style={styles.again}>{t('journey.record.again')}</Text>
                    <Icon name="arrowRight" size={12} color={colors.textSecondary} />
                  </View>
                ) : null}
              </Pressable>
              {station.parts.map(part => (
                <View key={part.key} style={styles.part}>
                  {part.label ? <Text style={styles.label}>{part.label}</Text> : null}
                  {part.cards.map((c, i) => (
                    <View key={i} style={styles.card}>
                      <Text style={styles.cardTitle}>{c.title}</Text>
                      {c.description ? <Text style={styles.cardText}>{c.description}</Text> : null}
                    </View>
                  ))}
                  <Text style={styles.text}>{part.text}</Text>
                </View>
              ))}
            </View>
          ))}
          {guideName && record.length > 0 ? <Text style={styles.sign}>— {guideName}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    maxHeight: '82%', backgroundColor: 'rgba(18,14,40,0.98)', borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: 'rgba(233,196,106,0.4)',
  },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', marginTop: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  title: { ...typography.h3, color: colors.textPrimary },
  close: { ...typography.bodyStrong, color: colors.gold },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.lg },
  empty: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.lg },
  station: { gap: spacing.sm },
  stationHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stationTitle: { ...typography.bodyStrong, color: colors.gold, letterSpacing: 1 },
  stationNow: { textDecorationLine: 'underline' },
  againRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  again: { ...typography.caption, color: colors.textSecondary },
  part: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.gold, opacity: 0.8 },
  card: { borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)', borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  cardTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  cardText: { ...typography.caption, color: colors.textSecondary },
  text: { ...typography.body, color: colors.textPrimary, lineHeight: 24 },
  sign: { ...typography.caption, color: colors.textSecondary, textAlign: 'right' },
});
