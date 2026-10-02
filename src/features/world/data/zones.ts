import type { IconName } from '../../../shared/components/Icon';
import type { TranslationKey } from '../../../shared/i18n';
import type { WorldZone } from '../../counseling/types';

/**
 * The world's five doors (spec 004, "The map"), in the order the Map sheet lists them. `id` is the
 * bridge's zone string — Unity maps it to ZONE_Consultation / ZONE_Meditation / … — so it is not
 * free text. Pet Area, Garden, Shrine and Seasonal are walkable scenery with no door and are not here.
 */
export interface WorldZoneInfo {
  id: WorldZone;
  icon: IconName;
  label: TranslationKey;
  /** One line under the label: what is behind the door (the mockup's "주요 공간별 예시" captions). */
  sub: TranslationKey;
}

export const WORLD_ZONES: readonly WorldZoneInfo[] = [
  { id: 'counseling', icon: 'chat', label: 'world.zone.counseling', sub: 'world.zone.counseling.sub' },
  { id: 'meditation', icon: 'lotus', label: 'world.zone.meditation', sub: 'world.zone.meditation.sub' },
  { id: 'journey', icon: 'train', label: 'world.zone.journey', sub: 'world.zone.journey.sub' },
  { id: 'shop', icon: 'bag', label: 'world.zone.shop', sub: 'world.zone.shop.sub' },
  { id: 'myroom', icon: 'home', label: 'world.zone.myroom', sub: 'world.zone.myroom.sub' },
];

const IDS = new Set<string>(WORLD_ZONES.map(z => z.id));

/** A zone string from Unity that this app has a door for. Anything else (a renamed zone, a Unity
 *  build with a door this build does not know) is ignored rather than opening an empty overlay. */
export const isWorldZone = (v: unknown): v is WorldZone => typeof v === 'string' && IDS.has(v);

export const zoneInfo = (id: WorldZone): WorldZoneInfo => WORLD_ZONES.find(z => z.id === id)!;

/** The meditation room has ONE session (ten minutes, 4-4-6). The mockup's four chips are kept as the
 *  room's menu — every one of them opens that same session — until the room learns more than one. */
export const MEDITATION_CHIPS: readonly { key: TranslationKey; icon: IconName }[] = [
  { key: 'world.med.breath', icon: 'wind' },
  { key: 'world.med.sleep', icon: 'moon' },
  { key: 'world.med.calm', icon: 'heart' },
  { key: 'world.med.energy', icon: 'bolt' },
];

/** The shop's four aisles from the mockup. Nothing is sold in them yet (spec: out of scope). */
export const SHOP_TABS: readonly { key: TranslationKey; icon: IconName }[] = [
  { key: 'world.shop.outfit', icon: 'shirt' },
  { key: 'world.shop.character', icon: 'person' },
  { key: 'world.shop.background', icon: 'image' },
  { key: 'world.shop.item', icon: 'bag' },
];

/**
 * "테오와 상담을…" — the Korean comitative particle follows the name's last syllable: 와 after a
 * vowel (테오와, 유나와, 지호와), 과 after a final consonant (윤정과). Only Korean needs it; other
 * languages get the name as is.
 */
export function koWith(name: string): string {
  const code = name.charCodeAt(name.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return `${name}와`;
  return `${name}${(code - 0xac00) % 28 === 0 ? '와' : '과'}`;
}
