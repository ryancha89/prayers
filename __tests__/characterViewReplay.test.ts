/**
 * The creator's view is sent on mount — before the CharacterPreview scene exists — and Unity's stage
 * resets to (facing, whole body) when it starts. So the bridge remembers the last CHARACTER_VIEW and
 * sends it again on CHARACTER_READY (review 27-10: the hair step opened on the whole body).
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

it('replays the last view after CHARACTER_READY, covers included', () => {
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.openCharacterPreview({ lang: 'en', playerGender: 'female', playerCharacter: 'xb_f01' });
  bridge.setCharacterView({ yaw: 0, zoom: 0.8, top: 0.15, bottom: 0.33 });   // before any view exists
  bridge.registerView({ postMessage: (_g: string, _m: string, msg: string) => posted.push(msg) });
  posted.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'CHARACTER_READY' }));
  const views = posted.map(p => JSON.parse(p)).filter(m => m.type === 'CHARACTER_VIEW');
  expect(views).toHaveLength(1);
  expect(views[0].payload).toEqual({ yaw: 0, zoom: 0.8, top: 0.15, bottom: 0.33 });
});

it('forgets it on the way out', () => {
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g: string, _m: string, msg: string) => posted.push(msg) });
  bridge.openCharacterPreview({ lang: 'en' });
  bridge.setCharacterView({ yaw: 40, zoom: 1 });
  bridge.closeCharacterPreview();
  bridge.openCharacterPreview({ lang: 'en' });
  posted.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'CHARACTER_READY' }));
  expect(posted.map(p => JSON.parse(p).type)).not.toContain('CHARACTER_VIEW');
});
