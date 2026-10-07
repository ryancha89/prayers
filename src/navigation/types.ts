import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  /** 월드 (spec 004). A door, not a page: pressing the tab opens the root `World` screen over the
   *  tabs (full screen, no tab bar), so the tab itself never stays focused. */
  WorldTab: undefined;
  Conversations: undefined;
  /** 아카이브 — the player's long-term memory, and the counsellors' (features/archive). */
  Archive: undefined;
  My: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  /** `focusMemoryId`: arriving from a diary entry's Talk to Counselor (spec 006) — the entry the
   *  consultation's first turn is pinned to (`focus_memory_id`). */
  CounselorDetail: { counselorId: string; focusMemoryId?: string };
  CounselingSubject: undefined;
  /* CounselingTopic was removed on 18-09: the player no longer picks a subject area, they walk
     straight into the room and the topic comes from the counsellor's own specialty
     (`defaultTopicFor`). The screen file is kept, unrouted, because the picker may come back as a
     mid-session change rather than a gate. */
  /** `subjectId` edits an existing person (including `'self'`); absent creates a new one. */
  AddSubject: { subjectId?: string } | undefined;
  /**
   * First run over `self`. A SEPARATE ROUTE from AddSubject even though it renders the same form:
   * they were one name before, so the two could not both be registered, and a "fill in your
   * details" navigation from inside the app popped the whole stack back to the first-run screen
   * instead of opening a modal.
   */
  /** Shown until the app has an account. Registered only while signed out. */
  Login: undefined;
  /** The account itself: who is signed in, signing out, and deleting it. */
  Account: undefined;
  /**
   * The two My Page library lists — saved people, and favourited counsellors.
   *
   * One route with a discriminator rather than two: the lists differ in what a row is and where it
   * leads, and in nothing else. Both were rows with no `onPress` until 18-09, while the stat row
   * above them was already counting the very things they refused to show.
   */
  Library: { list: 'people' | 'favorites' };
  /** Question tickets: the balance, the allowance, and the only way to buy more. */
  Tickets: undefined;
  /** Season journeys (2027 신년운세 여행 …): choose the guide, ride, arrive. */
  JourneyCounselor: { journeyId: string };
  /** The paid journey's boarding pass (purchase). Redirects to JourneyCounselor once owned. */
  JourneyPass: { journeyId: string };
  Journey: undefined;
  JourneyResult: undefined;
  /** After the last station: the ending painting, then the collection (mockup panels 21-22). */
  JourneyEnding: undefined;
  /** The journey's stations with how much of each is open; tapping one rides back to it. */
  JourneyCollection: undefined;
  /** The daily check-in: calendar and rules. `justChecked` when arriving from a check-in just made. */
  Attendance: { justChecked?: { granted: number; capReached: boolean } } | undefined;
  /** One category of the 아카이브: its entries and the form. */
  ArchiveSection: { category: import('../features/archive/types').ArchiveCategory };
  /**
   * Ten minutes of breathing — the meditation guide's room.
   *
   * A pushed screen and not a tab: a tab for one feature does not survive the second one, and the
   * roster already knows how to hold "a counselor you can enter". The NAME is load-bearing —
   * App.tsx silences the app's bed on it (`SELF_SCORED_SCREENS`).
   */
  MeditationRoom: undefined;
  /**
   * The 3D world hub (spec 004): walk the sanctuary, go in through its doors. Reached from the Home
   * header's 3D pill and the 월드 tab. The NAME is load-bearing — App.tsx lists it as a Unity screen
   * (`UNITY_SCREENS`), which keeps the app's bed and the mini player off it and stops the route rule
   * from posting SESSION_END into the world.
   */
  World: undefined;
  /**
   * My Room (개인실), behind the world's fifth door: the player's bedroom, to look around in. The NAME
   * is load-bearing — App.tsx lists it as a Unity screen (`UNITY_SCREENS`), like World.
   */
  MyRoom: undefined;
  /** Terms and the privacy policy. Apple wants both reachable, and 5.1.1(v) wants the deletion
   *  above reachable too. */
  Legal: { doc: 'terms' | 'privacy' };
  ProfileSetup: undefined;
  /** Loading screen that boots the (mock) Unity room, spec §17. */
  UnityEntry: {
    counselorId: string;
    subjectId: string;
    resuming?: boolean;
  };
  /** The counseling room itself (mock Unity stage), spec §18, §27. */
  CounselingRoom: {
    sessionId: string;
    counselorId: string;
    subjectId: string;
    resuming?: boolean;
  };
};
