import { devlog } from '../../../shared/devlog';
import {
  MeditationStatePayload,
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

/** How long to wait for an answer before saying SESSION_INIT again, and how many times.
 *  Three goes over 4.5 s sits well inside the screen's own 30 s deadline, so the retries are
 *  invisible when they work and cost nothing when the player really is not there. */
const INIT_RETRY_MS = 1500;
const INIT_MAX_TRIES = 3;
/** MEDITATION_INIT is repeated until the room answers — see openMeditationRoom. */
const MEDITATION_RETRY_MS = 1500;
const MEDITATION_MAX_TRIES = 4;

export class NativeUnityBridge implements UnityBridge {
  private handlers = new Set<(e: UnityToRNEvent) => void>();
  private view: UnityViewLike | null = null;
  private ready = false;
  /** Unity booted at least once this process — iOS UaaL never truly unloads,
   *  so a re-entry RESUMES that instance and no spontaneous UNITY_READY comes. */
  private everReady = false;
  private initSent = false;
  /** Retry timer for the handshake below, and how many goes it has had. */
  private initRetry: ReturnType<typeof setTimeout> | null = null;
  private initTries = 0;
  private payload?: UnitySessionPayload;
  /** A meditation room has been asked for and has not answered yet. The consultation path tracks
   *  the same thing through `payload`; this room has no payload to track it with. */
  private meditationPending = false;
  private meditationRetry: ReturnType<typeof setTimeout> | null = null;
  private meditationTries = 0;
  /** The last session state sent to the room, re-sent when the room answers: Begin can be pressed
   *  while the scene is still loading, and that message reaches a room that is not there yet. */
  private meditationState?: MeditationStatePayload;
  private outbox: RNToUnityEvent[] = [];

  /* ---- UnityBridge ---- */

  async openCounselingRoom(payload: UnitySessionPayload): Promise<void> {
    this.payload = payload;
    this.initSent = false;
    this.initTries = 0;
    // Resume path: the surviving Unity instance won't announce itself, so WE
    // open the session — it reloads the consult scene and re-sends UNITY_READY.
    if (this.view && this.everReady) this.sendInit('resume');
    this.armInitRetry();
  }

  /**
   * Say SESSION_INIT again when nobody has answered.
   *
   * ⚠️ THE HANDSHAKE HAS A RACE, AND IT COSTS THE WHOLE ROOM. Both paths that open a session are
   * conditional on state that arrives asynchronously: `everReady` is set by the native
   * `silenceSurvivingUnity()` PROMISE, and `view` by a React mount. Enter the room in the window
   * before either lands and no SESSION_INIT is ever sent — no BRIDGE_READY is coming either,
   * because the surviving player announced itself to a JS context that no longer exists. Nothing
   * fails, nothing logs: the veil sits there until the screen's 30 s deadline gives up and walks
   * the player out. Seen on device 18-09, and the log is one line long — "the player never answered
   * SESSION_INIT".
   *
   * So the opening is repeated rather than assumed. It is safe to repeat: SESSION_INIT is what
   * loads the room, and re-sending it before the room exists loads it once; after UNITY_READY the
   * retry is cancelled, so it can never reload a session that is already running.
   *
   * ⚠️ IT STOPS AT THE FIRST WORD BACK, not at UNITY_READY. Anything arriving from Unity proves the
   * transport works and the player is listening, and the room takes 5-8 s to load after it answers
   * BRIDGE_READY — re-sending SESSION_INIT during that load would restart the scene load every 1.5 s
   * and the room would never finish coming up. A player that answers and then stalls is the screen
   * deadline's problem, not this one's.
   *
   * Three goes, 1.5 s apart, then it stops and leaves the screen's deadline to do the honest thing.
   */
  private armInitRetry(): void {
    this.clearInitRetry();
    this.initRetry = setTimeout(() => {
      this.initRetry = null;
      if (this.ready || !this.payload || !this.view) return;
      if (this.initTries >= INIT_MAX_TRIES) {
        devlog(`[unity-bridge] no answer after ${this.initTries} SESSION_INIT(s) — giving the room back`);
        return;
      }
      this.sendInit(this.initSent ? 'retry' : 'first');
      this.armInitRetry();
    }, INIT_RETRY_MS);
  }

  private clearInitRetry(): void {
    if (this.initRetry !== null) {
      clearTimeout(this.initRetry);
      this.initRetry = null;
    }
  }

  private sendInit(why: string): void {
    if (!this.payload) return;
    this.initTries += 1;
    this.initSent = true;
    devlog(`[unity-bridge] SESSION_INIT (${why}, try ${this.initTries})`);
    this.post({ type: 'SESSION_INIT', payload: this.payload });
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

  /**
   * Open the meditation room.
   *
   * POSTS DIRECTLY rather than going through sendEvent, and that is the whole reason this method
   * exists. `sendEvent` queues anything sent before `ready`, and `ready` is set by UNITY_READY —
   * a message the meditation room never sends, because it has no counselor to be ready with. Sent
   * the ordinary way, MEDITATION_INIT would sit in the outbox forever and the room would never
   * open, with nothing in the log to say why.
   *
   * No payload, no retry, no ticket. If the view is not mounted yet the message is queued by
   * `post` and flushed when it is — the same path SESSION_INIT already relies on.
   */
  openMeditationRoom(): void {
    this.meditationPending = true;
    this.meditationTries = 0;
    this.meditationState = undefined;
    devlog('[unity-bridge] MEDITATION_INIT');
    this.post({ type: 'MEDITATION_INIT' });
    this.armMeditationRetry();
  }

  /**
   * ⚠️ REPEATED UNTIL MEDITATION_READY, because the first one can be lost with nothing to resend it.
   * Measured 24-09: straight from a consultation to the meditation tab, MEDITATION_INIT went to the
   * view the consultation was leaving, Unity did not reboot (so no BRIDGE_READY), and the room stayed
   * on its fallback photo for the whole session. Unity's StartMeditation is idempotent — a repeat
   * that lands on a room already open is answered with MEDITATION_READY and nothing reloads.
   */
  private armMeditationRetry(): void {
    this.clearMeditationRetry();
    this.meditationRetry = setTimeout(() => {
      this.meditationRetry = null;
      if (!this.meditationPending || !this.view) return;
      if (this.meditationTries >= MEDITATION_MAX_TRIES) {
        devlog(`[unity-bridge] no MEDITATION_READY after ${this.meditationTries} retries — staying on the photo`);
        return;
      }
      this.meditationTries += 1;
      devlog(`[unity-bridge] MEDITATION_INIT (retry ${this.meditationTries})`);
      this.post({ type: 'MEDITATION_INIT' });
      this.armMeditationRetry();
    }, MEDITATION_RETRY_MS);
  }

  private clearMeditationRetry(): void {
    if (this.meditationRetry !== null) {
      clearTimeout(this.meditationRetry);
      this.meditationRetry = null;
    }
  }

  /** Tell the room what the session is doing. Posted straight away when there is a view (the room
   *  keeps the latest even if its scene is still loading) and remembered for MEDITATION_READY. */
  sendMeditationState(payload: MeditationStatePayload): void {
    this.meditationState = payload;
    if (this.view) this.post({ type: 'MEDITATION_STATE', payload });
  }

  /** Leaving the meditation room. Idempotent, and safe when Unity never booted. */
  closeMeditationRoom(): void {
    this.meditationPending = false;
    this.meditationState = undefined;
    this.clearMeditationRetry();
    try {
      if (this.view) this.post({ type: 'MEDITATION_END' });
    } catch {}
    this.ready = false;
  }

  async closeCounselingRoom(): Promise<void> {
    this.clearInitRetry();
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
    if (this.everReady && this.payload && !this.initSent) this.sendInit('view registered');
    // The view arriving is also what makes a retry possible at all — before it there is nowhere to
    // post to, and `post` would only queue.
    if (this.payload && !this.ready) this.armInitRetry();
    // Same for the meditation room: a MEDITATION_INIT posted to the view that just went away is gone.
    if (this.meditationPending) {
      devlog('[unity-bridge] MEDITATION_INIT (view registered)');
      this.post({ type: 'MEDITATION_INIT' });
      this.armMeditationRetry();
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

    // Anything at all from the far side means the handshake does not need saying again — see
    // armInitRetry.
    this.clearInitRetry();

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
      // ⚠️ RESEND EVEN IF WE ALREADY SENT ONE. BRIDGE_READY means the player has just booted and
      // has no room — so any SESSION_INIT that went out BEFORE it was posted into a view whose
      // scripting runtime was not up yet, and is gone. `initSent` records that we spoke, not that
      // anybody heard.
      //
      // This became reachable on 21-09, when the meditation room mounted a second UnityHost.
      // Unmounting a UnityView tears the whole engine down, so leaving that room and opening a
      // consultation reboots Unity underneath a bridge that had already sent its SESSION_INIT on
      // `registerView`. Measured: SESSION_INIT at 15.517, BRIDGE_READY at 15.577, then thirty
      // seconds of nothing and the screen walked the player out. The retry could not save it
      // either — it stops at the first word back, and BRIDGE_READY is a word back.
      //
      // Safe to repeat, for the reason armInitRetry already gives: SESSION_INIT is what LOADS the
      // room, so sending it again before the room exists loads it once. `ready` guards the only
      // case that would matter — a room already up must never be reloaded under the player.
      if (this.payload && !this.ready) this.sendInit('bridge ready');

      // The meditation room needs the same repeat, for the same reason and with no payload to
      // hang it on. Measured 21-09: MEDITATION_INIT at 19.393, BRIDGE_READY at 20.420, and no
      // MEDITATION_READY ever — the room stayed on its fallback photo with the real one never
      // loading. Both openings have to survive the player booting underneath them, because since
      // the meditation room mounts its own UnityHost, either one can be the boot.
      if (this.meditationPending) {
        devlog('[unity-bridge] MEDITATION_INIT (bridge ready)');
        this.post({ type: 'MEDITATION_INIT' });
      }
    }

    // The meditation room's equivalent of UNITY_READY for TRANSPORT purposes only: it proves the
    // player is listening, so nothing after it needs queueing. It does NOT start anything — the
    // screen decides what to do with it.
    if (event.type === 'MEDITATION_READY') {
      this.meditationPending = false;
      this.clearMeditationRetry();
      if (this.meditationState) this.post({ type: 'MEDITATION_STATE', payload: this.meditationState });
      this.ready = true;
      this.everReady = true;
      this.clearInitRetry();
    }

    if (event.type === 'UNITY_READY') {
      this.ready = true;
      this.everReady = true;
      // The room is up: nothing may re-open it now.
      this.clearInitRetry();
      if (!this.initSent && this.payload) this.sendInit('unity ready');
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
