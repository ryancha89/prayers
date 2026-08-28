# The consultation UI moved to React Native

**Branch:** `feature/rn-consultation-ui` (RN) · Unity changes ride on `feature/consultant-house`.

## What changed

Unity used to draw the whole session: `ConsultationFlowUI` painted the dialogue
card, the choice list, the question box, the report and the chat transcript onto
a canvas inside the embedded player, and `ConsultationFlowController` walked the
20 phases that drove it.

Everything the player reads or taps is React now. Unity keeps what only a 3D
engine can do.

```
React Native (prayers)                         Unity (Saju)
──────────────────────────────                 ─────────────────────────────
ConsultationEngine        ── STAGE_PHASE ────▶ ConsultationRemoteStage
  flow/engine.ts             STAGE_SPEAK          → CameraRig / Performer / Voice
  20 phases, dwell,          STAGE_THINKING       → VFX + viz stages
  branch tags, chunking      ORACLE_ASK           → ConsultationOracle
ConsultationOverlay       ◀── ORACLE_RESULT ──   (chart, uniq_id, AI turn)
  components/…tsx           ◀── SPEAK_DONE ────   (voice + lip-sync)
```

## The split, and why it is where it is

**RN owns** the phase order, every dwell, the branch tags, the question box, the
choices, the report, the transcript, the follow-up pill, the notices — and the
keyboard, the safe areas, the back gesture and the fonts that came with them.

**Unity owns** the room, the counselor, the camera presets, the VFX and the four
saju visualisation stages — plus two things that are *not* UI and did not move:

- **the reading.** `ConsultationOracle` derives `base_info` and a `uniq_id`
  thread key from the player's chart (gender + name + four pillars + tone). That
  derivation has to match `saju_world` byte for byte or a returning player
  resumes into an empty thread. A TypeScript copy of it is a second chance to
  get it wrong, with a symptom nobody would notice for weeks.
- **the voice.** TTS playback drives `CounselorLipSync` off the clip's own
  amplitude. Playing the audio in RN would leave the mouth in Unity guessing.

## Files

| Layer | File |
|---|---|
| Flow engine | `src/features/counseling/flow/engine.ts` |
| Flow data (generated) | `src/features/counseling/flow/consultationFlow.json` |
| Strings (generated) | `src/features/counseling/flow/consultationStrings.json` |
| RN-owned copy | `src/features/counseling/flow/strings.ts` |
| React wiring | `src/features/counseling/hooks/useConsultationEngine.ts` |
| The UI | `src/features/counseling/components/ConsultationOverlay.tsx` |
| Stage port | `src/features/counseling/bridge/stagePort.ts` |
| Contract | `src/features/counseling/types/index.ts` (§ "Stage commands") |
| Unity seam | `Saju/Assets/Scripts/Integration/ConsultationRemoteStage.cs` |
| Unity transport | `Saju/Assets/Scripts/Integration/RNBridge.cs`, `RNMessages.cs` |
| Hand-over point | `ConsultationSession.cs` — where `_flow.Begin()` used to be |

## Regenerating the flow data

The 20 phases and their 187 localized lines are still **authored in Unity**
(`Data/ConsultationFlow.asset`, `Resources/LocalizationData.asset`). Do not hand
-edit the JSON:

```sh
python3 Tools/consultation/export_flow.py
```

## The wire contract

`prayers/src/features/counseling/types/index.ts` is the source; `RNMessages.cs`
mirrors it **by field name** — `JsonUtility` matches by name and reports nothing
when it does not match, so a rename on one side is a silently empty payload on
the other.

| Direction | Event | Meaning |
|---|---|---|
| RN→Unity | `SESSION_INIT` | counselor, subject, topic, apiBase, locale, guest auth |
| RN→Unity | `STAGE_PHASE` | camera + animation + VFX + sound + spotlight for one phase |
| RN→Unity | `STAGE_THINKING` | hold the thinking pose while the reading is in flight |
| RN→Unity | `STAGE_SPEAK` | `clip` (loc keys) or `tts` (the AI's own words) |
| RN→Unity | `STAGE_STOP_SPEAK` | the player tapped ahead |
| RN→Unity | `ORACLE_ASK` | ask for the reading, or one free-chat turn (`loop`) |
| RN→Unity | `SESSION_END` | silence everything now, ahead of the unload |
| Unity→RN | `UNITY_READY` | the room is up and the counselor is seated |
| Unity→RN | `ORACLE_RESULT` | beats per phase, follow-up, report rows, thread id, error |
| Unity→RN | `SPEAK_DONE` | a take finished — the real clock behind a beat's dwell |
| Unity→RN | `EXIT_SESSION` / `SESSION_ERROR` | the room is done, or gave up |

## Behaviour that survived the move

Ported deliberately, with tests in `__tests__/consultationEngine.test.ts`:

- **talk-first** — P03/P04/P12/P16 are skipped; the app already asked for the topic.
- **cover phases** — P06–P10 stop the moment the reading lands, but never flash
  past `MIN_HOLD`. They *are* the loading state.
- **the reading hold** — P11 waits rather than speaking the asset's placeholder.
- **voice is the real clock** — a spoken take outlasting the read-time estimate
  keeps the beat up; cutting the counselor off mid-sentence is worse.
- **three notices, not one** — connection / upstream / no-chart say different
  things, and retry re-asks the *same* question.
- **the loop** — free chat after P19, leaving through a forward jump to P20 so
  the standing VFX survive and the farewell still plays.

## Known gaps

- `ConsultationFlowUI` and `ConsultationLoop` are still in the scene, switched
  off by `ConsultationRemoteStage.Bind`. Deleting them is a separate change —
  `ConsultationFlowBuilder` still authors them, and the Editor-only path (no
  host attached) still uses them to run the room standalone.
- The viz stages read their chart from `SajuSessionData` on the Unity side, so
  a chart that fails to fetch shows as an empty table with no RN-side signal.
- P12/P16 branch variants are unreachable while those phases are skipped —
  unchanged from before, but now visible in the exported JSON.
