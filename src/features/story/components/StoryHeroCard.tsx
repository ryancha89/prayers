import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { GradientScrim } from '../../../shared/components/GradientScrim';
import { useT } from '../../../shared/i18n';
import { CHEESE_CARD } from '../data/plates';
import { useStoryStore } from '../store/storyStore';

const CHAPTERS = 7;
const OPEN = 1;
const CAT_ORANGE = '#F0954A';

/**
 * Home's card for 「수호신 치즈냥이」: the rendered room with Cheese on the sofa, what kind of thing
 * this is (a story you talk your way through), the seven chapters with the open one lit, and one
 * button that says exactly what it will do — start, continue where you left off, or watch again.
 */
export const StoryHeroCard: React.FC<{ onOpen(): void }> = ({ onOpen }) => {
  const t = useT();
  const inProgress = useStoryStore(s => !!s.saves['cheese-1']?.state.log.length);
  const done = useStoryStore(s => !!s.done['cheese-1']);
  const cta = inProgress ? t('story.continue') : done ? t('story.replay') : t('story.start');
  return (
    <Pressable
      testID="home-story-cheese"
      accessibilityRole="button"
      accessibilityLabel={`${t('story.cheese.title')} · ${cta}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.art}>
        <Image source={CHEESE_CARD} style={styles.image} resizeMode="cover" />
        <GradientScrim height={150} color="#120C08" opacity={0.92} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('story.badge')}</Text>
        </View>
        <View style={styles.overArt}>
          <Text style={styles.title}>{t('story.cheese.title')}</Text>
          <Text style={styles.tagline} numberOfLines={2}>{t('story.cheese.tagline')}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.chapters}>
          {Array.from({ length: CHAPTERS }, (_, i) => {
            const open = i < OPEN;
            return (
              <View key={i} style={[styles.chapter, open && styles.chapterOpen, open && done && styles.chapterDone]}>
                {open ? <Text style={styles.chapterNum}>{i + 1}</Text> : <Icon name="lock" size={10} color={colors.textMuted} />}
              </View>
            );
          })}
          <Text style={styles.chapterHint}>{t('story.howTo')}</Text>
        </View>
        <View style={styles.cta}>
          <Icon name="play" size={12} color="#1A1330" />
          <Text style={styles.ctaText}>{cta}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#1B140F', marginBottom: spacing.lg },
  pressed: { opacity: 0.85 },
  art: { height: 210, justifyContent: 'flex-end' },
  image: { ...absoluteFill, width: '100%', height: '100%' },
  badge: {
    position: 'absolute', top: spacing.md, left: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: radius.pill, backgroundColor: CAT_ORANGE,
  },
  badgeText: { ...typography.tiny, color: '#2A1406', fontWeight: '800' },
  overArt: { padding: spacing.lg, gap: 4 },
  title: { ...typography.h1, color: '#fff' },
  tagline: { ...typography.caption, color: 'rgba(255,255,255,0.82)' },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  chapters: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chapter: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chapterOpen: { backgroundColor: CAT_ORANGE },
  chapterDone: { backgroundColor: colors.gold },
  chapterNum: { ...typography.tiny, color: '#2A1406', fontWeight: '800' },
  chapterHint: { ...typography.tiny, color: colors.textSecondary, marginLeft: spacing.sm, flexShrink: 1 },
  cta: {
    flexDirection: 'row', gap: spacing.sm, height: 46, borderRadius: 23, alignItems: 'center',
    justifyContent: 'center', backgroundColor: colors.gold,
  },
  ctaText: { ...typography.bodyStrong, color: '#1A1330' },
});
