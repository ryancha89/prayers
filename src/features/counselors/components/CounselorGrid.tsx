import React from 'react';
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native';
import { spacing } from '../../../shared/theme';
import { CounselorSummary } from '../types';
import { CounselorCard } from './CounselorCard';

/**
 * Two-column vertical feed (spec §6). Header/category tabs are passed through
 * so the whole page scrolls as one surface (Zeta-like density, spec §5).
 */
export const CounselorGrid: React.FC<{
  counselors: CounselorSummary[];
  onPressCounselor: (c: CounselorSummary) => void;
  ListHeaderComponent?: React.ReactElement;
  ListFooterComponent?: React.ReactElement;
}> = ({ counselors, onPressCounselor, ListHeaderComponent, ListFooterComponent }) => {
  const renderItem: ListRenderItem<CounselorSummary> = ({ item }) => (
    <View style={styles.cell}>
      <CounselorCard counselor={item} onPress={() => onPressCounselor(item)} />
    </View>
  );

  return (
    <FlatList
      data={counselors}
      keyExtractor={c => c.id}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.content}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={ListFooterComponent}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  column: { gap: spacing.md, marginBottom: spacing.md },
  cell: { flex: 1 },
});
