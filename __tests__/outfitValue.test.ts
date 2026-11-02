// The stored outfit value (02-11): style + top + bottom, the old one-set forms still read.
import { encodeOutfit, knownOutfit, parseOutfit } from '../src/features/character/outfitColors';

it('reads the old forms and the new one', () => {
  expect(parseOutfit('', 'xb_f01')).toEqual({ style: '', top: '', bottom: '' });
  expect(parseOutfit('#2E3A5C', 'xb_f01')).toEqual({ style: '#2E3A5C', top: '', bottom: '' });
  expect(parseOutfit('set:school', 'xb_f01')).toEqual({ style: 'school', top: '', bottom: '' });
  expect(parseOutfit('set:jeans', 'xb_f01')).toEqual({ style: '', top: '', bottom: 'jeans' });
  expect(parseOutfit('set:hoodie', 'xb_m01')).toEqual({ style: '', top: 'hoodie', bottom: '' });
  expect(parseOutfit('s=winter;t=knit;b=midi', 'xb_f01')).toEqual({ style: 'winter', top: 'knit', bottom: 'midi' });
});

it('drops what the body has not got', () => {
  expect(knownOutfit('s=winter;t=knit;b=midi', 'xb_m01')).toBe('');          // her pieces on him
  expect(knownOutfit('s=smart;t=hoodie', 'xb_m01')).toBe('s=smart;t=hoodie');
  expect(knownOutfit('#123456', 'xb_f01')).toBe('');                          // a colour the palette dropped
});

it('stores the short form when no garment is worn, and fits the 32-character column', () => {
  expect(encodeOutfit({ style: 'school', top: '', bottom: '' })).toBe('set:school');
  expect(encodeOutfit({ style: '#2E3A5C', top: '', bottom: '' })).toBe('#2E3A5C');
  expect(encodeOutfit({ style: '', top: 'hoodie', bottom: 'jeans' })).toBe('t=hoodie;b=jeans');
  expect(encodeOutfit({ style: '#2E3A5C', top: 'hoodie', bottom: 'midi' }).length).toBeLessThanOrEqual(32);
});
