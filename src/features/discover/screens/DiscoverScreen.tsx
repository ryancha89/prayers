import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { RootStackParamList } from '../../../navigation/types';
import { localizeCounselors } from '../../counselors/data/mockCounselors';
import { CounselorSummary } from '../../counselors/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const FOCUS_KEYS = [
  'cat.love',
  'cat.career',
  'cat.saju',
  'cat.wealth',
  'cat.tarot',
  'cat.life',
] as const;

/** Counselor / category discovery — not a creator ecosystem (spec §32). */
export const DiscoverScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const open = (id: string) => navigation.navigate('CounselorDetail', { counselorId: id });

  const all = localizeCounselors(lang);
  const trending = all.filter(c => c.isTrending);
  const fresh = all.filter(c => c.isNew);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>{t('discover.title')}</Text>

        <Rail title={t('discover.trending')} items={trending} onPress={open} />
        <Rail title={t('discover.new')} items={fresh} onPress={open} />

        <Text style={styles.sectionTitle}>{t('discover.browse')}</Text>
        <View style={styles.catGrid}>
          {FOCUS_KEYS.map(k => (
            <View key={k} style={styles.catChip}>
              <Text style={styles.catLabel}>{t(k)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Rail: React.FC<{
  title: string;
  items: CounselorSummary[];
  onPress: (id: string) => void;
}> = ({ title, items, onPress }) => {
  if (items.length === 0) return null;
  return (
    <View style={styles.rail}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railRow}>
        {items.map(c => (
          <Pressable key={c.id} onPress={() => onPress(c.id)} style={styles.railCard}>
            <View style={[styles.railArt, { backgroundColor: c.accent }]}>
              <Text style={styles.railInitial}>{c.name.charAt(0)}</Text>
            </View>
            <Text style={styles.railName}>{c.name}</Text>
            <Text style={styles.railTitle} numberOfLines={1}>
              {c.title}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  header: { ...typography.hero, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md },
  rail: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h2, color: colors.textPrimary, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  railRow: { paddingHorizontal: spacing.lg, gap: spacing.md },
  railCard: { width: 140, gap: 4 },
  railArt: {
    width: 140,
    height: 170,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  railInitial: { fontSize: 56, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  railName: { ...typography.h3, color: colors.textPrimary },
  railTitle: { ...typography.caption, color: colors.violetSoft },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingHorizontal: spacing.lg },
  catChip: {
    width: '47%',
    paddingVertical: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
  },
  catLabel: { ...typography.h3, color: colors.textSecondary },
});
