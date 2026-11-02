// The stored outfit value (02-11): style + top + bottom, the old one-set forms still read.
import { GARMENTS_ON, encodeOutfit, knownOutfit, parseOutfit } from '../src/features/character/outfitColors';

const withGarments = GARMENTS_ON ? it : it.skip;

withGarments('reads the old forms and the new one', () => {
  expect(parseOutfit('', 'xb_f01')).toEqual({ style: '', top: '', bottom: '' });
  expect(parseOutfit('#2E3A5C', 'xb_f01')).toEqual({ style: '#2E3A5C', top: '', bottom: '' });
  expect(parseOutfit('set:school', 'xb_f01')).toEqual({ style: 'school', top: '', bottom: '' });
  expect(parseOutfit('set:jeans', 'xb_f01')).toEqual({ style: '', top: '', bottom: 'jeans' });
  expect(parseOutfit('set:hoodie', 'xb_m01')).toEqual({ style: '', top: 'hoodie', bottom: '' });
  expect(parseOutfit('s=winter;t=knit;b=midi', 'xb_f01')).toEqual({ style: 'winter', top: 'knit', bottom: 'midi' });
});

withGarments('drops what the body has not got', () => {
  expect(knownOutfit('s=winter;t=knit;b=midi', 'xb_m01')).toBe('t=knit');    // her style and midi drop; he has a knit too
  expect(knownOutfit('s=smart;t=hoodie', 'xb_m01')).toBe('s=smart;t=hoodie');
  expect(knownOutfit('t=knit;b=jeans', 'xb_m01')).toBe('t=knit;b=jeans');                // his own knit and jeans
  expect(knownOutfit('b=midi', 'xb_m01')).toBe('');
  expect(knownOutfit('#123456', 'xb_f01')).toBe('');                          // a colour the palette dropped
});

it('stores the short form when no garment is worn, and fits the 32-character column', () => {
  expect(encodeOutfit({ style: 'school', top: '', bottom: '' })).toBe('set:school');
  expect(encodeOutfit({ style: '#2E3A5C', top: '', bottom: '' })).toBe('#2E3A5C');
  expect(encodeOutfit({ style: '', top: 'hoodie', bottom: 'jeans' })).toBe('t=hoodie;b=jeans');
  expect(encodeOutfit({ style: '#2E3A5C', top: 'hoodie', bottom: 'midi' }).length).toBeLessThanOrEqual(32);
});

it('while the garments are hidden, a stored top or bottom falls back to the artist\'s own (style kept)', () => {
  if (GARMENTS_ON) return;
  expect(knownOutfit('s=winter;t=knit;b=jeans', 'xb_f01')).toBe('set:winter');
  expect(knownOutfit('set:hoodie', 'xb_m01')).toBe('');
  expect(knownOutfit('set:school', 'xb_f01')).toBe('set:school');
  expect(knownOutfit('#2E3A5C', 'xb_f01')).toBe('#2E3A5C');
});
