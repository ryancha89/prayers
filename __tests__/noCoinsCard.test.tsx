jest.mock('../src/shared/audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { NoCoinsCard } from '../src/features/coins/components/NoCoinsCard';
import { useCoins } from '../src/features/coins/store/coinStore';

function render(onClose = jest.fn()) {
  let tree: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<NoCoinsCard cost={10} onClose={onClose} />);
  });
  return tree!;
}
const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children).join(' | ');

describe('NoCoinsCard — asked for at the question, in the room', () => {
  beforeEach(() => useCoins.setState({ balance: 0, shopOpen: false }));

  it('says what a question costs against what the player holds', () => {
    useCoins.setState({ balance: 4 });
    const t = text(render());
    expect(t).toContain('Not enough Prayer Coins');
    expect(t).toContain('10');
    expect(t).toContain('4');
  });

  it('buying opens the coin shop over the room and closes the card', () => {
    const onClose = jest.fn();
    const tree = render(onClose);
    ReactTestRenderer.act(() => tree.root.findByProps({ testID: 'no-coins-buy' }).props.onPress());
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('closing leaves the player in the room', () => {
    const onClose = jest.fn();
    const tree = render(onClose);
    ReactTestRenderer.act(() => tree.root.findByProps({ testID: 'no-coins-close' }).props.onPress());
    expect(onClose).toHaveBeenCalled();
    expect(useCoins.getState().shopOpen).toBe(false);
  });
});
