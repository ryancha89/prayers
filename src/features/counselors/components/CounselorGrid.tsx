import React from 'react';
import { FlatList, ListRenderItem, StyleSheet, View } from 'react-native';
import { spacing } from '../../../shared/theme';
import { CounselorSummary } from '../types';
import { CounselorCard } from './CounselorCard';
import { column } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';

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
  // An odd roster used to leave the last card alone on its row, where `flex: 1` stretched it to
  // the full width and twice the height (Luna, 10-17). A blank cell keeps every card one column.
  const cells: (CounselorSummary | null)[] = counselors.length % 2 ? [...counselors, null] : counselors;
  const renderItem: ListRenderItem<CounselorSummary | null> = ({ item }) => (
    <View style={styles.cell}>
      {item && <CounselorCard counselor={item} onPress={() => onPressCounselor(item)} />}
    </View>
  );

  return (
    <FlatList
      data={cells}
      keyExtractor={(c, i) => c?.id ?? `blank-${i}`}
      renderItem={renderItem}
      numColumns={2}
      columnWrapperStyle={styles.column}
      // Centred at column width: two cards across 874pt of a phone held sideways are each taller
      // than the screen (they keep their aspect).
      contentContainerStyle={[styles.content, column]}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={<>{ListFooterComponent}<MiniPlayerSpacer /></>}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  column: { gap: spacing.md, marginBottom: spacing.md },
  cell: { flex: 1 },
});
