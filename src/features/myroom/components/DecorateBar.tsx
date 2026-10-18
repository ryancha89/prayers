import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { IVORY } from '../../../shared/components/hud/Hud';
import { Icon, type IconName } from '../../../shared/components/Icon';
import type { MyRoomLayoutChanged, MyRoomSelect } from '../../counseling/types';
import { itemName } from '../names';
import { ItemThumb } from './ItemThumb';
import { decorHint } from '../edit/decorate';
import { MYROOM_FEATURES } from '../edit/features';
import { formatCoins } from '../../coins/format';
import { CoinGlyph } from '../../coins/components/CoinGlyph';

/**
 * Decorate mode's top bar (spec 005 T025), two rows:
 *
 *   Cancel  ?                 ↶ Undo  Done
 *   what the player can do right now (decorHint) — and Buy, for a skin previewed but not owned
 *
 * The line follows the state (14-10, "làm sao cho UX dễ hiểu"): how to pick a piece; what the
 * selected one allows (drag + turn, or fixed: swap / put away); why Done is off (Unity's reason, in
 * the warning colour, with "move it somewhere free"); or what a skin costs to keep. It shrinks its
 * font rather than clip past two lines.
 *
 * Done is off until the first MYROOM_LAYOUT_CHANGED, while the last said `valid: false`, while a
 * save is going, and while the working skin is not owned.
 */
export const DecorateBar: React.FC<{
  pending: MyRoomLayoutChanged | null;
  selected: MyRoomSelect | null;
  saving: boolean;
  /** The previewed skin, when the account does not own it. `price` null = not for sale. */
  skin?: { price: number | null } | null;
  buyingSkin?: boolean;
  onBuySkin?(): void;
  canUndo: boolean;
  onUndo(): void;
  onHelp(): void;
  topInset: number;
  sideInset: number;
  onCancel(): void;
  onDone(): void;
  onLayout?: React.ComponentProps<typeof View>['onLayout'];
}> = ({ pending, selected, saving, skin, buyingSkin, onBuySkin, canUndo, onUndo, onHelp, topInset, sideInset, onCancel, onDone, onLayout }) => {
  const t = useT();
  const doneOff = saving || !pending || !pending.valid || !!skin;
  const hint = decorHint(pending, selected, skin);
  const line = hint.kind === 'invalid' ? `${t(hint.reason)} ${t('myroom.edit.hint.moveAway')}`
    : hint.kind === 'skin' ? t('myroom.skin.buyToKeep', { price: skin?.price != null ? formatCoins(skin.price) : '—' })
    : t(hint.kind === 'move' ? 'myroom.edit.hint.move'
      // Without storage there is no "put it away": a fixed piece can only be swapped.
      : hint.kind === 'fixed' ? (MYROOM_FEATURES.storage ? 'myroom.edit.hint.fixed' : 'myroom.edit.hint.fixedSwapOnly')
      : 'myroom.edit.hint.pick');
  const warn = hint.kind === 'invalid' || hint.kind === 'skin';
  return (
    <View
      testID="myroom-decorate-bar"
      onLayout={onLayout}
      style={[styles.bar, { paddingTop: topInset + spacing.sm, paddingLeft: sideInset + spacing.md, paddingRight: sideInset + spacing.md }]}>
      <View style={styles.row}>
        <Pressable
          testID="myroom-decorate-cancel"
          accessibilityRole="button"
          accessibilityLabel={t('myroom.edit.cancel')}
          disabled={saving}
          onPress={onCancel}
          style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
          <Text style={styles.pillText} numberOfLines={1}>{t('myroom.edit.cancel')}</Text>
        </Pressable>
        <Pressable
          testID="myroom-decorate-help"
          accessibilityRole="button"
          accessibilityLabel={t('myroom.edit.help')}
          hitSlop={4}
          onPress={onHelp}
          style={({ pressed }) => [styles.help, pressed && styles.pressed]}>
          <Icon name="help" size={20} color={colors.gold} />
        </Pressable>
        <View style={styles.grow} />
        <Pressable
          testID="myroom-decorate-undo"
          accessibilityRole="button"
          accessibilityLabel={t('myroom.edit.undo')}
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo || saving}
          onPress={onUndo}
          style={({ pressed }) => [styles.pill, styles.pillRow, !canUndo && styles.off, pressed && styles.pressed]}>
          <Icon name="undo" size={16} color={colors.textPrimary} />
          <Text style={styles.pillText} numberOfLines={1}>{t('myroom.edit.undo')}</Text>
        </Pressable>
        <Pressable
          testID="myroom-decorate-done"
          accessibilityRole="button"
          accessibilityLabel={t('myroom.edit.done')}
          accessibilityState={{ disabled: doneOff }}
          disabled={doneOff}
          onPress={onDone}
          style={({ pressed }) => [styles.pill, styles.pillRow, styles.done, doneOff && styles.off, pressed && styles.pressed]}>
          {saving ? <ActivityIndicator size="small" color="#1A1330" /> : (
            <>
              <Icon name="check" size={16} color="#1A1330" />
              <Text style={[styles.pillText, styles.doneText]} numberOfLines={1}>{t('myroom.edit.done')}</Text>
            </>
          )}
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text
          testID="myroom-decorate-status"
          style={[styles.status, warn && styles.statusBad]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.75}>
          {line}
        </Text>
        {skin && skin.price != null && onBuySkin && (
          <Pressable
            testID="myroom-skin-buy"
            accessibilityRole="button"
            accessibilityLabel={`${t('myroom.skin.buy')} · ${formatCoins(skin.price)}`}
            disabled={buyingSkin}
            onPress={onBuySkin}
            style={({ pressed }) => [styles.pill, styles.buy, pressed && styles.pressed]}>
            {buyingSkin ? <ActivityIndicator size="small" color="#1A1330" /> : (
              // Says what it does — a bare price read as a counter, not a button (10-17).
              <View style={styles.buyRow}>
                <Text style={[styles.pillText, styles.buyText]} numberOfLines={1}>{t('myroom.skin.buy')}</Text>
                <View style={styles.buyPrice}>
                  <CoinGlyph size={14} />
                  <Text style={[styles.pillText, styles.buyText]} numberOfLines={1}>{formatCoins(skin.price)}</Text>
                </View>
              </View>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
};

/**
 * The selected piece's controls, over the tray: its name (with a "Fixed" chip for a slotted piece),
 * then labelled actions — Turn left / Turn right (floor pieces only: wall, cornice and table-top
 * pieces swap only, FR-004), Swap (owned pieces of the same kind and category with a copy left) and
 * Put away. An icon alone was not enough to read (14-10).
 */
export const SelectionBar: React.FC<{
  selected: MyRoomSelect;
  /** Its catalog category, for the placeholder when this build has no picture of it. */
  category?: string;
  swaps: string[];
  onRotate(step: 1 | -1): void;
  onSwap(item: string): void;
  onStore(): void;
}> = ({ selected, category, swaps, onRotate, onSwap, onStore }) => {
  const t = useT();
  const [swapOpen, setSwapOpen] = useState(false);
  // A new selection starts with the swap list closed.
  const [forUid, setForUid] = useState(selected.uid);
  if (forUid !== selected.uid) { setForUid(selected.uid); setSwapOpen(false); }
  return (
    <View style={styles.selection} testID="myroom-decorate-selection">
      <View style={styles.selHead}>
        <ItemThumb id={selected.item} category={category} size={32} testID="myroom-decorate-selection-thumb" />
        <Text style={styles.selName} numberOfLines={1}>{itemName(t, selected.item) || selected.item}</Text>
        {!selected.canMove && (
          <View style={styles.fixed} testID="myroom-decorate-fixed">
            <Text style={styles.fixedText} numberOfLines={1}>{t('myroom.edit.fixed')}</Text>
          </View>
        )}
      </View>
      <View style={styles.actions}>
        {selected.canMove && (
          <>
            <Action testID="myroom-decorate-rotate-left" label={t('myroom.edit.rotateLeft')} icon="rotateLeft" onPress={() => onRotate(-1)} />
            <Action testID="myroom-decorate-rotate-right" label={t('myroom.edit.rotateRight')} icon="rotateRight" onPress={() => onRotate(1)} />
          </>
        )}
        <Action testID="myroom-decorate-swap" label={t('myroom.edit.swap')} icon="swap" active={swapOpen} onPress={() => { sfx.tap(); setSwapOpen(o => !o); }} />
        {/* Put away needs Storage to put it in (stage 1: off — features.ts). */}
        {MYROOM_FEATURES.storage && (
          <Action testID="myroom-decorate-store" label={t('myroom.edit.store')} icon="storeAway" onPress={onStore} />
        )}
      </View>
      {swapOpen && (
        swaps.length === 0 ? (
          <Text style={styles.empty} testID="myroom-decorate-swap-none">{t('myroom.edit.swapNone')}</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swapList}>
            {swaps.map(id => (
              <Chip key={id} testID={`myroom-decorate-swap-${id}`} label={itemName(t, id)} onPress={() => { setSwapOpen(false); onSwap(id); }} />
            ))}
          </ScrollView>
        )
      )}
    </View>
  );
};

/** An action: a round icon with its name underneath. */
const Action: React.FC<{ testID: string; label: string; icon: IconName; active?: boolean; onPress(): void }> = ({
  testID, label, icon, active, onPress,
}) => (
  <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
    style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
    <View style={[styles.round, active && styles.roundOn]}>
      <Icon name={icon} size={20} color={active ? '#1A1330' : colors.textPrimary} />
    </View>
    <Text style={styles.actionLabel} numberOfLines={2}>{label}</Text>
  </Pressable>
);

const Chip: React.FC<{ testID: string; label: string; active?: boolean; onPress(): void }> = ({ testID, label, active, onPress }) => (
  <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.chip, active && styles.chipOn, pressed && styles.pressed]}>
    <Text style={[styles.chipText, active && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 0, right: 0, top: 0, paddingBottom: spacing.sm, gap: spacing.xs,
    backgroundColor: 'rgba(14,12,40,0.72)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  pill: {
    minWidth: 64, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  // Icon + label, centred on one line.
  pillRow: { flexDirection: 'row', gap: 4 },
  pillText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  done: { backgroundColor: colors.gold, borderColor: colors.gold },
  doneText: { color: '#1A1330' },
  off: { opacity: 0.45 },
  // 36 pt round, the icon alone (its own circle is the button's).
  help: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  buy: { minWidth: 64, borderColor: colors.gold, backgroundColor: colors.gold },
  buyText: { color: '#1A1330', fontWeight: '700' },
  buyPrice: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: 'rgba(26,19,48,0.25)' },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { ...typography.caption, color: IVORY, flex: 1, textAlign: 'center' },
  statusBad: { color: '#F2A7A7', fontWeight: '700' },
  selection: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.35)',
  },
  selHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selName: { ...typography.bodyStrong, color: colors.gold, flexShrink: 1 },
  fixed: {
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: 'rgba(233,196,106,0.16)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  fixedText: { ...typography.tiny, color: colors.gold, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' },
  action: { alignItems: 'center', width: 76, gap: 2 },
  round: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  roundOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  actionLabel: { ...typography.tiny, color: colors.textPrimary, textAlign: 'center' },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  chipOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  chipText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  chipTextOn: { color: '#1A1330' },
  swapList: { gap: spacing.xs, paddingVertical: 2 },
  empty: { ...typography.caption, color: colors.textSecondary },
  pressed: { opacity: 0.75 },
});
