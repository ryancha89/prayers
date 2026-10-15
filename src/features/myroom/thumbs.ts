import type { ImageSourcePropType } from 'react-native';
import type { IconName } from '../../shared/components/Icon';

/**
 * My Room's preview pictures (14-10): each piece rendered by Unity from its real prefab — transparent,
 * a 3/4 view — and each skin as a picture of the whole room. @2x/@3x sit beside each file.
 *
 * Literal requires, one per file: Metro resolves assets at build time and cannot follow a computed
 * path. A piece or skin with no picture yet (DeskChair, nature…) gets undefined here, and the
 * caller draws a placeholder — a line icon for its category, or the skin's colour swatch.
 */
export const ITEM_THUMB: Record<string, ImageSourcePropType> = {
  Armchair: require('../../assets/myroom/items/Armchair.png'),
  Bed: require('../../assets/myroom/items/Bed.png'),
  Bookshelf: require('../../assets/myroom/items/Bookshelf.png'),
  CoffeeTable: require('../../assets/myroom/items/CoffeeTable.png'),
  Curtains: require('../../assets/myroom/items/Curtains.png'),
  Desk: require('../../assets/myroom/items/Desk.png'),
  DiaryBook: require('../../assets/myroom/items/DiaryBook.png'),
  FramedArt_Botanical: require('../../assets/myroom/items/FramedArt_Botanical.png'),
  FramedArt_Moon: require('../../assets/myroom/items/FramedArt_Moon.png'),
  FramedArt_Sun: require('../../assets/myroom/items/FramedArt_Sun.png'),
  GlobeLamp: require('../../assets/myroom/items/GlobeLamp.png'),
  HangingIvy: require('../../assets/myroom/items/HangingIvy.png'),
  Nightstand: require('../../assets/myroom/items/Nightstand.png'),
  Plant_Floor: require('../../assets/myroom/items/Plant_Floor.png'),
  Plant_Pot: require('../../assets/myroom/items/Plant_Pot.png'),
  Pouf: require('../../assets/myroom/items/Pouf.png'),
  RoundRug: require('../../assets/myroom/items/RoundRug.png'),
  SideTable: require('../../assets/myroom/items/SideTable.png'),
  Sofa: require('../../assets/myroom/items/Sofa.png'),
  TableLamp: require('../../assets/myroom/items/TableLamp.png'),
  TeaSet: require('../../assets/myroom/items/TeaSet.png'),
};

export const SKIN_THUMB: Record<string, ImageSourcePropType> = {
  basic: require('../../assets/myroom/skins/basic.jpg'),
  modern: require('../../assets/myroom/skins/modern.jpg'),
  fantasy: require('../../assets/myroom/skins/fantasy.jpg'),
};

export const itemThumb = (id: string): ImageSourcePropType | undefined => ITEM_THUMB[id];
export const skinThumb = (theme: string): ImageSourcePropType | undefined => SKIN_THUMB[theme];

/** The placeholder's icon, by the catalog's category (server: Prayers::MyRoomCatalog). */
const CATEGORY_GLYPH: Record<string, IconName> = {
  seat: 'armchair',
  bed: 'bed',
  lamp: 'lamp',
  shelf: 'books',
  art: 'image',
  table: 'box',
  decor: 'gift',
  plant: 'sparkle',
  curtain: 'wind',
  rug: 'square',
};
export const placeholderIcon = (category?: string | null): IconName => (category && CATEGORY_GLYPH[category]) || 'box';
