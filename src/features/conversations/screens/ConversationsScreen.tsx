import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { RootStackParamList } from '../../../navigation/types';
import { useConversationsStore } from '../store/conversationsStore';
import { ConversationRow } from '../components/ConversationRow';
import { syncConversationsFromServer } from '../syncConversations';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Zeta-like recent conversation list; tapping resumes the session (spec §29, §31). */
export const ConversationsScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  // Subscribe to raw slices and derive locally — a selector that builds a new
  // array each call would loop useSyncExternalStore.
  const order = useConversationsStore(s => s.order);
  const byId = useConversationsStore(s => s.byId);
  const conversations = useMemo(
    () => order.map(id => byId[id]).filter(Boolean),
    [order, byId],
  );

  // The account's list, pulled every time the tab is opened. The device's copy is drawn first and
  // is never blanked while the request is in flight — a list that empties for a second on every
  // visit reads as "my history is gone", which is the exact fear this feature exists to end.
  const [syncing, setSyncing] = useState(false);
  const pull = useCallback(
    (signal?: AbortSignal) => {
      setSyncing(true);
      return syncConversationsFromServer(lang, signal).finally(() => setSyncing(false));
    },
    [lang],
  );

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      pull(ac.signal);
      return () => ac.abort();
    }, [pull]),
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
          {syncing ? <ActivityIndicator color={colors.violetSoft} /> : <Icon name="chat" size={44} />}
          <Text style={styles.emptyTitle}>{t('conv.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('conv.emptyBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.sessionId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={syncing}
              onRefresh={() => { pull(); }}
              tintColor={colors.textMuted}
            />
          }
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
