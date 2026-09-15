import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { RootStackParamList } from '../../../navigation/types';
import { CATEGORIES, localizeCounselors } from '../../counselors/data/mockCounselors';
import { openCounselor } from '../../counselors/openCounselor';
import { CounselorGrid } from '../../counselors/components/CounselorGrid';
import { CategoryTabs } from '../../counselors/components/CategoryTabs';
import { HomeHeader } from '../../counselors/components/HomeHeader';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const [category, setCategory] = useState<string>('recommended');

  const counselors = useMemo(() => {
    const all = localizeCounselors(lang);
    if (category === 'recommended') return all;
    return all.filter(c => c.category === category);
  }, [category, lang]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <CounselorGrid
        counselors={counselors}
        onPressCounselor={c => openCounselor(navigation, c)}
        ListHeaderComponent={
          <View>
            <HomeHeader />
            <CategoryTabs
              categories={CATEGORIES.map(c => ({ key: c.key, label: t(c.labelKey) }))}
              active={category}
              onChange={setCategory}
            />
          </View>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
});
