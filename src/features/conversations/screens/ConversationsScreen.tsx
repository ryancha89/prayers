import React, { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { RootStackParamList } from '../../../navigation/types';
import { useConversationsStore } from '../store/conversationsStore';
import { ConversationRow } from '../components/ConversationRow';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Zeta-like recent conversation list; tapping resumes the session (spec §29, §31). */
export const ConversationsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  // Subscribe to raw slices and derive locally — a selector that builds a new
  // array each call would loop useSyncExternalStore.
  const order = useConversationsStore(s => s.order);
  const byId = useConversationsStore(s => s.byId);
  const conversations = useMemo(
    () => order.map(id => byId[id]).filter(Boolean),
    [order, byId],
  );

  const resume = (counselorId: string, subjectId?: string) => {
    navigation.navigate('UnityEntry', {
      counselorId,
      subjectId: subjectId ?? 'self',
      resuming: true,
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <Text style={styles.header}>{t('conv.title')}</Text>
      {conversations.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="chat" size={44} />
          <Text style={styles.emptyTitle}>{t('conv.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('conv.emptyBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.sessionId}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<Text style={styles.sub}>{t('conv.recent')}</Text>}
          renderItem={({ item }) => (
            <ConversationRow
              conversation={item}
              onPress={() => resume(item.counselorId, item.subjectId)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { ...typography.hero, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sub: { ...typography.caption, color: colors.textMuted, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  list: { paddingBottom: spacing.xxl },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xxl },
  emptyTitle: { ...typography.h2, color: colors.textPrimary },
  emptyBody: { ...typography.body, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
});
