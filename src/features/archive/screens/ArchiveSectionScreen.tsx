import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useArchiveStore } from '../store/archiveStore';
import { syncArchive } from '../api/memoriesApi';
import { CATEGORY_ICON, FIELDS, KIND_ICON, MOOD_ICON, type ArchiveMemory } from '../types';
import { MemoryEditor } from '../components/MemoryEditor';
import { chartFromFields, pillarsText } from '../../saju/chart';

type Rt = RouteProp<RootStackParamList, 'ArchiveSection'>;

/**
 * One category of the 아카이브: its entries, and the form to add or change one.
 *
 * The list is category-shaped — a timeline for the life story, a mood-and-date journal for the
 * diary, tags for interests — but every row carries the same two controls, because the promise
 * to the player is the same on every row: you can change it, you can delete it, and you can keep
 * it from the counsellors with one switch.
 */
export const ArchiveSectionScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { category } = useRoute<Rt>().params;
  const items = useArchiveStore(s => s.memories).filter(m => m.category === category);
  const add = useArchiveStore(s => s.add);
  const update = useArchiveStore(s => s.update);
  const remove = useArchiveStore(s => s.remove);
  const setAiEnabled = useArchiveStore(s => s.setAiEnabled);
  const self = useSubjectsStore(s => s.self);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = React.useMemo(() => {
    const list = [...items];
    if (category === 'story') list.sort((a, b) => (a.details.year ?? '').localeCompare(b.details.year ?? ''));
    else if (category === 'diary') list.sort((a, b) => (b.details.date ?? '').localeCompare(a.details.date ?? ''));
    return list;
  }, [items, category]);

  const after = () => {
    setAdding(false);
    setEditingId(null);
    syncArchive().catch(() => {});
  };

  // A person with a birth date gets their four pillars computed here, the way the sister app
  // does it (summer time and Seoul's −30 min included), and stored with them — so the
  // counsellor reads the same chart the player would see anywhere else.
  const withChart = (details: Record<string, string>): Record<string, string> => {
    if (category !== 'relationship' || !details.birthDate) return details;
    const chart = chartFromFields(details.birthDate, details.birthTime);
    if (!chart) return details;
    return { ...details, pillars: pillarsText(chart), summerTime: chart.summerTime ? 'true' : 'false' };
  };

  const choiceLabel = (m: ArchiveMemory, key: string) => {
    const spec = FIELDS[category].find(f => f.key === key);
    const v = m.details[key];
    if (!spec || !v) return '';
    return spec.kind === 'choice' ? t(`${spec.optionLabelPrefix}.${v}` as TranslationKey) : v;
  };

  const subtitle = (m: ArchiveMemory): string => {
    switch (category) {
      case 'relationship':
        return [
          choiceLabel(m, 'relation'),
          m.details.since,
          choiceLabel(m, 'closeness'),
          m.details.birthDate ? `${m.details.birthDate}${m.details.birthTime ? ` ${m.details.birthTime}` : ''}` : '',
          m.details.pillars ? `${m.details.pillars}${m.details.summerTime === 'true' ? ' ☀' : ''}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
      case 'story':
        return [choiceLabel(m, 'kind'), m.details.note].filter(Boolean).join(' · ');
      case 'diary':
        return m.details.date ?? '';
      case 'goal':
        return choiceLabel(m, 'status');
      case 'interest':
        return choiceLabel(m, 'level');
      case 'possession':
        return [choiceLabel(m, 'kind'), m.details.note].filter(Boolean).join(' · ');
      case 'career':
        return [choiceLabel(m, 'kind'), m.details.note].filter(Boolean).join(' · ');
      case 'manual':
        return choiceLabel(m, 'section');
      case 'profile':
        return choiceLabel(m, 'key');
      default:
        return '';
    }
  };

  const lead = (m: ArchiveMemory): string => {
    if (category === 'diary') return MOOD_ICON[m.details.mood] ?? '📔';
    if (category === 'possession') return KIND_ICON[m.details.kind] ?? '📦';
    if (category === 'story') return m.details.year ?? '';
    if (category === 'goal') return m.details.status === 'done' ? '☑' : '☐';
    return CATEGORY_ICON[category];
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            sfx.tap();
            navigation.goBack();
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {CATEGORY_ICON[category]} {t(`archive.cat.${category}` as TranslationKey)}
        </Text>
        <Pressable
          hitSlop={12}
          onPress={() => {
            sfx.tap();
            setEditingId(null);
            setAdding(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('archive.add')}>
          <Icon name="plus" size={22} color={colors.violetSoft} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {category === 'profile' && (
          <View style={styles.linked}>
            <Text style={styles.linkedText}>
              {self.displayName}
              {self.birthDate ? ` · ${self.birthDate}` : ''}
              {self.birthTime ? ` ${self.birthTime}` : ''}
            </Text>
            <Text style={styles.linkedNote}>{t('archive.linked')}</Text>
            <Pressable onPress={() => navigation.navigate('AddSubject', { subjectId: 'self' })} hitSlop={8}>
              <Text style={styles.linkedEdit}>{t('archive.editProfile')}</Text>
            </Pressable>
          </View>
        )}

        {adding && (
          <MemoryEditor
            category={category}
            onSave={v => {
              add({ category, content: v.content, details: withChart(v.details), source: category === 'diary' ? 'diary' : 'manual' });
              after();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {sorted.length === 0 && !adding && <Text style={styles.empty}>{t('archive.empty')}</Text>}

        {sorted.map(m =>
          editingId === m.id ? (
            <MemoryEditor
              key={m.id}
              category={category}
              initial={{ content: m.content, details: m.details }}
              onSave={v => {
                update(m.id, { content: v.content, details: withChart(v.details) });
                after();
              }}
              onCancel={() => setEditingId(null)}
              onDelete={() => {
                remove(m.id);
                after();
              }}
            />
          ) : (
            <Pressable
              key={m.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              onPress={() => {
                sfx.tap();
                setAdding(false);
                setEditingId(m.id);
              }}>
              <Text style={[styles.lead, category === 'story' && styles.leadYear]}>{lead(m)}</Text>
              <View style={styles.body}>
                <Text style={styles.content}>{m.content}</Text>
                {!!subtitle(m) && <Text style={styles.sub}>{subtitle(m)}</Text>}
                <View style={styles.aiRow}>
                  <Text style={styles.aiLabel}>{t('archive.aiUse')}</Text>
                  <Switch
                    value={m.aiEnabled}
                    onValueChange={on => {
                      sfx.tap();
                      setAiEnabled(m.id, on);
                      syncArchive().catch(() => {});
                    }}
                    trackColor={{ true: colors.violet, false: colors.bgElevated }}
                    thumbColor={colors.textPrimary}
                  />
                </View>
              </View>
            </Pressable>
          ),
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.h2, color: colors.textPrimary, flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  linked: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  linkedText: { ...typography.bodyStrong, color: colors.textPrimary },
  linkedNote: { ...typography.caption, color: colors.textMuted },
  linkedEdit: { ...typography.caption, color: colors.violetSoft },
  empty: { ...typography.body, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
  row: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  rowPressed: { backgroundColor: colors.cardPressed },
  lead: { fontSize: 22, width: 32, textAlign: 'center' },
  leadYear: { ...typography.caption, color: colors.gold, width: 44, paddingTop: 4 },
  body: { flex: 1, gap: 2 },
  content: { ...typography.body, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary },
  aiRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  aiLabel: { ...typography.tiny, color: colors.textMuted, flexShrink: 1 },
});
