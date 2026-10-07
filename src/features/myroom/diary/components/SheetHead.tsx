import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors } from '../../../../shared/theme';
import { useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { diaryStyles as s } from './diaryTheme';

/** Every diary screen's header: back/close on the left, the title, an optional action right. */
export const SheetHead: React.FC<{
  title: string;
  onClose(): void;
  right?: React.ReactNode;
  closeTestID?: string;
}> = ({ title, onClose, right, closeTestID }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  return (
    <View style={[s.head, { paddingTop: safe.top + 8, paddingLeft: safe.left + 16, paddingRight: safe.right + 16 }]}>
      <Pressable
        testID={closeTestID}
        hitSlop={10}
        onPress={() => { sfx.back(); onClose(); }}
        accessibilityRole="button"
        accessibilityLabel={t('diary.close')}
        style={s.headBtn}>
        <Icon name="back" size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={s.headTitle} numberOfLines={1}>{title}</Text>
      <View style={s.headBtn}>{right}</View>
    </View>
  );
};
