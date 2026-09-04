import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { colors } from '../shared/theme';
import { RootStackParamList } from './types';
import { BottomTabNavigator } from './BottomTabNavigator';
import { CounselorDetailScreen } from '../features/counselors/screens/CounselorDetailScreen';
import { CounselingSubjectScreen } from '../features/counseling/screens/CounselingSubjectScreen';
import { CounselingTopicScreen } from '../features/counseling/screens/CounselingTopicScreen';
import { UnityEntryScreen } from '../features/counseling/screens/UnityEntryScreen';
import { CounselingRoomScreen } from '../features/counseling/screens/CounselingRoomScreen';
import { AddSubjectScreen } from '../features/subjects/screens/AddSubjectScreen';
import { hasBirthData, useSubjectsStore } from '../features/subjects/store/subjectsStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

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
  const self = useSubjectsStore(s => s.self);
  const needsProfile = !hasBirthData(self);

  return (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
    }}>
    {needsProfile ? (
      <Stack.Screen
        name="AddSubject"
        component={AddSubjectScreen}
        initialParams={{ subjectId: 'self', onboarding: true }}
        options={{ animation: 'fade' }}
      />
    ) : null}
    <Stack.Screen name="Tabs" component={BottomTabNavigator} />
    <Stack.Screen name="CounselorDetail" component={CounselorDetailScreen} />
    <Stack.Screen name="CounselingSubject" component={CounselingSubjectScreen} />
    <Stack.Screen name="CounselingTopic" component={CounselingTopicScreen} />
    {/* The same screen as a modal, for every later edit. Declared once the first run is past, so
        the two never collide as duplicate route names. */}
    {needsProfile ? null : (
      <Stack.Screen
        name="AddSubject"
        component={AddSubjectScreen}
        options={{ presentation: 'modal' }}
      />
    )}
    <Stack.Screen
      name="UnityEntry"
      component={UnityEntryScreen}
      options={{ animation: 'fade' }}
    />
    <Stack.Screen
      name="CounselingRoom"
      component={CounselingRoomScreen}
      options={{ animation: 'fade', gestureEnabled: false }}
    />
  </Stack.Navigator>
  );
};
