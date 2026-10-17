import { roomExit } from '../src/features/counseling/exitRoute';

const stack = (...names: string[]) => names.map(name => ({ name }));

describe('roomExit — where the consultation room leaves to', () => {
  it('opened from 2D: back to the 2D screen, past the setup steps', () => {
    const routes = stack('Tabs', 'CounselorDetail', 'CounselingSubject', 'CounselingRoom');
    expect(roomExit(routes, 3)).toEqual({ pops: 3, to: 'Tabs' });
  });

  it('opened from the World: back to the World', () => {
    const routes = stack('Tabs', 'World', 'CounselorDetail', 'CounselingSubject', 'CounselingTopic', 'CounselingRoom');
    expect(roomExit(routes, 5)).toEqual({ pops: 4, to: 'World' });
  });

  it('a World left under a 2D Home (navigate pushed a second Tabs) does not pull the player back in', () => {
    const routes = stack('Tabs', 'World', 'Tabs', 'CounselorDetail', 'CounselingSubject', 'CounselingRoom');
    expect(roomExit(routes, 5)).toEqual({ pops: 3, to: 'Tabs' });
  });

  it('resumed from a screen that is not a setup step goes straight back to it', () => {
    expect(roomExit(stack('Tabs', 'Library', 'CounselingRoom'), 2)).toEqual({ pops: 1, to: 'Library' });
  });

  it('nothing under the room: nowhere to pop to', () => {
    expect(roomExit(stack('CounselingRoom'), 0)).toEqual({ pops: 0, to: null });
  });
});
