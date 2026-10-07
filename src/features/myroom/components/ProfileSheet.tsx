import React from 'react';
import { StyleSheet, View, type LayoutRectangle } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import type { TranslationKey } from '../../../shared/i18n';
import { WorldSheet } from '../../world/components/WorldSheets';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { useDiaryStore } from '../diary/diaryStore';
import { useSavedJourneys } from '../../journey/store/savedJourneysStore';
import { ACTIVITY_ORDER, activityFrom, levelOf, titleBand, xpOf, type Activity, type LevelInfo } from '../level';
import { CompassStar } from '../../../shared/components/Ornaments';
import { useAuthStore } from '../../auth/store/authStore';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';

/**
 * Who the badge names, in My Room and the World alike: the account's name, else the one the player
 * gave themselves in the profile form. The plate shows the level and title; the name is in the sheet.
 */
export function usePlayerName(): string {
  const t = useT();
  const accountName = useAuthStore(s => s.displayName);
  const selfName = useSubjectsStore(s => s.self.displayName);
  return accountName || selfName || t('account.noName');
}

/**
 * The player's level, counted live from the stores (myroom/level.ts says what counts and why).
 * `checkIns` is the server's lifetime count (GET attendance `days_total`); null until it answers.
 */
export function useMyRoomLevel(checkIns: number | null): { activity: Activity; xp: ReturnType<typeof xpOf>; info: LevelInfo } {
  const order = useConversationsStore(s => s.order);
  const byId = useConversationsStore(s => s.byId);
  const memories = useArchiveStore(s => s.memories);
  const reflections = useDiaryStore(s => s.reflections);
  const heard = useSavedJourneys(s => s.heard);
  const journeys = useSavedJourneys(s => s.journeys);
  return React.useMemo(() => {
    const activity = activityFrom({
      checkIns,
      conversations: order.map(id => byId[id]).filter(Boolean),
      memories,
      reflections,
      heard,
      journeysFinished: journeys.length,
    });
    const xp = xpOf(activity);
    return { activity, xp, info: levelOf(xp.total) };
  }, [checkIns, order, byId, memories, reflections, heard, journeys]);
}

const SOURCE_KEY: Record<keyof Activity, TranslationKey> = {
  checkIns: 'myroom.xp.checkIns',
  counselors: 'myroom.xp.counselors',
  questions: 'myroom.xp.questions',
  diaryEntries: 'myroom.xp.diaryEntries',
  reflections: 'myroom.xp.reflections',
  memories: 'myroom.xp.memories',
  stations: 'myroom.xp.stations',
  journeys: 'myroom.xp.journeys',
};

/** Tapping the badge: who you are, your level and title, how far to the next, and where it came from. */
export const ProfileSheet: React.FC<{
  name: string;
  activity: Activity;
  xp: ReturnType<typeof xpOf>;
  info: LevelInfo;
  onClose(): void;
  /** For VIEW_INSETS (the World reports the sheet it opens; My Room does not). */
  onRect?: (rect: LayoutRectangle | null) => void;
}> = ({ name, activity, xp, info, onClose, onRect }) => {
  const t = useT();
  const sources = ACTIVITY_ORDER.filter(k => activity[k] > 0);
  const nextTitle = info.nextTitleAt != null ? titleBand(info.nextTitleAt).key : null;
  return (
    <WorldSheet title={t('myroom.profile.title')} onClose={onClose} onRect={onRect} testID="myroom-sheet-profile">
      <View style={styles.head}>
        <View style={styles.emblem}><CompassStar size={40} /></View>
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.title} testID="myroom-profile-title">{`Lv. ${info.level} · ${t(info.title)}`}</Text>
        </View>
      </View>

      <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(info.progress * 100) }}>
        <View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
      </View>
      <Text style={styles.small} testID="myroom-profile-next">
        {info.levelSpan === 0
          ? t('myroom.profile.max')
          : `${info.intoLevel} / ${info.levelSpan} XP · ${t('myroom.profile.toNext', { count: info.levelSpan - info.intoLevel })}`}
      </Text>
      {nextTitle && (
        <Text style={styles.small}>{t('myroom.profile.nextTitle', { level: info.nextTitleAt!, title: t(nextTitle) })}</Text>
      )}

      <Text style={styles.section}>{t('myroom.profile.sources')}</Text>
      {sources.length === 0 ? (
        <Text style={styles.small}>{t('myroom.profile.empty')}</Text>
      ) : (
        sources.map(k => (
          <View key={k} style={styles.row} testID={`myroom-xp-${k}`}>
            <Text style={styles.rowText}>{t(SOURCE_KEY[k], { count: activity[k] })}</Text>
            <Text style={styles.rowXp}>{`+${xp.by[k]} XP`}</Text>
          </View>
        ))
      )}
      <Text style={styles.foot}>{t('myroom.profile.how')}</Text>
    </WorldSheet>
  );
};

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  emblem: {
    width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(14,12,40,0.88)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.75)',
  },
  headText: { flex: 1, gap: 2 },
  name: { ...typography.h3, color: colors.textPrimary },
  title: { ...typography.bodyStrong, color: colors.gold },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginBottom: spacing.xs },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.gold },
  small: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  section: { ...typography.bodyStrong, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.xs },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  rowText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  rowXp: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  foot: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.md },
});
