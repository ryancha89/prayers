/**
 * The Prayer Coin — the one picture every mention of Prayer Coins in the app points at.
 *
 * Lives beside the asset rather than in a screen so the home header can show it without pulling
 * the purchase flow along; a header that imports a screen imports its store providers too.
 *
 * The art is cut off its black render background: the coin itself opaque, its glow alpha from
 * luminance (like the splash lotus), so it sits on the app's dark surfaces with no rectangle
 * around it. Square.
 */
export const PRAYER_COIN_ART = require('./prayer-coin.png');
