/**
 * The ride's record (10-08, "이전에 이미 지나간것도 다시 볼수있어야해 기록으로"): during a ride it lists
 * the parts that have played, in journey order; a finished or saved ride lists every open part; a
 * locked part never appears.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import { journeyRecord } from '../src/features/journey/player/journeyPlayer';
import type { JourneyContent, JourneyPart } from '../src/features/journey/types';

const part = (text: string | null, extra: Partial<JourneyPart> = {}): JourneyPart => ({
  momentId: null, unlocked: text != null, label: null, teaser: null, text, cards: [], ...extra,
});

const content: JourneyContent = {
  journey: 'newyear-2027', year: 2027, counselor: 'coldgirl',
  summary: { bestMonths: [], cautionMonths: [], keywords: [], months: [] },
  chapters: [
    { id: 'intro', narration: '', cards: [], parts: [part('출발역 이야기')] },
    { id: 'career', narration: '', cards: [], parts: [
      part('사회운 무료'),
      part('사회운 흐름', { momentId: 'career#0', label: '올해 일의 흐름', cards: [{ at: 0.3, title: '명예의 해', months: [], description: '요약', stars: 4 } as any] }),
      part(null, { momentId: 'career#1', label: '일터에서 벌어질 일' }),
    ] },
    { id: 'wealth', narration: '', cards: [], parts: [part('재물운 무료')] },
  ],
};

describe('journeyRecord', () => {
  it('lists only what has played, in journey order, with labels and cards', () => {
    const r = journeyRecord({ journeyId: 'newyear-2027', content, heard: ['1.1', '0.0', '1.0'], status: 'playing' });
    expect(r.map(x => x.id)).toEqual(['intro', 'career']);
    expect(r[1].parts.map(p => p.text)).toEqual(['사회운 무료', '사회운 흐름']);
    expect(r[1].parts[1]).toMatchObject({ label: '올해 일의 흐름', cards: [{ title: '명예의 해' }] });
  });

  it('lists every open part once the ride is over, never a locked one', () => {
    const r = journeyRecord({ journeyId: 'newyear-2027', content, heard: [], status: 'done' });
    expect(r.map(x => x.id)).toEqual(['intro', 'career', 'wealth']);
    expect(r[1].parts.map(p => p.key)).toEqual(['1.0', '1.1']);
  });

  it('is empty before anything has played', () => {
    expect(journeyRecord({ journeyId: 'newyear-2027', content, heard: [], status: 'playing' })).toEqual([]);
  });

  it('hides an old personal preview from the record until the journey is unlocked', () => {
    const lockedContent = {
      ...content,
      chapters: content.chapters.map(c => ({ ...c, parts: c.parts?.map(p =>
        p.momentId ? { ...p, unlocked: false, text: null, cards: [] } : p) })),
    };
    const rows = journeyRecord({ journeyId: 'newyear-2027', content: lockedContent, heard: ['0.0', '1.0'], status: 'playing' });
    expect(rows.map(r => r.id)).toEqual(['intro']);
  });
});
