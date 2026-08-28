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

const Stack = createNativeStackNavigator<RootStackParamList>();

export const RootNavigator: React.FC = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.bg },
      animation: 'slide_from_right',
    }}>
    <Stack.Screen name="Tabs" component={BottomTabNavigator} />
    <Stack.Screen name="CounselorDetail" component={CounselorDetailScreen} />
    <Stack.Screen name="CounselingSubject" component={CounselingSubjectScreen} />
    <Stack.Screen name="CounselingTopic" component={CounselingTopicScreen} />
    <Stack.Screen name="AddSubject" component={AddSubjectScreen} options={{ presentation: 'modal' }} />
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
