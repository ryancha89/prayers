/**
 * Spec 006 T020 — the Write sheet.
 *
 * Pinned: the counter counts code points and refuses the 1,001st (an emoji is 1, not 2); Save is
 * off with no text, and for a Diary with no mood; the counsellor picker preselects the most recent
 * conversation's counsellor, else Yuna (`sunyeo`), and saves the choice as a TONE; an offline Save
 * still saves (the row stays dirty for the next push) and stamps moodScale "2".
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ apiHeaders: async () => null, authedFetch: async () => null }));

import { DiaryWriteSheet, canSave } from '../src/features/myroom/diary/components/DiaryWriteSheet';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useLanguageStore } from '../src/shared/i18n';
import { defaultDiaryTone, diaryCounselors } from '../src/features/myroom/diary/counselors';

const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) => r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
const textOf = (r: ReactTestRenderer.ReactTestRenderer, id: string) => {
  const n = r.root.findAll(x => x.props.testID === id)[0];
  return ([] as unknown[]).concat(n.props.children).join('');
};

async function open(props: Partial<React.ComponentProps<typeof DiaryWriteSheet>> = {}) {
  const onSaved = jest.fn();
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<DiaryWriteSheet onClose={jest.fn()} onSaved={onSaved} {...props} />);
  });
  return { r, onSaved };
}

beforeEach(() => {
  useLanguageStore.setState({ lang: 'en' } as never);
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useConversationsStore.setState({ byId: {}, order: [] } as never);
});

describe('the entry’s counsellor (not asked on Write, 08-10)', () => {
  it('offers the four consultable counsellors, by tone', () => {
    expect(diaryCounselors('en').map(c => c.tone).sort()).toEqual(['coldgirl', 'dosa', 'sudam', 'sunyeo']);
  });

  it('preselects the most recent conversation, else Yuna', () => {
    expect(defaultDiaryTone([], 'en')).toBe('sunyeo');
    expect(defaultDiaryTone(['nabi', 'theo', 'jiho'], 'en')).toBe('sudam'); // nabi cannot read a diary
    expect(defaultDiaryTone(['jiho'], 'en')).toBe('dosa');
  });
});

describe('Write', () => {
  it('counts code points and refuses the 1,001st', async () => {
    const { r } = await open();
    const input = byId(r, 'diary-text');
    await act(async () => input.props.onChangeText('😀'.repeat(999) + 'ab'));
    expect(textOf(r, 'diary-counter')).toBe('1000/1000');
    expect([...byId(r, 'diary-text').props.value].length).toBe(1000);
    expect(byId(r, 'diary-text').props.value.endsWith('😀a')).toBe(true);
    expect(byId(r, 'diary-text').props.maxLength).toBeUndefined();
  });

  it('keeps Save off with no text, and for a Diary with no mood', () => {
    expect(canSave('diary', '', 'great')).toBe(false);
    expect(canSave('diary', 'hi', undefined)).toBe(false);
    expect(canSave('diary', 'hi', 'great')).toBe(true);
    expect(canSave('wish', 'hi', undefined)).toBe(true);
    expect(canSave('plan', '   ', undefined)).toBe(false);
  });

  it('does not step past today', async () => {
    const { r } = await open();
    expect(byId(r, 'diary-date-next').props.disabled).toBe(true);
    await act(async () => byId(r, 'diary-date-prev').props.onPress());
    expect(byId(r, 'diary-date-next').props.disabled).toBe(false);
  });

  it('saves offline on the phone, with the latest conversation’s counsellor as a tone and the mood marker; no picker shown', async () => {
    useConversationsStore.setState({
      order: ['session_yunjung_self'],
      byId: { session_yunjung_self: { sessionId: 'session_yunjung_self', counselorId: 'yunjung' } },
    } as never);
    const { r, onSaved } = await open();
    expect(r.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('diary-counselor-'))).toHaveLength(0);
    expect(byId(r, 'diary-save').props.disabled).toBe(true);
    await act(async () => byId(r, 'diary-text').props.onChangeText('Long day at work.'));
    expect(byId(r, 'diary-save').props.disabled).toBe(true); // no mood yet
    await act(async () => byId(r, 'diary-mood-tired').props.onPress());
    await act(async () => byId(r, 'diary-save').props.onPress());

    const s = useArchiveStore.getState();
    expect(s.memories).toHaveLength(1);
    expect(s.memories[0]).toMatchObject({
      category: 'diary', content: 'Long day at work.', source: 'diary',
      details: { mood: 'tired', counselor: 'coldgirl', moodScale: '2' },
    });
    expect(s.memories[0].details.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.dirty).toEqual([s.memories[0].id]); // still to push
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: s.memories[0].id }), false);
  });

  it('a Wish has no mood row and saves into the goals group', async () => {
    const { r } = await open({ initialKind: 'wish' });
    expect(r.root.findAll(n => n.props.testID === 'diary-mood-great')).toHaveLength(0);
    await act(async () => byId(r, 'diary-text').props.onChangeText('See the aurora'));
    await act(async () => byId(r, 'diary-save').props.onPress());
    expect(useArchiveStore.getState().memories[0]).toMatchObject({ category: 'wish', details: { counselor: 'sunyeo' } });
    expect(useArchiveStore.getState().memories[0].details.mood).toBeUndefined();
  });

  it('editing keeps the kind and the counsellor saved on the entry', async () => {
    const m = useArchiveStore.getState().add({ category: 'goal', content: 'Run 10k', details: { status: 'doing', date: '2026-10-01', counselor: 'sudam' } });
    const { r } = await open({ editing: m });
    expect(byId(r, 'diary-kind-diary').props.disabled).toBe(true);
    await act(async () => byId(r, 'diary-text').props.onChangeText('Run 10k in under an hour'));
    await act(async () => byId(r, 'diary-save').props.onPress());
    expect(useArchiveStore.getState().memories[0]).toMatchObject({
      id: m.id, category: 'goal', content: 'Run 10k in under an hour', details: { status: 'doing', counselor: 'sudam', date: '2026-10-01' },
    });
  });
});
