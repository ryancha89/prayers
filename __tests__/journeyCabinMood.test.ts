/**
 * The counsellor's face for a month card (JOURNEY_STATE `mood`, character-setup sheet 06-10) and the
 * ride's jolt (`rough`) read the card the same way: a caution month is never happy.
 */
import { moodOf, roughOf } from '../src/features/journey/player/cabinMood';

describe('cabin mood', () => {
  const card = (stars: number, months: number[] = [3]) => ({ stars, months });

  it('reads the stars', () => {
    expect(moodOf(card(1))).toBe('sad');
    expect(moodOf(card(2))).toBe('serious');
    expect(moodOf(card(3))).toBe('');
    expect(moodOf(card(4))).toBe('happy');
    expect(moodOf(card(5))).toBe('happy');
  });

  it('a best month is happy, a caution month serious — caution wins', () => {
    expect(moodOf(card(3, [7]), [7], [])).toBe('happy');
    expect(moodOf(card(4, [7]), [], [7])).toBe('serious');
    expect(moodOf(card(3, [7]), [7], [7])).toBe('serious');
  });

  it('no card, no face; and rough agrees', () => {
    expect(moodOf(null)).toBe('');
    expect(roughOf(card(1))).toBe(1);
    expect(roughOf(card(4, [7]), [7])).toBe(0.5);
    expect(roughOf(card(4))).toBe(0);
  });
});
