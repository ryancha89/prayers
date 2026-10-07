import { StyleSheet } from 'react-native';
import { absoluteFill, colors, radius, spacing, typography } from '../../../../shared/theme';

/** The diary's paper-and-ink look over the room (07-10 mockups): a night-indigo sheet, ivory text,
 *  gold for the one action that matters on each screen. */
export const INK = '#2A2140';
export const SHEET = '#15122E';
export const PANEL = 'rgba(255,255,255,0.06)';
export const LINE = 'rgba(233,196,106,0.35)';

export const diaryStyles = StyleSheet.create({
  root: { ...absoluteFill, backgroundColor: 'rgba(8,6,24,0.72)' },
  sheet: { flex: 1, backgroundColor: SHEET },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: LINE,
  },
  headTitle: { ...typography.h2, color: colors.textPrimary, flex: 1, textAlign: 'center' },
  headBtn: { minWidth: 40, paddingVertical: 6, alignItems: 'center' },
  headBtnText: { ...typography.bodyStrong, color: colors.gold },
  scroll: { padding: spacing.lg, gap: spacing.lg },
  label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs },
  panel: { backgroundColor: PANEL, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  body: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  muted: { ...typography.caption, color: colors.textMuted },
  gold: {
    borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center',
    backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  goldText: { ...typography.h3, color: INK },
  ghost: {
    borderRadius: radius.pill, paddingVertical: spacing.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.gold,
  },
  ghostText: { ...typography.h3, color: colors.gold },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.75 },
});
