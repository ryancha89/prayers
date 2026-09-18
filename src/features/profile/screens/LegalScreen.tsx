import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../../navigation/types';
import { colors, spacing, typography } from '../../../shared/theme';
import { useLanguageStore } from '../../../shared/i18n';
import { docFor } from '../data/legalDocs';

/**
 * Terms and the privacy policy, in the app rather than behind a link.
 *
 * In the app on purpose: a WebView would need a hosted page, and a policy that 404s on a bad
 * network is a policy that is not there when the reviewer taps it. These rows used to be labels
 * with no `onPress` at all — visible promises of documents that did not exist.
 */
export const LegalScreen: React.FC = () => {
  const route = useRoute<RouteProp<RootStackParamList, 'Legal'>>();
  const lang = useLanguageStore(s => s.lang);
  const doc = docFor(route.params.doc, lang);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{doc.title}</Text>
        <Text style={styles.updated}>{doc.updated}</Text>
        {doc.sections.map(section => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body.map(line => (
              <Text key={line} style={styles.body}>
                {line}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl ?? spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary },
  updated: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.xl },
  section: { marginBottom: spacing.xl },
  heading: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
});
