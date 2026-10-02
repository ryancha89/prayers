import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors } from '../shared/theme';
import { useT, TranslationKey } from '../shared/i18n';
import { Icon, IconName } from '../shared/components/Icon';
import { RootStackParamList, TabParamList } from './types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { sfx } from '../shared/audio/sfx';
import { HomeScreen } from '../features/home/screens/HomeScreen';
import { ConversationsScreen } from '../features/conversations/screens/ConversationsScreen';
import { MyPageScreen } from '../features/profile/screens/MyPageScreen';
import { ArchiveScreen } from '../features/archive/screens/ArchiveScreen';

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * The 월드 tab's own page, which nobody should ever see: the tab press is intercepted below and
 * opens the root `World` screen instead (full screen, no tab bar — the world needs all of it). If the
 * tab is focused some other way (a deep link, a state restore), it forwards on focus and puts Home
 * back underneath, so backing out of the world never lands on an empty page.
 */
const WorldTabDoor: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  useFocusEffect(
    React.useCallback(() => {
      navigation.navigate('Tabs', { screen: 'Home' });
      navigation.navigate('World');
    }, [navigation]),
  );
  return null;
};

const ICONS: Record<keyof TabParamList, IconName> = {
  Home: 'home',
  WorldTab: 'castle',
  Conversations: 'chat',
  Archive: 'archive',
  My: 'person',
};

const LABEL_KEYS: Record<keyof TabParamList, TranslationKey> = {
  Home: 'tab.home',
  WorldTab: 'tab.world',
  Conversations: 'tab.conversations',
  Archive: 'tab.archive',
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
      <Tab.Screen
        name="WorldTab"
        component={WorldTabDoor}
        listeners={({ navigation }) => ({
          tabPress: e => {
            e.preventDefault();
            navigation.getParent()?.navigate('World');
          },
        })}
      />
      <Tab.Screen name="Conversations" component={ConversationsScreen} />
      <Tab.Screen name="Archive" component={ArchiveScreen} />
      <Tab.Screen name="My" component={MyPageScreen} />
    </Tab.Navigator>
  );
};
