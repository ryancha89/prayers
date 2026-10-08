import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import type { DiaryKind } from '../../../archive/types';
import { diaryEntries } from '../book';
import { isFavorite } from '../stats';
import { KindTabs } from './KindTabs';
import { DiaryRow } from './DiaryRow';
import { SheetHead } from './SheetHead';
import { INK, diaryStyles as s } from './diaryTheme';

/** My Diary's top tabs (07-10 mockup). Calendar and Mood open their own screens; All and Favorites
 *  filter the list in place. */
type ListTab = 'all' | 'favorites';

/**
 * My Diary (spec 006 US3): every desk entry, newest first. The mockup's tabs (All / Calendar / Mood /
 * Favorites) sit on top; under them the kind filter (spec US3) and, when search is open, a text
 * filter. The rows are the 아카이브's own — entries written in the tab before the diary existed are
 * here too. A row still waiting to reach the account says "not synced". ⋯ opens My Journey.
 */
export const DiaryListSheet: React.FC<{
  onOpen(id: string): void;
  onWrite(kind?: DiaryKind): void;
  onCalendar(): void;
  onBrowse(): void;
  onJourney(): void;
  onClose(): void;
}> = ({ onOpen, onWrite, onCalendar, onBrowse, onJourney, onClose }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  const memories = useArchiveStore(st => st.memories);
  const [filter, setFilter] = useState<DiaryKind | 'all'>('all');
  const [view, setView] = useState<ListTab>('all');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return diaryEntries(memories).filter(m =>
      (filter === 'all' || m.category === filter) &&
      (view !== 'favorites' || isFavorite(m)) &&
      (!q || m.content.toLocaleLowerCase().includes(q)),
    );
  }, [memories, filter, view, query]);
  // Say why the list is empty: a search miss, no favourites, none of this kind — or truly none yet.
  const emptyKey: TranslationKey = query.trim() ? 'diary.list.noMatch'
    : view === 'favorites' ? 'diary.list.emptyFavorites'
      : filter !== 'all' ? 'diary.list.emptyKind'
        : 'diary.list.empty';

  const tabs: { id: string; label: TranslationKey; on: boolean; press(): void }[] = [
    { id: 'all', label: 'diary.list.all', on: view === 'all', press: () => setView('all') },
    { id: 'calendar', label: 'diary.list.calendar', on: false, press: onCalendar },
    { id: 'mood', label: 'diary.list.mood', on: false, press: onBrowse },
    { id: 'favorites', label: 'diary.list.favorites', on: view === 'favorites', press: () => setView('favorites') },
  ];

  return (
    <View style={s.root} testID="diary-list">
      <View style={s.sheet}>
        <SheetHead
          title={t('diary.list.title')}
          onClose={onClose}
          closeTestID="diary-list-close"
          right={
            <View style={styles.headIcons}>
              <Pressable testID="diary-list-search" hitSlop={10} accessibilityRole="button" accessibilityLabel={t('diary.list.search')}
                onPress={() => { sfx.tap(); setSearching(on => !on); setQuery(''); }}>
                <Icon name="search" size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable testID="diary-list-journey" hitSlop={10} accessibilityRole="button" accessibilityLabel={t('diary.journey.title')}
                onPress={() => { sfx.tap(); onJourney(); }}>
                <Icon name="more" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
          }
        />
        <View style={[styles.tabs, column]}>
          <View style={styles.viewTabs}>
            {tabs.map(tab => (
              <Pressable key={tab.id} testID={`diary-view-${tab.id}`} onPress={() => { sfx.tap(); tab.press(); }}
                // Calendar and Mood open their own screens: buttons, not tabs.
                accessibilityRole={tab.id === 'calendar' || tab.id === 'mood' ? 'button' : 'tab'} accessibilityState={{ selected: tab.on }}
                style={[styles.viewTab, tab.on && styles.viewTabOn]}>
                <Text style={[styles.viewTabText, tab.on && styles.viewTabTextOn]} numberOfLines={1}>{t(tab.label)}</Text>
              </Pressable>
            ))}
          </View>
          {searching && (
            <TextInput
              testID="diary-list-query"
              value={query}
              onChangeText={setQuery}
              autoFocus
              placeholder={t('diary.list.searchPlaceholder')}
              placeholderTextColor={colors.textMuted}
              style={styles.search}
            />
          )}
          <KindTabs value={filter} onChange={setFilter} all testID="diary-filter" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={m => m.id}
          contentContainerStyle={[styles.list, column, { paddingBottom: safe.bottom + 96 }]}
          ListEmptyComponent={<Text style={[s.muted, styles.empty]} testID="diary-list-empty">{t(emptyKey)}</Text>}
          renderItem={({ item: m }) => <DiaryRow memory={m} onOpen={onOpen} />}
        />
        <Pressable testID="diary-list-write" accessibilityRole="button" accessibilityLabel={t('diary.list.write')}
          onPress={() => { sfx.tap(); onWrite(filter === 'all' ? undefined : filter); }}
          style={({ pressed }) => [styles.fab, { bottom: safe.bottom + spacing.lg, right: safe.right + spacing.lg }, pressed && s.pressed]}>
          <Icon name="pen" size={22} color={INK} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  headIcons: { flexDirection: 'row', gap: spacing.md },
  tabs: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm },
  // Text tabs over a hairline (the views), so they never read as a second row of the kind pills under them.
  viewTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' },
  viewTab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  viewTabOn: { borderBottomColor: colors.gold },
  viewTabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  viewTabTextOn: { color: colors.textPrimary },
  search: {
    ...typography.body, color: colors.textPrimary, paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  list: { padding: spacing.lg, gap: spacing.sm },
  empty: { textAlign: 'center', marginTop: spacing.xxl },
  fab: {
    position: 'absolute', width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
});
