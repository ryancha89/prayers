import { ImageSourcePropType } from 'react-native';

/**
 * The counselor artwork, keyed by counselor id.
 *
 * Two shapes because RN shows a counselor in two shapes: a tall 0.82 portrait (card, Discover rail,
 * detail hero) and a square head crop (the 56px conversation-row circle). One asset cannot serve
 * both — a square `cover` of the tall crop centres on the chest and beheads everybody.
 *
 * Static `require` calls, one per file, because Metro resolves them at build time; a computed path
 * (`require(`./${id}.png`)`) throws at runtime. That also makes this the single place an image is
 * named: adding a counselor means adding a line here, and a missing line degrades to the accent
 * placeholder rather than crashing.
 *
 * The PNGs are cut by `Tools/gen_counselor_card_art.py` from art drawn per counselor — the two
 * counselors with a 3D model were drawn from renders of that model, the rest from the elemental
 * costume board. See that script's header for why, and do not hand-edit the PNGs; re-run it.
 */
export const COUNSELOR_CARD_ART: Record<string, ImageSourcePropType> = {
  seoyeon: require('./seoyeon.jpg'),
  mina: require('./mina.jpg'),
  yuna: require('./yuna.jpg'),
  harin: require('./harin.jpg'),
  doyun: require('./doyun.jpg'),
  jiho: require('./jiho.jpg'),
  breathe: require('./breathe.jpg'),
  yunjung: require('./yunjung.jpg'),
};

export const COUNSELOR_AVATAR_ART: Record<string, ImageSourcePropType> = {
  seoyeon: require('./seoyeon_avatar.jpg'),
  mina: require('./mina_avatar.jpg'),
  yuna: require('./yuna_avatar.jpg'),
  harin: require('./harin_avatar.jpg'),
  doyun: require('./doyun_avatar.jpg'),
  jiho: require('./jiho_avatar.jpg'),
  breathe: require('./breathe_avatar.jpg'),
  yunjung: require('./yunjung_avatar.jpg'),
};
