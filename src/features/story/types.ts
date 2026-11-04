/**
 * Interactive stories (the Home 스토리 tab). A chapter is a small graph of NODES; a node is a list of
 * STEPS played in order. Fixed beats (narration, the cat's scripted lines, the player's own lines)
 * come from the script; the stretches in between are FREE TALK — the player types, speaks or taps a
 * suggestion, the server writes the cat's reply and reads what the player meant (`StoryIntent`),
 * and that meaning — not a button — decides where the story goes.
 */

export type PlateId = 'door' | 'room' | 'sofa' | 'doorstep' | 'nap';

/** The storyboard's stage ids for the free-talk stretches (CH01-S01..S04). */
export type StoryStage = 'arrival' | 'permission' | 'doorstep' | 'morning_ready';

export type Mood = 'idle' | 'smug' | 'unimpressed' | 'curious' | 'quiet' | 'pleased';

/** Has the player let the cat stay? Decides which "다녀올게" ending line is said (EVT-001/002). */
export type Permission = 'none' | 'granted' | 'refused';

export type StoryIntent = 'none' | 'stay' | 'refuse' | 'invite' | 'name';

export type Step =
  | { kind: 'title' }
  | { kind: 'scene'; plate: PlateId; sfx?: 'door' }
  | { kind: 'narr'; text: string }
  | { kind: 'cat'; text: string; mood?: Mood }
  | { kind: 'me'; text: string }
  | { kind: 'set'; permission: Permission }
  | { kind: 'free'; stage: StoryStage }
  | { kind: 'goto'; node: string }
  | { kind: 'end' };

/** A story-moving choice shown beside the suggestions once the stage allows it ("다녀올게"). */
export interface ProgressChoice {
  label: string;
  node: string;
  /** Free turns in this stage before it is offered. */
  minTurns: number;
  /** Only while permission is (not) granted — EVT-001 vs EVT-002. */
  permission?: Permission[];
}

export interface StageConfig {
  suggestions: string[];
  progress: ProgressChoice[];
  /** After this many plain turns, play `node` (the cat asks whether he may stay). */
  nudge?: { turns: number; node: string };
}

export interface ChapterScript {
  id: string;
  number: number;
  title: string;
  /** One line under the title card. */
  subtitle: string;
  start: string;
  /** Optional backstory offered on the title card ("선택해서 보는 이전 이야기"). */
  prologue?: string;
  nodes: Record<string, Step[]>;
  stages: Record<StoryStage, StageConfig>;
  /** End card: what comes next. */
  next: { title: string; note: string };
}

/** One line of what has been shown — the log, and the history sent with each free turn. */
export interface LogEntry {
  role: 'narr' | 'cat' | 'me' | 'action';
  text: string;
}

/** What is on screen now: one beat of the dialogue box. */
export interface Beat {
  role: 'narr' | 'cat' | 'me';
  text: string;
  /** The cat's stage direction shown above his line (AI replies). */
  action?: string;
  mood?: Mood;
}

export interface TurnResult {
  lines: { kind: 'action' | 'say'; text: string }[];
  intent: StoryIntent;
  name: string | null;
  mood: Mood;
  suggestions: string[];
}
