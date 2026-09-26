import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Conversations: undefined;
  /** 아카이브 — the player's long-term memory, and the counsellors' (features/archive). */
  Archive: undefined;
  My: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  CounselorDetail: { counselorId: string };
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
