import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { ENDING_ART } from '../art';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** After the last station (mockup panel 21): one painting, one line, and on to the collection. */
export const JourneyEndingScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  return (
    <View style={styles.root}>
      <Image source={ENDING_ART} style={styles.art} resizeMode="cover" />
      <View style={styles.shade} />
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.content}>
        <Text style={styles.title}>{t('journey.ending.title')}</Text>
        <Pressable
          style={styles.button}
          onPress={() => { sfx.select(); navigation.replace('JourneyCollection'); }}
          accessibilityRole="button">
          <Text style={styles.buttonText}>{t('journey.ending.toCollection')}</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  art: { ...absoluteFill, width: '100%', height: '100%' },
  shade: { ...absoluteFill, backgroundColor: 'rgba(7,6,26,0.35)' },
  content: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: spacing.xl, gap: spacing.xl },
  title: { ...typography.hero, color: colors.textPrimary, textAlign: 'center' },
  button: { paddingVertical: spacing.lg, paddingHorizontal: spacing.xxl, borderRadius: radius.pill, backgroundColor: colors.gold },
  buttonText: { ...typography.h3, color: '#1A1330' },
});
