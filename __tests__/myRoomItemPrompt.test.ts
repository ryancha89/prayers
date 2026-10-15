import { actIcon, promptOrigin, PROMPT_CLEAR } from '../src/features/myroom/components/ItemPrompt';
import { itemName } from '../src/features/myroom/screens/MyRoomScreen';
import { translate } from '../src/shared/i18n/translations';

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { select: () => {} } }));

const screen = { width: 400, height: 860 };
const safe = { top: 50, bottom: 30, left: 0, right: 0 };

describe('the hanging prompt', () => {
  it('sits its name chip on the anchor', () => {
    expect(promptOrigin(200, 400, 180, 30, screen, safe, 120)).toEqual({ x: 110, y: 370 });
  });

  it('stays inside the screen, under the top bar and above the stick', () => {
    const P = PROMPT_CLEAR.portrait;
    const left = promptOrigin(0, 400, 180, 30, screen, safe, 120);
    expect(left.x).toBe(P.side);
    const right = promptOrigin(400, 400, 180, 30, screen, safe, 120);
    expect(right.x).toBe(400 - P.side - 180);
    expect(promptOrigin(200, 0, 180, 30, screen, safe, 120).y).toBe(safe.top + P.top);
    expect(promptOrigin(200, 860, 180, 30, screen, safe, 120).y).toBe(860 - safe.bottom - P.bottom - 120);
  });

  // 07-10 report: sideways, 72 + 272 left a 58pt strip and every prompt sat in the top band.
  describe('in landscape (iPhone 17 sideways)', () => {
    const side = { width: 874, height: 402 };
    const notch = { top: 0, bottom: 21, left: 62, right: 62 };
    const L = PROMPT_CLEAR.landscape;

    it('hangs on a piece in the middle of the room instead of clamping to the top', () => {
      expect(promptOrigin(437, 200, 220, 30, side, notch, 120)).toEqual({ x: 327, y: 170 });
      // The portrait clearance would have pinned it under the badge, whatever the anchor said.
      const old = promptOrigin(437, 200, 220, 30, side, notch, 120, PROMPT_CLEAR.portrait);
      expect(old.y).toBe(PROMPT_CLEAR.portrait.top);
    });

    it('stops at the bottom row, not 272pt above it', () => {
      expect(promptOrigin(437, 400, 220, 30, side, notch, 120).y).toBe(402 - notch.bottom - L.bottom - 120);
    });

    it('keeps out of the stick and run corners when it reaches down beside them', () => {
      // A piece far left, low: moved right of the stick's corner.
      expect(promptOrigin(100, 200, 220, 30, side, notch, 120).x).toBe(notch.left + L.corner.left);
      // Far right: left of the run button.
      expect(promptOrigin(860, 200, 220, 30, side, notch, 120).x).toBe(874 - notch.right - L.corner.right - 220);
      // High enough to clear the corners: free to sit over them.
      expect(promptOrigin(100, 30, 220, 30, { width: 874, height: 900 }, notch, 120, L).x).toBe(notch.left + L.side);
    });

    it('lifts above the corners when the gap between them is narrower than the prompt', () => {
      const narrow = { width: 600, height: 402 };
      const o = promptOrigin(300, 300, 300, 30, narrow, notch, 120);
      expect(o.y).toBe(Math.max(notch.top + L.top, 402 - notch.bottom - L.corner.height - 120));
    });
  });

  it('has an icon for every action', () => {
    expect(actIcon('sit')).toBe('armchair');
    expect(actIcon('rest')).toBe('bed');
    expect(actIcon('lamp')).toBe('lamp');
    expect(actIcon('look')).toBe('book');
  });

  it('names every usable piece in every language, and nothing for an unknown one', () => {
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const) {
      const t = (k: any) => translate(lang, k);
      for (const item of ['Sofa', 'Armchair', 'Pouf', 'Bed', 'TableLamp', 'GlobeLamp', 'Bookshelf',
        'Desk', 'DiaryBook', 'CoffeeTable', 'Nightstand', 'SideTable', 'RoundRug', 'Plant_Floor', 'Plant_Pot',
        'TeaSet', 'FramedArt_Moon', 'FramedArt_Sun', 'FramedArt_Botanical', 'Curtains', 'HangingIvy', 'DeskChair'])
        expect(itemName(t, item)).not.toBe('');
    }
    expect(itemName(k => translate('ko', k), 'Teapot')).toBe('');
  });
});
