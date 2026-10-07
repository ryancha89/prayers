import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, spacing, typography } from '../../../../shared/theme';
import { useLang } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { diaryCounselors } from '../counselors';

/** Who reads the entry (spec 006 Q2): the consultable counsellors' faces; the choice is a tone. */
export const CounselorPicker: React.FC<{ value: string; onChange(tone: string): void }> = ({ value, onChange }) => {
  const lang = useLang();
  const list = diaryCounselors(lang);
  return (
    <View style={styles.row}>
      {list.map(({ tone, counselor }) => {
        const on = tone === value;
        return (
          <Pressable
            key={tone}
            testID={`diary-counselor-${tone}`}
            onPress={() => { sfx.tap(); onChange(tone); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={counselor.name}
            style={styles.cell}>
            <View style={[styles.ring, on && styles.ringOn]}>
              {counselor.avatarImage ? (
                <Image source={counselor.avatarImage} style={styles.face} />
              ) : (
                <View style={[styles.face, { backgroundColor: counselor.accent }]} />
              )}
            </View>
            <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>{counselor.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  cell: { flex: 1, alignItems: 'center', gap: 4 },
  ring: { borderWidth: 2, borderRadius: 30, padding: 2, borderColor: 'transparent' },
  ringOn: { borderColor: colors.gold },
  face: { width: 50, height: 50, borderRadius: 25 },
  name: { ...typography.tiny, color: colors.textSecondary },
  nameOn: { color: colors.gold },
});
