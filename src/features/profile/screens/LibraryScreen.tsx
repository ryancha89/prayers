import React, { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { SubjectCard } from '../../subjects/components/SubjectCard';
import { useFavoritesStore } from '../../counselors/store/favoritesStore';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { CounselorCard } from '../../counselors/components/CounselorCard';
import { openCounselor } from '../../counselors/openCounselor';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The two library rows on My Page, which were labels with no `onPress`.
 *
 * ⚠️ BOTH HAD REAL DATA BEHIND THEM THE WHOLE TIME. The saved people are in `subjectsStore` and the
 * favourites in `favoritesStore`; My Page even counted them in the stat row at the top, so the app
 * was showing a number and refusing to show the thing it counted. That is worse than an absent
 * feature: a row that looks tappable and is not reads as a broken app rather than an unbuilt one.
 *
 * One screen for both lists rather than two nearly identical files: they differ in what a row is
 * and where it leads, and in nothing else.
 */
export const LibraryScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'Library'>>();
  const t = useT();
  const lang = useLang();
  const list = route.params?.list ?? 'people';

  // Subscribed as raw slices and derived here: a selector that builds a new array on every call
  // re-renders forever under useSyncExternalStore.
  const self = useSubjectsStore(s => s.self);
  const saved = useSubjectsStore(s => s.subjects);
  const favoriteIds = useFavoritesStore(s => s.ids);

  const people = useMemo(() => [self, ...saved], [self, saved]);
  // A favourite whose counsellor has left the roster is dropped rather than drawn as a blank card.
  const favorites = useMemo(
    () => favoriteIds.map(id => getLocalizedCounselor(id, lang)).filter(c => !!c),
    [favoriteIds, lang],
  );

  const isPeople = list === 'people';
  const empty = isPeople ? t('library.noPeople') : t('library.noFavorites');

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            sfx.tap();
            navigation.goBack();
          }}
          hitSlop={12}>
          <Icon name="back" size={22} />
        </Pressable>
        <Text style={styles.title}>{t(isPeople ? 'my.savedPeople' : 'my.favoriteCounselors')}</Text>
        {/* Adding a person belongs on the list of people, not three taps away in a form. */}
        {isPeople ? (
          <Pressable
            onPress={() => {
              sfx.select();
              navigation.navigate('AddSubject');
            }}
            hitSlop={12}>
            <Icon name="plus" size={22} color={colors.violetSoft} />
          </Pressable>
        ) : (
          <View style={styles.spacer} />
        )}
      </View>

      {(isPeople ? people.length : favorites.length) === 0 ? (
        <View style={styles.empty}>
          <Icon name={isPeople ? 'person' : 'heart'} size={40} />
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      ) : isPeople ? (
        <FlatList
          data={people}
          keyExtractor={s => s.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <SubjectCard
              subject={item}
              selected={false}
              onPress={() => {
                sfx.tap();
                // Straight into the same form the row edits elsewhere — including for `self`, which
                // is a saved person like any other since the profile became editable.
                navigation.navigate('AddSubject', { subjectId: item.id });
              }}
            />
          )}
        />
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={c => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <CounselorCard counselor={item} onPress={() => openCounselor(navigation, item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  spacer: { width: 22 },
  list: { padding: spacing.lg, gap: spacing.md },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    borderRadius: radius.md,
  },
});
