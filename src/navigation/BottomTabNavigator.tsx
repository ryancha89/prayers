import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../shared/theme';
import { useT, TranslationKey } from '../shared/i18n';
import { Icon, IconName } from '../shared/components/Icon';
import { TabParamList } from './types';
import { sfx } from '../shared/audio/sfx';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { ConversationsScreen } from '../features/conversations/screens/ConversationsScreen';
import { MyPageScreen } from '../features/profile/screens/MyPageScreen';

const Tab = createBottomTabNavigator<TabParamList>();

const ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  Conversations: 'chat',
  My: 'person',
};

const LABEL_KEYS: Record<keyof TabParamList, TranslationKey> = {
  Home: 'tab.home',
  Conversations: 'tab.conversations',
  My: 'tab.my',
};

export const BottomTabNavigator: React.FC = () => {
  const t = useT();
  return (
    <Tab.Navigator
      // The tabs were the largest silent surface in the app: every screen change the player
      // makes most often made no sound at all, while a counselor card did. tabPress fires for the
      // tab you are already on too (it scrolls to top), and that is still a press worth answering.
      screenListeners={{ tabPress: () => sfx.tap() }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.violetSoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarLabel: t(LABEL_KEYS[route.name]),
        tabBarIcon: ({ color, focused }) => (
          <Icon name={ICONS[route.name]} size={focused ? 22 : 20} color={color} />
        ),
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Conversations" component={ConversationsScreen} />
      <Tab.Screen name="My" component={MyPageScreen} />
    </Tab.Navigator>
  );
};
