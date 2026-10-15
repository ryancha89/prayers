/**
 * My Room's level (the badge's "Lv. N / title"): derived from the player's own activity, never
 * stored. Pinned: the curve (level 1 at zero, gentle at first), the weights, the title bands in all
 * six languages, and what activityFrom counts out of the stores' shapes.
 */
import {
  ACTIVITY_ORDER, MAX_LEVEL, TITLE_BANDS, XP_WEIGHTS, activityFrom, levelOf, levelStartXp, stepXp, titleBand, xpOf,
  type Activity,
} from '../src/features/myroom/level';
import { translate } from '../src/shared/i18n/translations';
import type { ArchiveMemory } from '../src/features/archive/types';
import type { ConversationSummary } from '../src/features/conversations/types';

const none: Activity = {
  checkIns: 0, counselors: 0, questions: 0, diaryEntries: 0, reflections: 0, memories: 0, stations: 0, journeys: 0,
};

describe('the level curve', () => {
  it('starts at level 1 with zero XP', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, xp: 0, intoLevel: 0, levelSpan: 40, progress: 0 });
    expect(levelStartXp(1)).toBe(0);
  });

  it('takes 40 XP for the first step, then 10 more per level', () => {
    expect(stepXp(1)).toBe(40);
    expect(stepXp(2)).toBe(50);
    expect(levelStartXp(2)).toBe(40);
    expect(levelStartXp(3)).toBe(90);
    expect(levelOf(39).level).toBe(1);
    expect(levelOf(40).level).toBe(2);
    expect(levelOf(89).level).toBe(2);
    expect(levelOf(90).level).toBe(3);
  });

  it('is gentle at the start: four check-ins are level 2; a fortnight of check-ins and pages is level 5+', () => {
    expect(levelOf(xpOf({ ...none, checkIns: 4 }).total).level).toBe(2);
    expect(levelOf(xpOf({ ...none, checkIns: 14, diaryEntries: 7 }).total).level).toBeGreaterThanOrEqual(5);
  });

  it('every level begins exactly where the last one ended, and progress stays in 0..1', () => {
    for (let l = 1; l < MAX_LEVEL; l++) {
      expect(levelStartXp(l + 1) - levelStartXp(l)).toBe(stepXp(l));
      const mid = levelStartXp(l) + Math.floor(stepXp(l) / 2);
      const info = levelOf(mid);
      expect(info.level).toBe(l);
      expect(info.progress).toBeGreaterThanOrEqual(0);
      expect(info.progress).toBeLessThan(1);
    }
  });

  it('stops at MAX_LEVEL with a full bar', () => {
    const top = levelOf(levelStartXp(MAX_LEVEL) + 1_000_000);
    expect(top.level).toBe(MAX_LEVEL);
    expect(top.levelSpan).toBe(0);
    expect(top.progress).toBe(1);
    expect(top.nextTitleAt).toBeNull();
  });

  it('treats junk as zero', () => {
    expect(levelOf(-5).level).toBe(1);
    expect(levelOf(Number.NaN).level).toBe(1);
    expect(xpOf({ ...none, checkIns: -3, questions: Number.NaN }).total).toBe(0);
  });
});

describe('XP by source', () => {
  it('sums count × weight and reports each source', () => {
    const a: Activity = { checkIns: 3, counselors: 2, questions: 10, diaryEntries: 4, reflections: 1, memories: 5, stations: 6, journeys: 1 };
    const { total, by } = xpOf(a);
    expect(by.checkIns).toBe(3 * XP_WEIGHTS.checkIns);
    expect(by.journeys).toBe(XP_WEIGHTS.journeys);
    expect(total).toBe(ACTIVITY_ORDER.reduce((n, k) => n + a[k] * XP_WEIGHTS[k], 0));
  });

  it('lists every source once in the sheet', () => {
    expect([...ACTIVITY_ORDER].sort()).toEqual(Object.keys(none).sort());
  });
});

describe('titles', () => {
  it('bands: 1–4 새내기 여행자, 20–34 방랑하는 별, 80+ 하늘의 길잡이', () => {
    const ko = (l: number) => translate('ko', titleBand(l).key);
    expect(ko(1)).toBe('새내기 여행자');
    expect(ko(4)).toBe('새내기 여행자');
    expect(ko(5)).not.toBe('새내기 여행자');
    expect(ko(20)).toBe('방랑하는 별');
    expect(ko(34)).toBe('방랑하는 별');
    expect(ko(80)).toBe('하늘의 길잡이');
    expect(titleBand(4).next).toBe(5);
    expect(levelOf(0).nextTitleAt).toBe(5);
  });

  it('every title is in all six languages, and the bands climb', () => {
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const)
      for (const b of TITLE_BANDS) expect(translate(lang, b.key)).not.toBe(b.key);
    TITLE_BANDS.forEach((b, i) => { if (i > 0) expect(b.from).toBeGreaterThan(TITLE_BANDS[i - 1].from); });
    expect(TITLE_BANDS[0].from).toBe(1);
  });
});

describe('activityFrom — counting the stores', () => {
  const mem = (id: string, category: ArchiveMemory['category']): ArchiveMemory => ({
    id, category, content: id, details: {}, importance: 2, confidence: 1, source: 'manual', aiEnabled: true,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
  });
  const convo = (id: string, userTurns: number): ConversationSummary => ({
    sessionId: id, counselorId: 'c', counselorName: 'C', counselorAccent: '#000', lastMessage: '', updatedAt: '',
    messages: [
      ...Array.from({ length: userTurns }, (_, i) => ({ id: `u${i}`, role: 'user' as const, text: 'q', at: '' })),
      { id: 'r', role: 'counselor' as const, text: 'a', at: '' },
    ],
  });
  const reflection = (status: 'pending' | 'ready' | 'fallback') =>
    ({ status, text: '', topics: [], counselor: 'sunyeo', lang: 'ko', stale: false });

  it('counts each source from where it lives', () => {
    const a = activityFrom({
      checkIns: 7,
      conversations: [convo('s1', 3), convo('s2', 2)],
      memories: [mem('d1', 'diary'), mem('g1', 'goal'), mem('p1', 'profile'), mem('i1', 'interest')],
      reflections: { d1: reflection('ready'), g1: reflection('pending'), gone: reflection('ready') },
      heard: { j1: ['a', 'b'], j2: ['c'] },
      journeysFinished: 1,
    });
    expect(a).toEqual({
      checkIns: 7, counselors: 2, questions: 5, diaryEntries: 2,
      // Only ready readings of entries that still exist: g1 is pending, `gone` was deleted.
      reflections: 1,
      memories: 2, stations: 3, journeys: 1,
    });
  });

  it('an unknown check-in count is zero, not a failure', () => {
    const a = activityFrom({ checkIns: null, conversations: [], memories: [], reflections: {}, heard: {}, journeysFinished: 0 });
    expect(a).toEqual(none);
    expect(levelOf(xpOf(a).total).level).toBe(1);
  });
});
