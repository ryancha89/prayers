import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { WorldSheet } from '../../world/components/WorldSheets';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { diaryCounselorFor } from '../diary/counselors';
import { unreadCount, useInbox } from '../inbox/inboxStore';
import { inboxLine, type InboxLink } from '../inbox/lines';
import { pieceName } from '../names';

/** How much of a diary entry a mail row quotes. */
const EXCERPT = 60;

/**
 * The mailbox: what the app itself produced (inbox/inboxStore.ts lists the producers), newest
 * first. A row is read once it is opened; one with somewhere to go goes there (`onLink`) — always
 * somewhere inside the room.
 */
export const InboxSheet: React.FC<{ onClose(): void; onLink(link: InboxLink): void }> = ({ onClose, onLink }) => {
  const t = useT();
  const lang = useLang();
  const items = useInbox(s => s.items);
  const memories = useArchiveStore(s => s.memories);
  const ctx = React.useMemo(() => ({
    entry: (id: string) => {
      const m = memories.find(x => x.id === id);
      if (!m) return null;
      const line = m.content.replace(/\s+/g, ' ').trim();
      return line.length > EXCERPT ? `${line.slice(0, EXCERPT)}…` : line;
    },
    counselor: (tone: string) => diaryCounselorFor(tone || undefined, lang)?.counselor.name ?? '',
    piece: (sku: string) => pieceName(t, sku),
  }), [memories, lang, t]);
  const unread = unreadCount(items);

  const open = (id: string, link: InboxLink | null) => {
    useInbox.getState().markRead(id);
    if (!link) { sfx.tap(); return; }
    sfx.select();
    onLink(link);
  };

  return (
    <WorldSheet title={t('inbox.title')} onClose={onClose} testID="myroom-sheet-inbox">
      {unread > 0 && (
        <Pressable
          testID="myroom-inbox-readall"
          accessibilityRole="button"
          accessibilityLabel={t('inbox.readAll')}
          onPress={() => { sfx.tap(); useInbox.getState().markAllRead(); }}
          style={({ pressed }) => [styles.readAll, pressed && styles.pressed]}>
          <Text style={styles.readAllText}>{t('inbox.readAll')}</Text>
        </Pressable>
      )}
      {items.length === 0 && <Text style={styles.empty} testID="myroom-inbox-empty">{t('inbox.empty')}</Text>}
      {items.map(item => {
        const line = inboxLine(item, t, ctx);
        return (
          <Pressable
            key={item.id}
            testID={`myroom-inbox-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={`${line.title}. ${line.body}`}
            onPress={() => open(item.id, line.link)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
            <View style={styles.iconWrap}>
              <Icon name={line.icon} size={20} color={colors.gold} />
              {!item.read && <View style={styles.dot} />}
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, item.read && styles.titleRead]} numberOfLines={2}>{line.title}</Text>
              <Text style={styles.line} numberOfLines={2}>{line.body}</Text>
              <Text style={styles.when}>{when(item.at, lang)}</Text>
            </View>
            {line.link && <Icon name="arrowRight" size={16} color={colors.textSecondary} />}
          </Pressable>
        );
      })}
    </WorldSheet>
  );
};

/** "10월 7일 14:05" in the player's language; '' for a date that does not parse. */
function when(iso: string, lang: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString(lang, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

const styles = StyleSheet.create({
  readAll: { alignSelf: 'flex-end', paddingVertical: spacing.xs, marginBottom: spacing.xs },
  readAllText: { ...typography.caption, color: colors.gold },
  empty: { ...typography.body, color: colors.textSecondary, paddingVertical: spacing.lg, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  iconWrap: { width: 28, alignItems: 'center' },
  dot: {
    position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5484D',
  },
  body: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  titleRead: { color: colors.textSecondary },
  line: { ...typography.caption, color: colors.textSecondary },
  when: { ...typography.tiny, color: colors.textMuted },
  pressed: { opacity: 0.75 },
});
