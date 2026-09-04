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
