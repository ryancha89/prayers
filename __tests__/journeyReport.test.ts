import { mapReport } from '../src/features/journey/api/journeyApi';

jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn() }));

describe('mapReport', () => {
  const server = {
    status: 'partial',
    progress: { done: 7, total: 11 },
    sections: [
      { id: 'overview', kind: 'text', blocks: [{ moment_id: null, unlocked: true, paragraphs: ['한 문단', ''] }] },
      {
        id: 'career', kind: 'topic', headline: '자리를 굳히는 해', stars: 3, key_months: [1, 9],
        blocks: [
          { moment_id: null, unlocked: true, paragraphs: ['①'] },
          { moment_id: 'career#0', unlocked: false, label: '결정적 시기', teaser: '언제일까?', paragraphs: ['새면 안 됨'] },
        ],
      },
      {
        id: 'quarter-1', kind: 'quarter', months: [4, 5, 6],
        blocks: [{ moment_id: 'monthly#1', unlocked: true, paragraphs: ['봄'] }],
        details: [{ month: 4, ganji: '甲辰', stars: 2, headline: '조심', areas: { career: '직업 문장' } }],
      },
    ],
  };

  it('keeps reading order, drops empty paragraphs and never exposes a locked block', () => {
    const r = mapReport(server);
    expect(r.status).toBe('partial');
    expect(r.progress).toEqual({ done: 7, total: 11 });
    expect(r.sections.map(x => x.id)).toEqual(['overview', 'career', 'quarter-1']);
    expect(r.sections[0].blocks[0].paragraphs).toEqual(['한 문단']);
    const locked = r.sections[1].blocks[1];
    expect(locked).toMatchObject({ momentId: 'career#0', unlocked: false, label: '결정적 시기', paragraphs: null });
    expect(r.sections[1].keyMonths).toEqual([1, 9]);
    expect(r.sections[2].details?.[0].areas?.career).toBe('직업 문장');
  });

  it('treats an unknown status as pending', () => {
    expect(mapReport({ status: 'weird' }).status).toBe('pending');
    expect(mapReport({}).sections).toEqual([]);
  });
});
