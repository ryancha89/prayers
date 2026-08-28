import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { Tag } from '../../../shared/components/Tag';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../data/mockCounselors';
import { CounselorHero } from '../components/CounselorHero';
import { CounselorPreviewCarousel } from '../components/CounselorPreviewCarousel';
import { useFavoritesStore } from '../store/favoritesStore';
import { useCounselingStore } from '../../counseling/store/counselingStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'CounselorDetail'>;

/**
 * Emotional interest before the 3D room (spec §9). Implemented fully in RN —
 * Unity is NOT initialized here (spec §9, §45).
 */
export const CounselorDetailScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const lang = useLang();
  const counselor = getLocalizedCounselor(params.counselorId, lang);

  const isFavorite = useFavoritesStore(s => s.ids.includes(params.counselorId));
  const toggleFavorite = useFavoritesStore(s => s.toggle);
  const begin = useCounselingStore(s => s.begin);

  if (!counselor) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.missing}>{t('detail.notFound')}</Text>
      </SafeAreaView>
    );
  }

  const onStart = () => {
    begin(counselor);
    navigation.navigate('CounselingSubject');
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <CounselorHero counselor={counselor} />

        <View style={styles.section}>
          <View style={styles.tagsRow}>
            {counselor.tags.map(tag => (
              <Tag key={tag} label={tag} tone="violet" />
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('detail.preview')}</Text>
          <CounselorPreviewCarousel previews={counselor.previews} accent={counselor.accent} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('detail.about', { name: counselor.name })}</Text>
          <Text style={styles.personality}>{counselor.personality.join('  ·  ')}</Text>
          <Text style={styles.about}>{counselor.about}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('detail.specialties')}</Text>
          <View style={styles.tagsRow}>
            {counselor.specialties.map(s => (
              <Tag key={s} label={s} tone="gold" />
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Floating top controls (spec §10) */}
      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <Pressable style={styles.roundBtn} hitSlop={8} onPress={() => navigation.goBack()}>
          <Icon name="back" size={26} />
        </Pressable>
        <Pressable
          style={styles.roundBtn}
          hitSlop={8}
          onPress={() => toggleFavorite(counselor.id)}>
          <Icon
            name={isFavorite ? 'heartFilled' : 'heart'}
            size={22}
            color={isFavorite ? colors.trending : '#FFFFFF'}
          />
        </Pressable>
      </SafeAreaView>

      {/* Single dominant CTA (spec §13) */}
      <SafeAreaView edges={['bottom']} style={styles.ctaBar}>
        <PrimaryButton label={t('detail.start')} onPress={onStart} />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: 120 },
  missing: { color: colors.textSecondary, padding: spacing.xl },
  section: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, gap: spacing.md },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  personality: { ...typography.bodyStrong, color: colors.violetSoft },
  about: { ...typography.body, color: colors.textSecondary, lineHeight: 23 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,10,15,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.scrim,
  },
});
