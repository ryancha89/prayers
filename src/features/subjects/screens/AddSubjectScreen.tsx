import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { Text, TextInput } from '../../../shared/components/Text';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { SELF, useSubjectsStore } from '../store/subjectsStore';
import { maskBirthDate, maskBirthTime } from '../birthMask';
import { chartFromFields } from '../../saju/chart';
import { BirthPreview } from '../../saju/components/BirthPreview';
import { findKoreaPlace, searchKoreaPlaces } from '../../saju/data/koreaPlaces';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import type { CounselingSubject } from '../../counseling/types';
import { column } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';
import { fetchSajuProfile, saveSajuProfile } from '../../counseling/api/prayersServer';

/**
 * The birth-data form, for a new person OR for one that already exists — including `self`, the
 * account holder, who until now had no way to say who they were at all.
 *
 * Still short (spec §14, §16 "do not force too many fields"), but two of these fields are no longer
 * optional in practice: without a birth DATE the server cannot build a chart, and without GENDER it
 * silently assumes male and reads someone else's life. The time may genuinely be unknown, and
 * leaving it blank says so — the calendar drops the hour pillar rather than guessing midnight.
 */
export const AddSubjectScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'AddSubject' | 'ProfileSetup'>>();
  const onboarding = route.name === 'ProfileSetup';
  const params = onboarding
    ? { subjectId: 'self' }
    : (route.params as RootStackParamList['AddSubject']);
  const t = useT();
  const addSubject = useSubjectsStore(s => s.addSubject);
  const deferProfile = useSubjectsStore(s => s.deferProfile);
  const updateSubject = useSubjectsStore(s => s.updateSubject);
  const existing = useSubjectsStore(s => (params?.subjectId ? s.getById(params.subjectId) : undefined));

  // The stored self STARTS with a placeholder name nobody chose; showing that as a filled-in field
  // would invite the user to accept "Myself" as their name. Only the placeholder is hidden, though:
  // blanking every self name meant a user who HAD entered one saw an empty box, and — the name
  // being required — could not save a changed birth time without typing it again (23-09).
  const initialName =
    existing && !(existing.isUser && existing.displayName === SELF.displayName)
      ? existing.displayName
      : '';

  const [name, setName] = useState(initialName);
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? '');
  const [birthTime, setBirthTime] = useState(existing?.birthTime ?? '');
  const [gender, setGender] = useState<CounselingSubject['gender']>(existing?.gender);
  const [birthPlace, setBirthPlace] = useState<string | undefined>(existing?.birthPlace);
  const [placeQuery, setPlaceQuery] = useState('');
  const lang = useLang();
  // The birthplace search is for births in Korea — offered to Korean players, or whoever already has one.
  const placeOn = lang === 'ko' || !!existing?.birthPlace;
  const placeHits = birthPlace ? [] : searchKoreaPlaces(placeQuery);
  const chart = chartFromFields(birthDate, birthTime, birthPlace);

  const complete = !!name.trim() && !!birthDate.trim() && !!gender;

  const onSave = () => {
    if (!complete) return;
    const patch = {
      displayName: name.trim(),
      birthDate: birthDate.trim(),
      birthTime: birthTime.trim() || undefined,
      birthPlace,
      gender,
    };
    if (existing) updateSubject(existing.id, patch);
    else addSubject(patch);
    // The account holder's own details go to the server too, so the next sign-in (another phone,
    // a reinstall) restores them instead of asking again. Best effort: the local copy is enough
    // to carry on, and a consultation saves the chart again before it starts.
    if (existing?.id === 'self' && patch.gender) {
      void saveSajuProfile({
        name: patch.displayName,
        birthDate: patch.birthDate,
        birthTime: patch.birthTime,
        gender: patch.gender,
      });
    }
    if (onboarding) return; // the navigator swaps the whole stack once `self` has data
    navigation.goBack();
  };

  // First run after a sign-in: the account may already have a profile on the server (another
  // phone, a reinstall, signed out and back in). Restore it instead of asking again — saving it
  // into `self` makes the navigator drop this screen on its own.
  const [restoring, setRestoring] = useState(onboarding);
  useEffect(() => {
    if (!onboarding) return;
    const ctrl = new AbortController();
    fetchSajuProfile(ctrl.signal).then(p => {
      if (ctrl.signal.aborted) return;
      if (p) {
        updateSubject('self', {
          displayName: p.name.trim() || SELF.displayName,
          birthDate: p.birthDate,
          birthTime: p.birthTime,
          gender: p.gender,
        });
      } else {
        setRestoring(false);
      }
    });
    return () => ctrl.abort();
  }, [onboarding, updateSubject]);

  if (restoring) {
    return (
      <SafeAreaView style={[styles.container, styles.restoring]} edges={['top', 'bottom', 'left', 'right']}>
        <ActivityIndicator color={colors.textSecondary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.header}>
        {/* No way back out of the first run: this screen IS the app until it is answered, and a
            back arrow with nothing behind it is a dead control. */}
        {onboarding ? (
          <View style={styles.headerSpacer} />
        ) : (
          <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
            <Icon name="back" size={28} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {onboarding
            ? t('addSubject.selfTitle')
            : existing?.isUser
              ? t('addSubject.editSelf')
              : t('addSubject.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        {onboarding ? <Text style={styles.intro}>{t('addSubject.selfIntro')}</Text> : null}
        <Field
          label={t('addSubject.name')}
          value={name}
          onChange={setName}
          placeholder={t('addSubject.namePlaceholder')}
          autoFocus
        />
        <Field
          label={t('addSubject.birthDate')}
          value={birthDate}
          onChange={v => setBirthDate(maskBirthDate(v, birthDate))}
          placeholder="YYYY-MM-DD"
          // A digits-only pad, now that the dashes type themselves. It was
          // `numbers-and-punctuation` while the player had to reach for `-`.
          keyboardType="number-pad"
          maxLength={10}
        />
        <Field
          label={t('addSubject.birthTime')}
          value={birthTime}
          onChange={v => setBirthTime(maskBirthTime(v, birthTime))}
          placeholder="HH:MM"
          keyboardType="number-pad"
          maxLength={5}
        />
        {/* Directly under the field it describes. Sitting below the gender row instead, it read as
            a note about gender — so the one field that IS optional looked required, and the one
            that is required looked optional. */}
        {placeOn && (
          <View style={styles.field} testID="birth-place">
            <Text style={styles.label}>{t('addSubject.birthPlace')}</Text>
            {birthPlace ? (
              <View style={styles.placeChosen}>
                <Icon name="map" size={16} color={colors.violetSoft} />
                <Text style={styles.placeChosenText}>
                  {birthPlace} · {findKoreaPlace(birthPlace)?.region}
                </Text>
                <Pressable
                  testID="birth-place-clear"
                  hitSlop={10}
                  accessibilityRole="button"
                  onPress={() => { sfx.tap(); setBirthPlace(undefined); setPlaceQuery(''); }}>
                  <Text style={styles.placeClear}>✕</Text>
                </Pressable>
              </View>
            ) : (
              <TextInput
                testID="birth-place-input"
                style={styles.input}
                value={placeQuery}
                onChangeText={setPlaceQuery}
                placeholder={t('addSubject.birthPlacePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />
            )}
            {placeHits.length > 0 && (
              <View style={styles.placeList}>
                {placeHits.map(p => (
                  <Pressable
                    key={p.name}
                    testID={`birth-place-${p.name}`}
                    style={({ pressed }) => [styles.placeRow, pressed && styles.placeRowPressed]}
                    onPress={() => { sfx.select(); setBirthPlace(p.name); setPlaceQuery(''); }}>
                    <Text style={styles.placeName}>{p.name}</Text>
                    <Text style={styles.placeRegion}>{p.region}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Text style={styles.hint}>{t('addSubject.birthPlaceHint')}</Text>
          </View>
        )}
        {chart?.summerTime ? (
          <Text style={[styles.hint, styles.summerHint]}>{t('addSubject.summerHint')}</Text>
        ) : null}
        <Text style={styles.hint}>{t('addSubject.hint')}</Text>
        <Text style={styles.label}>{t('addSubject.gender')}</Text>
        <View style={styles.genderRow}>
          {(['female', 'male'] as const).map(g => (
            <Pressable
              key={g}
              onPress={() => setGender(g)}
              style={[styles.genderOption, gender === g && styles.genderOptionActive]}>
              <Text style={[styles.genderLabel, gender === g && styles.genderLabelActive]}>
                {t(g === 'female' ? 'addSubject.female' : 'addSubject.male')}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* The star sign, the animal and the pillars, live as the date is typed (10-15). */}
        <BirthPreview birthDate={birthDate.trim()} birthTime={birthTime.trim() || undefined} birthPlace={birthPlace} />
        <MiniPlayerSpacer />
      </ScrollView>

      <View style={styles.footer}>
        {/* Names what is still missing. A dead button that will not say why is the reason the
            optional field got blamed for the required one. */}
        {!complete ? <Text style={styles.hint}>{t('addSubject.required')}</Text> : null}
        <PrimaryButton
          label={onboarding ? t('addSubject.start') : t('addSubject.save')}
          onPress={onSave}
          disabled={!complete}
        />
        {onboarding ? (
          <Pressable style={styles.later} onPress={deferProfile} hitSlop={8}>
            <Text style={styles.laterLabel}>{t('addSubject.later')}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  keyboardType?: 'default' | 'numbers-and-punctuation' | 'number-pad';
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, autoFocus, keyboardType, maxLength }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
      maxLength={maxLength}
    />
  </View>
);

const styles = StyleSheet.create({
  restoring: { alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  headerSpacer: { width: 28 },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  genderRow: { flexDirection: 'row', gap: spacing.md },
  genderOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  genderOptionActive: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  genderLabel: { ...typography.body, color: colors.textSecondary },
  genderLabelActive: { color: colors.violetSoft },
  hint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  summerHint: { color: colors.violetSoft },
  placeChosen: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  placeChosenText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  placeClear: { ...typography.body, color: colors.textMuted },
  placeList: { backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden' },
  placeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  placeRowPressed: { backgroundColor: colors.cardPressed },
  placeName: { ...typography.body, color: colors.textPrimary },
  placeRegion: { ...typography.caption, color: colors.textMuted },
  intro: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  later: { alignItems: 'center', paddingVertical: spacing.md },
  laterLabel: { ...typography.body, color: colors.textMuted },
});
