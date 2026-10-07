import type { TranslationKey } from '../../shared/i18n';

type T = (k: TranslationKey) => string;

/** A piece's name (`myroom.item.<Prefab>`); '' for one with no name in the tables — the prompt then
 *  shows the button without the chip, and the shop skips the piece (spec 005: a client that does not
 *  know an id yet leaves it out). */
export function itemName(t: T, item: string): string {
  const key = `myroom.item.${item}` as TranslationKey;
  const name = t(key);
  return name === key ? '' : name;
}

export function themeName(t: T, theme: string): string {
  const key = `myroom.theme.${theme}` as TranslationKey;
  const name = t(key);
  return name === key ? '' : name;
}

/** A shop sku's name: `item:Sofa` → 소파, `theme:modern` → 모던; '' when unknown. */
export function pieceName(t: T, sku: string): string {
  const [kind, id = ''] = sku.split(':', 2);
  if (kind === 'item') return itemName(t, id);
  if (kind === 'theme') return themeName(t, id);
  return '';
}
