/**
 * Icons are drawn (shared/components/Icon), never typed into a string (14-10: "vẽ luôn các icon
 * còn thiếu"). A ✓ or → at the end of a translation draws in whatever font has it, at whatever
 * weight, beside a stroke icon set — and on the simulator's font set some came out as "?" boxes.
 *
 * Pinned: no translation, in any of the six tables, carries an arrow, a tick, a star, a heart or a
 * chevron; the icons that replaced them exist; and a star rating is drawn and read out as "4 of 5".
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { translations } from '../src/shared/i18n/translations';
import { Icon, ICON_NAMES, type IconName } from '../src/shared/components/Icon';
import { StarRating } from '../src/shared/components/StarRating';
import { useLanguageStore } from '../src/shared/i18n';

const GLYPH = /[←→↑↓↺↻↰↱↶↷⟲⟳⤺⤻✕✖✗✓✔☐☑★☆♥♡⇄⇆›‹▶◀✦]/u;

it('no translation carries a glyph icon', () => {
  const hits: string[] = [];
  for (const [lang, table] of Object.entries(translations)) {
    for (const [key, value] of Object.entries(table as Record<string, string>)) {
      if (GLYPH.test(value)) hits.push(`${lang} ${key}: ${value}`);
    }
  }
  expect(hits).toEqual([]);
});

it('the drawn replacements exist', () => {
  const wanted: IconName[] = ['star', 'starFilled', 'chevronRight', 'check', 'arrowRight', 'sparkle', 'close'];
  for (const name of wanted) expect([name, ICON_NAMES.includes(name)]).toEqual([name, true]);
});

describe('StarRating', () => {
  const render = (el: React.ReactElement) => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(el); });
    return tree;
  };

  it('draws the count filled and the rest outlined (or faint and filled), read out as "4 of 5"', () => {
    act(() => { useLanguageStore.setState({ lang: 'en' }); });
    const a = render(<StarRating count={4} color="#E9C46A" testID="r" />);
    expect(a.root.findAll(n => n.type === Icon).map(n => n.props.name)).toEqual(['starFilled', 'starFilled', 'starFilled', 'starFilled', 'star']);
    expect(a.root.findAll(n => n.props.testID === 'r' && typeof n.type === 'string')[0].props.accessibilityLabel).toBe('4 of 5');
    const b = render(<StarRating count={2} color="#E9C46A" offColor="#333" offFilled />);
    expect(b.root.findAll(n => n.type === Icon).map(n => [n.props.name, n.props.color])).toEqual([
      ['starFilled', '#E9C46A'], ['starFilled', '#E9C46A'], ['starFilled', '#333'], ['starFilled', '#333'], ['starFilled', '#333'],
    ]);
  });
});
