import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../shared/theme';
import { RootStackParamList } from './types';
import { BottomTabNavigator } from './BottomTabNavigator';
import { CounselorDetailScreen } from '../features/counselors/screens/CounselorDetailScreen';
import { CounselingSubjectScreen } from '../features/counseling/screens/CounselingSubjectScreen';
import { UnityEntryScreen } from '../features/counseling/screens/UnityEntryScreen';
import { LectureScreen } from '../features/philosophy/screens/LectureScreen';
import { CounselingRoomScreen } from '../features/counseling/screens/CounselingRoomScreen';
import { AddSubjectScreen } from '../features/subjects/screens/AddSubjectScreen';
import { CharacterSelectScreen } from '../features/character/screens/CharacterSelectScreen';
import { hasBirthData, useSubjectsStore } from '../features/subjects/store/subjectsStore';
import { LoginScreen } from '../features/auth/screens/LoginScreen';
import { AccountScreen } from '../features/profile/screens/AccountScreen';
import { DeleteAccountScreen } from '../features/profile/screens/DeleteAccountScreen';
import { LibraryScreen } from '../features/profile/screens/LibraryScreen';
import { MyInfoScreen } from '../features/profile/screens/MyInfoScreen';
import { MeditationRoomScreen } from '../features/meditation/screens/MeditationRoomScreen';
import { SleepGuideScreen } from '../features/meditation/screens/SleepGuideScreen';
import { TicketsScreen } from '../features/tickets/screens/TicketsScreen';
import { AttendanceScreen } from '../features/tickets/screens/AttendanceScreen';
import { JourneyCounselorScreen } from '../features/journey/screens/JourneyCounselorScreen';
import { JourneyProfileScreen } from '../features/journey/screens/JourneyProfileScreen';
import { JourneySajuScreen } from '../features/journey/screens/JourneySajuScreen';
import { JourneyPassScreen } from '../features/journey/screens/JourneyPassScreen';
import { JourneyScreen } from '../features/journey/screens/JourneyScreen';
import { JourneyResultScreen } from '../features/journey/screens/JourneyResultScreen';
import { JourneyEndingScreen } from '../features/journey/screens/JourneyEndingScreen';
import { JourneyCollectionScreen } from '../features/journey/screens/JourneyCollectionScreen';
import { ArchiveSectionScreen } from '../features/archive/screens/ArchiveSectionScreen';
import { LegalScreen } from '../features/profile/screens/LegalScreen';
import { NotificationsScreen } from '../features/notifications/screens/NotificationsScreen';
import { WorldScreen } from '../features/world/screens/WorldScreen';
import { MyRoomScreen } from '../features/myroom/screens/MyRoomScreen';
import { CafeScreen } from '../features/cafe/screens/CafeScreen';
import { useAuthStore } from '../features/auth/store/authStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** The 3D rooms with a landscape layout: these follow the phone (Info.plist's orientations). */
const ROTATES = { orientation: 'default' } as const;

/**
 * WHO THE APP IS FOR IS ASKED ONCE, AT THE START — not in the middle of choosing a counselor.
 *
 * The birth details used to be collected at the subject step, which put a data-entry form between
 * "I want to talk to Yuna" and talking to Yuna, and made the account holder's own entry the one
 * that could not simply be picked. An account is expected to already know who it belongs to by the
 * time anyone is choosing anything.
 *
 * The condition is `self` having usable birth data, not a "seen onboarding" flag: a flag can be
 * true while the data it stood for is gone, and this way clearing the details puts the question
 * back rather than leaving the app in a state it cannot read a chart from.
 */
export const RootNavigator: React.FC = () => {
  // SIGN-IN COMES BEFORE THE BIRTH DETAILS, and the order is not cosmetic: the chart is saved
  // against an account (`/api/v1/prayers/saju/save` keys on the account), so asking for a birth date first
  // would file the answer under whoever the app happened to be at the time — which used to be a
  // per-device `dev-` id the server only accepts in development.
  const userAuth = useAuthStore(s => s.userAuth);
  const self = useSubjectsStore(s => s.self);
  const deferred = useSubjectsStore(s => s.profileDeferred);
  // "Later" is honoured, but never silently: the counselor screen still refuses a consultation
  // with no chart and routes here, so deferring costs browsing nothing and hides nothing.
  const needsProfile = !hasBirthData(self) && !deferred;
  // Then the character, once (26-10). Keyed on having picked one, like the profile is keyed on data,
  // so an account from before this screen existed is asked on its next launch too.
  // 27-10: and once more for accounts that picked on the old card screen, so everyone meets the 3D
  // creator — `creatorSeen` is stored when the creator commits.
  const playerCharacter = useSubjectsStore(s => s.playerCharacter);
  const creatorSeen = useSubjectsStore(s => s.creatorSeen);
  const needsCharacter = !needsProfile && (!playerCharacter || !creatorSeen);

  return (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
      // PORTRAIT BY DEFAULT (26-10, "tự quay ngang quay dọc"): Info.plist allows landscape for the 3D
      // rooms laid out for it (CS97/98), which let EVERY screen turn with the phone. Only the screens
      // below that set ROTATES follow the phone now; menus, profile and the pickers stay upright.
      orientation: 'portrait',
    }}>
    {userAuth == null ? (
      <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
    ) : null}
    {/* Keyed on being signed in: signing out (or deleting the account) from Account must drop every
        signed-in screen, not just slide Login in UNDER the one on top — without the key the stack
        kept Account showing, with no account behind it and no way back. */}
    <Stack.Group navigationKey={userAuth != null ? 'signed-in' : 'signed-out'}>
    {userAuth != null && needsProfile ? (
      <Stack.Screen name="ProfileSetup" component={AddSubjectScreen} options={{ animation: 'fade' }} />
    ) : null}
    {userAuth != null && needsCharacter ? (
      <Stack.Screen name="CharacterSetup" component={CharacterSelectScreen} options={{ animation: 'fade' }} />
    ) : null}
    <Stack.Screen name="Tabs" component={BottomTabNavigator} />
    <Stack.Screen name="Account" component={AccountScreen} />
    <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
    <Stack.Screen name="Notifications" component={NotificationsScreen} />
    <Stack.Screen name="Library" component={LibraryScreen} />
    <Stack.Screen name="MyInfo" component={MyInfoScreen} />
    {/* The creator turns its body with a one-finger drag over the whole screen: iOS 26's full-screen
        pop gesture took that drag as "back" and threw the edits away (review 27-10), as on the 3D rooms. */}
    <Stack.Screen name="CharacterSelect" component={CharacterSelectScreen} options={{ gestureEnabled: false }} />
    <Stack.Screen name="Tickets" component={TicketsScreen} />
    <Stack.Screen name="Attendance" component={AttendanceScreen} />
    <Stack.Screen name="JourneyProfile" component={JourneyProfileScreen} />
    <Stack.Screen name="JourneySaju" component={JourneySajuScreen} />
    <Stack.Screen name="JourneyPass" component={JourneyPassScreen} />
    <Stack.Screen name="JourneyCounselor" component={JourneyCounselorScreen} />
    {/* No swipe-back: a one-finger drag on the cabin turns the camera (useCabinCamera), and iOS 26's
        full-screen pop gesture took every rightward drag as "back". The header keeps its back button. */}
    <Stack.Screen name="Journey" component={JourneyScreen} options={{ ...ROTATES, animation: 'fade', gestureEnabled: false }} />
    <Stack.Screen name="JourneyResult" component={JourneyResultScreen} options={{ animation: 'fade' }} />
    <Stack.Screen name="JourneyEnding" component={JourneyEndingScreen} options={{ animation: 'fade' }} />
    <Stack.Screen name="JourneyCollection" component={JourneyCollectionScreen} options={{ animation: 'fade' }} />
    <Stack.Screen name="ArchiveSection" component={ArchiveSectionScreen} />
    {/* Fade, like My Room: from the World the UnityView must mount into a settled screen. Pushed with
        the default slide (02-10) the room never answered MEDITATION_INIT while My Room, fading, did. */}
    <Stack.Screen name="MeditationRoom" component={MeditationRoomScreen} options={{ ...ROTATES, animation: 'fade' }} />
    <Stack.Screen name="SleepGuide" component={SleepGuideScreen} options={{ animation: 'fade' }} />
    {/* No swipe-back: the walk keys sit at the left edge, and a thumb on ◀ read as iOS's pop
        gesture (the cabin's lesson). The top bar's 2D button is the way out. */}
    <Stack.Screen name="World" component={WorldScreen} options={{ ...ROTATES, animation: 'fade', gestureEnabled: false }} />
    {/* No swipe-back: the stick sits at the left edge and a one-finger drag looks round the room
        (useMyRoomCamera) — the cabin's lesson. The top bar's back button returns to the world. */}
    <Stack.Screen name="MyRoom" component={MyRoomScreen} options={{ ...ROTATES, animation: 'fade', gestureEnabled: false }} />
    {/* My Room's rules: fade (the UnityView mounts into a settled screen), no swipe-back (the stick
        sits at the left edge and a one-finger drag looks round). The top bar's back is the way out. */}
    <Stack.Screen name="Cafe" component={CafeScreen} options={{ ...ROTATES, animation: 'fade', gestureEnabled: false }} />
    <Stack.Screen name="Lecture" component={LectureScreen} options={{ ...ROTATES, animation: 'fade' }} />
    <Stack.Screen name="Legal" component={LegalScreen} />
    <Stack.Screen name="CounselorDetail" component={CounselorDetailScreen} />
    <Stack.Screen name="CounselingSubject" component={CounselingSubjectScreen} />
    {/* The same form as a modal, for every later edit — including from inside the consultation
        flow, which is why it is ALWAYS registered now. While it shared a name with the first-run
        screen it could not be, and navigating to it popped the stack back to first run. */}
    <Stack.Screen
      name="AddSubject"
      component={AddSubjectScreen}
      options={{ presentation: 'modal' }}
    />
    <Stack.Screen
      name="UnityEntry"
      component={UnityEntryScreen}
      options={{ ...ROTATES, animation: 'fade' }}
    />
    <Stack.Screen
      name="CounselingRoom"
      component={CounselingRoomScreen}
      options={{ ...ROTATES, animation: 'fade', gestureEnabled: false }}
    />
    </Stack.Group>
  </Stack.Navigator>
  );
};
