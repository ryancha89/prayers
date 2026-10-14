import type { TranslationKey } from '../../shared/i18n';

/**
 * How My Room's pieces are grouped for the player — the Shop list and the Storage strip both
 * (14-10: "Rèm cửa nên để trong mục decor không?" — under one "Furniture" header the curtains sat
 * between the bed and the sofa). Keyed on the server's catalog `category`
 * (Prayers::MyRoomCatalog); the one place this mapping lives.
 */
export type ShopSection = 'furniture' | 'lighting' | 'decor';

export const SECTION_ORDER: readonly ShopSection[] = ['furniture', 'lighting', 'decor'];

const BY_CATEGORY: Record<string, ShopSection> = {
  bed: 'furniture',
  seat: 'furniture',
  table: 'furniture',
  shelf: 'furniture',
  lamp: 'lighting',
  curtain: 'decor',
  plant: 'decor',
  art: 'decor',
  rug: 'decor',
  decor: 'decor',
};

/** A category the server adds later (or a piece with none known) is decor until it is mapped. */
export const sectionOf = (category?: string | null): ShopSection => (category && BY_CATEGORY[category]) || 'decor';

export const SECTION_LABEL: Record<ShopSection, TranslationKey> = {
  furniture: 'myroom.section.furniture',
  lighting: 'myroom.section.lighting',
  decor: 'myroom.section.decor',
};

/** `list` in sections, in SECTION_ORDER, each keeping the list's own order; empty sections left out. */
export function bySection<T>(list: readonly T[], categoryOf: (x: T) => string | null | undefined): { section: ShopSection; items: T[] }[] {
  return SECTION_ORDER
    .map(section => ({ section, items: list.filter(x => sectionOf(categoryOf(x)) === section) }))
    .filter(g => g.items.length > 0);
}
