/**
 * The 20-phase consultation, as RN sees it.
 *
 * These types mirror `Saju/Assets/Scripts/Consulting/Flow/ConsultationFlowData.cs`
 * because `consultationFlow.json` is EXPORTED from the Unity asset by
 * `Tools/consultation/export_flow.py`. Unity stays the authoring tool for the
 * flow; RN stays the only thing that renders it. Do not hand-edit the JSON —
 * edit the asset and re-run the exporter.
 */

import type { Lang } from '../../../shared/i18n';

/** What the screen is doing during a phase (C# `PhaseUi`). */
export type PhaseUi = 'none' | 'dialogue' | 'choices' | 'questionBox' | 'report';

/** Camera preset the phase asks Unity for (C# `PhaseCamera`). */
export type PhaseCamera =
  | 'establishing'
  | 'dialogue'
  | 'analysis'
  | 'closeUp'
  | 'result'
  | 'closing';

export interface PhaseChoice {
  /** String-table key for the label; `english` is the fallback. */
  locKey: string;
  english: string;
  /** Phase id to jump to when picked. Empty = simply advance. */
  goTo: string;
  /** Free tag the reading layer reads ("topic:wealth", "scope:year"). */
  branchTag: string;
}

export interface PhaseVariant {
  branchTag: string;
  lines: string[];
  lineLocKeys: string[];
}

export interface ConsultationPhase {
  id: string;
  situation: string;
  speakerLocKey: string;
  lines: string[];
  lineLocKeys: string[];
  variants: PhaseVariant[];
  animationTriggers: string[];
  camera: PhaseCamera;
  vfx: string[];
  sound: string[];
  ui: PhaseUi;
  choices: PhaseChoice[];
  /** Authored dwell. 0 = derive it from how long the line takes to read. */
  autoAdvanceSeconds: number;
}

/** One consultation string in the three languages the game ships. */
/**
 * One line of the consultation string table, per language.
 *
 * Partial on purpose, and NOT `Record<Lang, string>`: consultationStrings.json is generated from
 * Unity's LocalizationData.asset (Tools/consultation/export_flow.py), which carries ko/en/vi today.
 * Adding ja or Chinese here by hand would fork a generated file and be overwritten by the next
 * export — those languages belong in the Unity table, and arrive through the exporter. Until then
 * `loc()` falls back ko → en → the key, which is what Unity's own Loc.Get does.
 */
export type LocEntry = Partial<Record<Lang, string>> & { ko: string };
