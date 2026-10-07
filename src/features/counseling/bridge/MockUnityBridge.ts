import {
  MyRoomAction,
  MyRoomBook,
  MyRoomBridge,
  MyRoomCamera,
  MyRoomInitPayload,
  RNToUnityEvent,
  UnityBridge,
  UnitySessionPayload,
  UnityToRNEvent,
  ViewInsetsPayload,
  WorldBridge,
  WorldInitPayload,
  WorldZone,
} from '../types';

/**
 * JS-only stand-in for the real native Unity bridge (spec §39, §51-P5).
 *
 * The real bridge will forward `sendEvent` to the embedded Unity view and
 * surface Unity → RN events (UNITY_READY, USER_MESSAGE, EXIT_SESSION) through
 * `onEvent`. Until native integration lands, the mock counseling screen drives
 * the same event contract so the entire flow works end-to-end (spec §50).
 *
 * Keep this the ONLY place that knows Unity is not yet real. UI code depends
 * solely on the `UnityBridge` interface (rule §52-7).
 */
export class MockUnityBridge implements UnityBridge, WorldBridge, MyRoomBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private ready = false;
  private lastPayload?: UnitySessionPayload;
  private lastEventType?: string;
  /** The last VIEW_INSETS a screen reported. Nothing renders behind the mock room, so it is only
   *  kept — for tests, and so a screen never needs to know which bridge it has. */
  lastViewInsets?: ViewInsetsPayload;

  /** The world as the mock has it (spec 004): nothing is drawn behind it, so it only remembers. */
  lastWorldInit?: WorldInitPayload;
  worldOpen = false;
  worldRun = false;
  worldCamera: { zoom: number; yaw: number; pitch: number } | null = null;

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.ready = false;
    // Simulate Unity boot + scene load, then announce readiness (spec §41).
    await new Promise<void>(resolve => setTimeout(resolve, 900));
    this.ready = true;
    this.lastPayload = payload;
    this.emitToRN({ type: 'UNITY_READY' });
    // A real bridge would SESSION_INIT into Unity here; the mock room reads the
    // payload directly from navigation params instead.
  }

  sendEvent(event: RNToUnityEvent): void {
    // In the mock, RN → Unity events are consumed by the mock room component,
    // which subscribes via a shared emitter. No-op transport here.
    this.lastEventType = event.type;
  }

  sendViewInsets(insets: ViewInsetsPayload): void {
    this.lastViewInsets = { ...insets };
  }

  /* ---- WorldBridge. Accepts every call; there is no hub to load, so WORLD_READY never comes and
     the world screen stays on its drawn hub — which is the whole no-Unity experience. ---- */

  openWorld(init: WorldInitPayload): void {
    this.lastWorldInit = init;
    this.worldOpen = true;
  }

  closeWorld(): void {
    this.worldOpen = false;
    this.worldRun = false;
    this.worldCamera = null;
  }

  sendWorldRun(on: boolean): void {
    this.worldRun = on;
  }

  lastWorldAudio: { music: boolean; sfx: boolean } | null = null;
  sendWorldAudio(music: boolean, sfx: boolean): void {
    this.lastWorldAudio = { music, sfx };
  }

  /** No NavMesh to walk: the mock "arrives" at once, so Map → door → overlay runs end to end. */
  /** No signs to hit without Unity; the mock's hub art has its own buttons. */
  sendWorldTap(): void {}

  sendWorldGoto(zone: WorldZone): void {
    this.emitToRN({ type: 'WORLD_ARRIVED', payload: { zone } });
    this.emitToRN({ type: 'WORLD_ENTERED', payload: { zone } });
  }

  /** No door to open: the mock is through it at once. */
  sendWorldEnter(zone: WorldZone): void {
    this.emitToRN({ type: 'WORLD_ENTERED', payload: { zone } });
  }

  sendWorldCamera(zoom: number, yaw: number, pitch = 0): void {
    this.worldCamera = { zoom, yaw, pitch };
  }

  /* ---- MyRoomBridge. Accepts every call; no room loads, so MYROOM_READY never comes and the screen
     stays on its picture of the room — the whole no-Unity experience. ---- */

  lastMyRoomInit?: MyRoomInitPayload;
  myRoomOpen = false;
  myRoomCamera: MyRoomCamera | null = null;

  openMyRoom(init: MyRoomInitPayload): void {
    this.lastMyRoomInit = init;
    this.myRoomOpen = true;
  }

  closeMyRoom(): void {
    this.myRoomOpen = false;
    this.myRoomCamera = null;
  }

  sendMyRoomCamera(camera: MyRoomCamera): void {
    this.myRoomCamera = { ...camera };
  }

  /** No room, nothing near: the action button never shows without the player. Recorded for tests. */
  myRoomActs: { uid: string; action: MyRoomAction | null }[] = [];

  sendMyRoomAct(uid: string, action: MyRoomAction): void {
    this.myRoomActs.push({ uid, action });
  }

  endMyRoomAct(): void {
    this.myRoomActs.push({ uid: '', action: null });
  }

  /** The run toggles sent, for tests. */
  myRoomRuns: boolean[] = [];

  sendMyRoomRun(on: boolean): void {
    this.myRoomRuns.push(on);
  }

  /** The pages sent, for tests. `undefined` = never sent. */
  myRoomBooks: (MyRoomBook | null)[] = [];

  sendMyRoomBook(book: MyRoomBook | null): void {
    this.myRoomBooks.push(book);
  }

  onEvent(handler: (event: UnityToRNEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async closeCounselingRoom(): Promise<void> {
    this.ready = false;
    this.handlers.clear();
  }

  /** Test/mock helper — lets the mock room raise Unity → RN events. */
  emitToRN(event: UnityToRNEvent): void {
    this.handlers.forEach(h => h(event));
  }

  get isReady(): boolean {
    return this.ready;
  }
}
