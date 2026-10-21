import React from 'react';
import { LayoutRectangle, StyleSheet, View } from 'react-native';
import { useT } from '../../../shared/i18n';
import { spacing } from '../../../shared/theme';
import { Secondary, WorldSheet } from '../../world/components/WorldSheets';
import { CAFE_ART } from '../assets/art';
import { CAFE_PRICE } from '../table/useCafeTable';
import type { CafeIntent } from '../table/intent';
import { ServiceTile } from './TablePanel';

/**
 * "What brings you in today?" — Order Coffee / Tarot Consultation / Just look around.
 *
 * The sheet the World's cafe door used to open over the hall (20-10). PM 21-10 (Cha Jeongmin, with a
 * screenshot of it over the World): the choice belongs INSIDE the coffee shop. So the door goes
 * straight in and this opens over the cafe once it is up, the player at its door — the same sheet,
 * words and art, moved rather than redrawn. Closing it (X, or a tap on the room behind) is "just
 * looking around".
 */
export const CafeChoiceSheet: React.FC<{
  onChoose: (intent: CafeIntent | null) => void;
  /** The sheet's box, for VIEW_INSETS; null when it goes. */
  onRect?: (rect: LayoutRectangle | null) => void;
}> = ({ onChoose, onRect }) => {
  const t = useT();
  return (
    <WorldSheet title={t('world.zone.cafe')} line={t('world.cafe.pick')} onClose={() => onChoose(null)} onRect={onRect} testID="cafe-choice">
      <View style={styles.services}>
        <ServiceTile art={CAFE_ART.coffee} label={t('cafe.table.coffee')} note={t('world.cafe.coffeeNote')}
          price={CAFE_PRICE.coffee} onPress={() => onChoose({ kind: 'coffee' })} testID="cafe-choice-coffee" />
        <ServiceTile art={CAFE_ART.tarot} label={t('cafe.table.tarot')} note={t('world.cafe.tarotNote')}
          price={CAFE_PRICE.reading} onPress={() => onChoose({ kind: 'tarot' })} testID="cafe-choice-tarot" />
      </View>
      <Secondary label={t('world.cafe.wander')} onPress={() => onChoose(null)} />
    </WorldSheet>
  );
};

const styles = StyleSheet.create({
  services: { flexDirection: 'row', gap: spacing.sm },
});
