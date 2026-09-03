import { devlog } from '../../../shared/devlog';
import {
  RNToUnityEvent,
  UnityBridge,
  UnitySessionPayload,
  UnityToRNEvent,
} from '../types';

/**
 * Real Unity bridge backed by @azesmway/react-native-unity (spec §39, §41).
 *
 * Transport model:
 *  - RN → Unity: `UnityView.postMessage('RNBridge', 'OnMessage', json)` — the
 *    Unity project has an `RNBridge` GameObject whose `OnMessage(string)`
 *    receives every event.
 *  - Unity → RN: Unity calls NativeAPI.sendMessageToMobileApp(json), delivered
 *    here via `UnityHost`'s onUnityMessage → `receiveFromUnity`.
 *
 * Lifecycle: `openCounselingRoom` only records the session payload — Unity
 * actually boots when a `UnityHost` mounts and registers its view ref. The
 * handshake then has two halves, and they mean different things:
 *   BRIDGE_READY — the player is up and empty. We answer with SESSION_INIT,
 *                  which is what makes it load the room.
 *   UNITY_READY  — the room is up and the counselor seated. Only now do stage
 *                  commands land, so this is what flips `ready` and flushes.
 * Callers can `sendEvent` at any time without caring about boot order (latency
 * masking: the greeting request runs while Unity is still loading).
 */

/** Minimal surface of the UnityView ref we depend on. */
export interface UnityViewLike {
  postMessage(gameObject: string, methodName: string, message: string): void;
}

const BRIDGE_OBJECT = 'RNBridge';
const BRIDGE_METHOD = 'OnMessage';

export class NativeUnityBridge implements UnityBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private view: UnityViewLike | null = null;
  private ready = false;
  /** Unity booted at least once this process — iOS UaaL never truly unloads,
   *  so a re-entry RESUMES that instance and no spontaneous UNITY_READY comes. */
  private everReady = false;
  private initSent = false;
  private payload?: UnitySessionPayload;
  private outbox: RNToUnityEvent[] = [];

  /* ---- UnityBridge ---- */

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.payload = payload;
    this.initSent = false;
    // Resume path: the surviving Unity instance won't announce itself, so WE
    // open the session — it reloads the consult scene and re-sends UNITY_READY.
    if (this.view && this.everReady) {
      this.post({ type: 'SESSION_INIT', payload });
      this.initSent = true;
    }
  }

  sendEvent(event: RNToUnityEvent): void {
    if (!this.ready) {
      this.outbox.push(event);
      return;
    }
    this.post(event);
  }

  onEvent(handler: (event: UnityToRNEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async closeCounselingRoom(): Promise<void> {
    // Silence Unity NOW — the view unload that follows is asynchronous, and a
    // BGM outliving the room (or an error exit) is exactly the bug this guards.
    if (this.view) this.post({ type: 'SESSION_END' });
    this.ready = false;
    this.outbox = [];
    this.payload = undefined;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /**
   * A previous JS context booted Unity and this one inherited it (Metro
   * reload). The native UnityLifecycle module already silenced it; recording
   * everReady makes the next room entry take the resume path (SESSION_INIT on
   * registerView) instead of waiting forever for a UNITY_READY.
   */
  markSurvivor(): void {
    this.everReady = true;
  }

  /* ---- Wiring used by UnityHost ---- */

  registerView(view: UnityViewLike): void {
    this.view = view;
    // Resume path — the host just re-mounted over the surviving Unity
    // instance; open the session now (see openCounselingRoom).
    if (this.everReady && this.payload && !this.initSent) {
      this.post({ type: 'SESSION_INIT', payload: this.payload });
      this.initSent = true;
    }
  }

  unregisterView(view: UnityViewLike): void {
    if (this.view === view) {
      this.view = null;
      this.ready = false;
    }
  }

  /**
   * Best-effort global mute — sent whenever the app is anywhere but the
   * consultation room (navigation guard in App.tsx). Idempotent; a no-op
   * when Unity was never booted.
   */
  stopAllAudio(): void {
    try {
      if (this.view) this.post({ type: 'SESSION_END' });
    } catch {}
  }

  /** Raw JSON string arriving from Unity via onUnityMessage. */
  receiveFromUnity(raw: string): void {
    let event: UnityToRNEvent;
    try {
      event = JSON.parse(raw) as UnityToRNEvent;
    } catch {
      console.warn('[NativeUnityBridge] non-JSON message from Unity:', raw);
      return;
    }

    // The JS twin of Unity's BridgeTap, and the only place this direction can
    // be watched from. Unity's own Debug.Log does NOT reach the device log once
    // the player runs embedded inside a host app — only its two startup banners
    // do — so on a device this line is the whole Unity->RN trace. Metro shows it.
    devlog('[unity<-] ' + raw);

    // Cold boot: the player is up but empty. SESSION_INIT is what loads the
    // room, so it has to go out HERE — waiting for UNITY_READY would wait for
    // a room that only this message creates. Not `ready`: the room does not
    // exist yet and stage commands sent now are dropped on the far side.
    if (event.type === 'BRIDGE_READY') {
      this.everReady = true;
      if (!this.initSent && this.payload) {
        this.post({ type: 'SESSION_INIT', payload: this.payload });
        this.initSent = true;
      }
    }

    if (event.type === 'UNITY_READY') {
      this.ready = true;
      this.everReady = true;
      if (!this.initSent && this.payload) {
        this.post({ type: 'SESSION_INIT', payload: this.payload });
        this.initSent = true;
      }
      const queued = this.outbox;
      this.outbox = [];
      queued.forEach(e => this.post(e));
    }

    this.handlers.forEach(h => h(event));
  }

  private post(event: RNToUnityEvent): void {
    if (!this.view) {
      // Not a drop: it goes out when UNITY_READY flushes the outbox. Worth
      // seeing, because a command queued here and never flushed looks exactly
      // like a command Unity ignored.
      devlog('[unity-> queued] ' + event.type);
      this.outbox.push(event);
      return;
    }
    devlog('[unity->] ' + JSON.stringify(event));
    this.view.postMessage(BRIDGE_OBJECT, BRIDGE_METHOD, JSON.stringify(event));
  }
}
