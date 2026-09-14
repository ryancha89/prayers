import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Conversations: undefined;
  Discover: undefined;
  My: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  CounselorDetail: { counselorId: string };
  CounselingSubject: undefined;
  CounselingTopic: undefined;
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
  /** Question tickets: the balance, the allowance, and the only way to buy more. */
  Tickets: undefined;
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
