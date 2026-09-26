/**
 * 아카이브 — the store the tab and the counsellors share.
 *
 * The rules worth pinning: a discovery is not a memory until the player says so; the switch on a
 * row is respected by what the server sees (it is sent as `aiEnabled`); the meter is reachable;
 * and a pull from the server never overwrites an edit the phone has not pushed yet.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: async (k: string) => {
        store.delete(k);
      },
    },
  };
});

import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { DAILY_QUESTIONS, questionFor } from '../src/features/archive/questions';
import { CATEGORIES, FIELDS } from '../src/features/archive/types';

const reset = () =>
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });

describe('archive store', () => {
  beforeEach(reset);

  it('adds, edits and deletes, and queues each for the server', () => {
    const s = useArchiveStore.getState();
    const m = s.add({ category: 'relationship', content: '지수', details: { relation: 'partner' } });
    expect(useArchiveStore.getState().dirty).toEqual([m.id]);

    useArchiveStore.getState().update(m.id, { content: '지수 (약혼)' });
    expect(useArchiveStore.getState().memories[0].content).toBe('지수 (약혼)');

    useArchiveStore.getState().remove(m.id);
    expect(useArchiveStore.getState().memories).toEqual([]);
    expect(useArchiveStore.getState().dirty).toEqual([]);
    expect(useArchiveStore.getState().deleted).toEqual([m.id]);

    useArchiveStore.getState().pushed([], [m.id]);
    expect(useArchiveStore.getState().deleted).toEqual([]);
  });

  it('keeps a discovery apart until the player keeps it, and marks its source', () => {
    useArchiveStore.getState().addDiscoveries([{ category: 'interest', content: '최근 테니스를 시작함' }], 'session_x');
    expect(useArchiveStore.getState().memories).toEqual([]);
    expect(useArchiveStore.getState().discoveries).toHaveLength(1);

    // The same sentence again is not a second question.
    useArchiveStore.getState().addDiscoveries([{ category: 'interest', content: '최근 테니스를 시작함' }]);
    expect(useArchiveStore.getState().discoveries).toHaveLength(1);

    const id = useArchiveStore.getState().discoveries[0].id;
    useArchiveStore.getState().approveDiscovery(id, { content: '테니스를 배우는 중' });
    const kept = useArchiveStore.getState().memories[0];
    expect(kept).toMatchObject({ category: 'interest', content: '테니스를 배우는 중', source: 'counselor_discovery' });
    expect(kept.confidence).toBeLessThan(1);
    expect(useArchiveStore.getState().discoveries).toEqual([]);
  });

  it('files an unknown discovery category as diary rather than dropping it', () => {
    useArchiveStore.getState().addDiscoveries([{ category: 'mood', content: '요즘 잠을 못 잔다' }]);
    expect(useArchiveStore.getState().discoveries[0].category).toBe('diary');
  });

  it('lets the player keep a row from the counsellors with one switch', () => {
    const m = useArchiveStore.getState().add({ category: 'goal', content: '책 출간', details: { status: 'plan' } });
    useArchiveStore.getState().setAiEnabled(m.id, false);
    expect(useArchiveStore.getState().memories[0].aiEnabled).toBe(false);
    expect(useArchiveStore.getState().dirty).toContain(m.id);
  });

  it('merges a pull under local unpushed edits, and honours a local delete', () => {
    const local = useArchiveStore.getState().add({ category: 'like', content: '밤 드라이브' });
    const gone = useArchiveStore.getState().add({ category: 'like', content: '비 오는 날' });
    useArchiveStore.getState().remove(gone.id);
    const base = { details: {}, importance: 2 as const, confidence: 1, source: 'manual' as const, aiEnabled: true, createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' };
    useArchiveStore.getState().merge([
      { ...base, id: local.id, category: 'like', content: '서버의 옛 값' },
      { ...base, id: gone.id, category: 'like', content: '비 오는 날' },
      { ...base, id: 'srv_1', category: 'goal', content: '유럽 한 달' },
    ]);
    const contents = useArchiveStore.getState().memories.map(m => m.content);
    expect(contents).toContain('밤 드라이브');
    expect(contents).not.toContain('서버의 옛 값');
    expect(contents).not.toContain('비 오는 날');
    expect(contents).toContain('유럽 한 달');
  });

  it('has a meter that can be filled', () => {
    expect(useArchiveStore.getState().completion()).toBe(0);
    CATEGORIES.forEach(c => {
      for (let i = 0; i < 6; i += 1) useArchiveStore.getState().add({ category: c, content: `${c} ${i}` });
    });
    expect(useArchiveStore.getState().completion()).toBe(100);
  });
});

describe('daily question', () => {
  it('is the same all day, never one already answered, and files to a real category', () => {
    const a = questionFor('2026-09-23', []);
    const b = questionFor('2026-09-23', []);
    expect(a).toEqual(b);
    const answered = DAILY_QUESTIONS.map(q => q.id).slice(0, -1);
    const last = questionFor('2026-09-23', answered);
    expect(last?.id).toBe(DAILY_QUESTIONS[DAILY_QUESTIONS.length - 1].id);
    expect(questionFor('2026-09-23', DAILY_QUESTIONS.map(q => q.id))).toBeNull();
    DAILY_QUESTIONS.forEach(q => expect(CATEGORIES).toContain(q.category));
  });

  it('every choice field names options that have a label prefix', () => {
    CATEGORIES.forEach(c =>
      FIELDS[c].forEach(f => {
        if (f.kind === 'choice') {
          expect(f.options?.length).toBeGreaterThan(0);
          expect(f.optionLabelPrefix).toBeTruthy();
        }
      }),
    );
  });
});

describe('archive validation', () => {
  const { validate, validDate, validTime, yearIn } = require('../src/features/archive/validation');
  const spec = (kind: string, key = 'x') => ({ key, kind, label: 'archive.f.name' });

  it('accepts a year written the way people write it, and rejects one that cannot be', () => {
    expect(yearIn('2024')).toBe(2024);
    expect(yearIn('2024년 3월')).toBe(2024);
    expect(yearIn('2206년')).toBeNull();
    expect(yearIn('작년')).toBeNull();
    expect(validate(spec('text', 'since'), '2024년')).toBeNull();
    expect(validate(spec('text', 'since'), '2206년')).toBe('archive.err.year');
    expect(validate(spec('year'), '2021')).toBeNull();
    expect(validate(spec('year'), '21')).toBe('archive.err.year');
  });

  it('only keeps a real calendar date that has already happened', () => {
    expect(validDate('1995-04-12')).toBe(true);
    expect(validDate('1995-02-30')).toBe(false);
    expect(validDate('2999-01-01')).toBe(false);
    expect(validDate('19950412')).toBe(false);
    expect(validate(spec('date'), '1995-04-12')).toBeNull();
    expect(validate(spec('date'), '1995-13-01')).toBe('archive.err.date');
  });

  it('keeps a clock time inside the day', () => {
    expect(validTime('12:30')).toBe(true);
    expect(validTime('24:00')).toBe(false);
    expect(validTime('9:5')).toBe(false);
    expect(validate(spec('time'), '')).toBeNull(); // empty is "unknown", not wrong
  });
});
