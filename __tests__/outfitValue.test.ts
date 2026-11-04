// The stored outfit value (04-11): `t=<item>[:<variant>];b=<item>[:<variant>]`, the older forms still read.
import {
  OUTFIT_COLORS, OUTFIT_MAX_LENGTH, encodeOutfit, knownOutfit, parseOutfit, randomOutfit, withItem, wornSet,
  type Outfit,
} from '../src/features/character/outfitCatalog';

const orig = { id: 'orig', variant: '' };
const r = (id: string, variant = '') => ({ id, variant });

describe('the legacy forms', () => {
  it('"" is the artist\'s own look', () => {
    expect(parseOutfit('', 'xb_f01')).toEqual({ top: orig, bottom: orig });
    expect(parseOutfit(undefined, 'xb_m01')).toEqual({ top: orig, bottom: orig });
  });

  it('a bare colour tints both of the artist\'s pieces', () => {
    expect(parseOutfit('#2E3A5C', 'xb_f01')).toEqual({ top: r('orig', '#2E3A5C'), bottom: r('orig', '#2E3A5C') });
    expect(parseOutfit('#2e3a5c', 'xb_f01')).toEqual({ top: r('orig', '#2E3A5C'), bottom: r('orig', '#2E3A5C') });
    expect(parseOutfit('#123456', 'xb_f01')).toEqual({ top: orig, bottom: orig });   // not in the palette
  });

  it('set:<painted> repaints both pieces; set:<garment> wears it in its slot', () => {
    expect(parseOutfit('set:school', 'xb_f01')).toEqual({ top: r('orig', 'school'), bottom: r('orig', 'school') });
    expect(parseOutfit('set:jeans', 'xb_f01')).toEqual({ top: orig, bottom: r('jeans') });
    expect(parseOutfit('set:hoodie', 'xb_m01')).toEqual({ top: r('hoodie'), bottom: orig });
    expect(parseOutfit('set:denim', 'xb_f01')).toEqual({ top: orig, bottom: orig });   // his set on her body
  });

  it('s=S;t=T;b=B: the style becomes the variant of each slot left on the artist\'s piece', () => {
    expect(parseOutfit('s=winter;t=knit;b=midi', 'xb_f01')).toEqual({ top: r('knit'), bottom: r('midi') });
    expect(parseOutfit('s=winter;b=jeans', 'xb_f01')).toEqual({ top: r('orig', 'winter'), bottom: r('jeans') });
    expect(parseOutfit('s=#7A2E3B;t=hoodie', 'xb_m01')).toEqual({ top: r('hoodie'), bottom: r('orig', '#7A2E3B') });
    expect(parseOutfit('s=smart', 'xb_m01')).toEqual({ top: r('orig', 'smart'), bottom: r('orig', 'smart') });
    expect(parseOutfit('t=;b=', 'xb_m01')).toEqual({ top: orig, bottom: orig });
  });
});

describe('the canonical form', () => {
  it('reads item:variant per slot', () => {
    expect(parseOutfit('t=hoodie', 'xb_m01')).toEqual({ top: r('hoodie'), bottom: orig });
    expect(parseOutfit('b=orig:school', 'xb_f01')).toEqual({ top: orig, bottom: r('orig', 'school') });
    expect(parseOutfit('t=orig:#2E3A5C;b=orig:#2E3A5C', 'xb_f01')).toEqual({ top: r('orig', '#2E3A5C'), bottom: r('orig', '#2E3A5C') });
    expect(parseOutfit('t=knit:#7A2E3B;b=chinos', 'xb_m01')).toEqual({ top: r('knit', '#7A2E3B'), bottom: r('chinos') });
  });

  it('encodes, leaving out a part that is the artist\'s own piece untinted', () => {
    expect(encodeOutfit({ top: orig, bottom: orig })).toBe('');
    expect(encodeOutfit({ top: r('hoodie'), bottom: orig })).toBe('t=hoodie');
    expect(encodeOutfit({ top: orig, bottom: r('orig', 'school') })).toBe('b=orig:school');
    expect(encodeOutfit({ top: r('orig', '#2E3A5C'), bottom: r('orig', '#2E3A5C') })).toBe('t=orig:#2E3A5C;b=orig:#2E3A5C');
    expect(encodeOutfit({ top: r('knit', '#7A2E3B'), bottom: r('chinos') })).toBe('t=knit:#7A2E3B;b=chinos');
  });

  it('round-trips through knownOutfit', () => {
    for (const v of ['', 't=hoodie', 'b=orig:school', 't=orig:#2E3A5C;b=orig:#2E3A5C', 't=shirt:#D49AA2;b=chinos:#3E3E44']) {
      expect(knownOutfit(v, 'xb_f01')).toBe(v);
    }
  });

  it('the longest value fits the 64-character column', () => {
    const longest: Outfit = { top: r('hoodie', '#EDE4D0'), bottom: r('chinos', '#EDE4D0') };
    expect(encodeOutfit(longest).length).toBeLessThanOrEqual(OUTFIT_MAX_LENGTH);
    expect(OUTFIT_MAX_LENGTH).toBe(64);
  });
});

describe('what a body cannot wear', () => {
  it('another body\'s items and painted sets fall back to the artist\'s own', () => {
    expect(knownOutfit('t=knit;b=midi', 'xb_m01')).toBe('t=knit');             // he has a knit too, no midi
    expect(knownOutfit('t=tee;b=jeans', 'xb_f01')).toBe('b=jeans');            // her tee is off
    expect(knownOutfit('t=orig:smart;b=orig:smart', 'xb_f01')).toBe('');      // his repaint
    expect(knownOutfit('b=orig:school', 'xb_m01')).toBe('');
    expect(knownOutfit('t=cape;b=orig', 'xb_m01')).toBe('');
    expect(knownOutfit('t=hoodie', undefined)).toBe('');
  });

  it('a painted set on a garment is dropped (tints stay on everything)', () => {
    expect(knownOutfit('t=hoodie:school;b=jeans:school', 'xb_f01')).toBe('t=hoodie;b=jeans');
    expect(knownOutfit('t=hoodie:#8FA48A;b=jeans:#8FA48A', 'xb_f01')).toBe('t=hoodie:#8FA48A;b=jeans:#8FA48A');
    expect(knownOutfit('t=orig:#123456', 'xb_f01')).toBe('');                 // a colour the palette dropped
  });

  it('switching the item keeps a tint and drops a repaint', () => {
    expect(withItem({ top: r('orig', '#2E3A5C'), bottom: orig }, 'top', 'knit')).toEqual({ top: r('knit', '#2E3A5C'), bottom: orig });
    expect(withItem({ top: r('orig', 'school'), bottom: orig }, 'top', 'knit')).toEqual({ top: r('knit'), bottom: orig });
  });
});

describe('sets', () => {
  it('a set is worn when both parts match exactly, variant included', () => {
    expect(wornSet(parseOutfit('', 'xb_m01'), 'xb_m01')?.id).toBe('original');
    expect(wornSet(parseOutfit('t=orig:smart;b=orig:smart', 'xb_m01'), 'xb_m01')?.id).toBe('smart');
    expect(wornSet(parseOutfit('t=hoodie;b=jeans', 'xb_m01'), 'xb_m01')?.id).toBe('casual');
    expect(wornSet(parseOutfit('t=knit;b=midi', 'xb_f01'), 'xb_f01')?.id).toBe('campus');
    expect(wornSet(parseOutfit('t=shirt;b=chinos', 'xb_f01'), 'xb_f01')?.id).toBe('weekend');
    expect(wornSet(parseOutfit('t=tee;b=jeans', 'xb_m01'), 'xb_m01')?.id).toBe('street');
  });

  it('anything else is "Custom" (no set)', () => {
    expect(wornSet(parseOutfit('t=hoodie:#2E3A5C;b=jeans', 'xb_m01'), 'xb_m01')).toBeUndefined();
    expect(wornSet(parseOutfit('t=orig:smart', 'xb_m01'), 'xb_m01')).toBeUndefined();
    expect(wornSet(parseOutfit('t=hoodie', 'xb_m01'), 'xb_m01')).toBeUndefined();
  });

  it('the dice: a set, then a palette tint on each part with a 50% chance', () => {
    // rand: set index, then (tint? , which) per part — top tinted sand, bottom left as the set has it
    const seq = [0.2, 0.1, 0.15, 0.9];
    const out = randomOutfit('xb_m01', () => seq.shift() ?? 0);
    expect(out.top).toEqual(r('orig', OUTFIT_COLORS[2].hex));
    expect(out.bottom).toEqual(r('orig', 'smart'));
    expect(randomOutfit('nobody')).toEqual({ top: orig, bottom: orig });
    for (let i = 0; i < 20; i++) {
      const o = randomOutfit('xb_f01');
      expect(knownOutfit(encodeOutfit(o), 'xb_f01')).toBe(encodeOutfit(o));
    }
  });
});
