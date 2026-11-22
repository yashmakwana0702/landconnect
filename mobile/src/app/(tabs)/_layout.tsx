import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import type { IconName } from '@/components/ui';
import { colors } from '@/lib/theme';

const TABS: { name: string; title: string; icon: IconName; header: string }[] = [
  { name: 'index', title: 'Community', icon: 'leaf', header: 'LandConnect' },
  { name: 'map', title: 'Map', icon: 'map', header: 'Land on the map' },
  { name: 'chats', title: 'Chats', icon: 'chatbubbles', header: 'Chats' },
  { name: 'calls', title: 'Calls', icon: 'call', header: 'Calls' },
  { name: 'profile', title: 'Profile', icon: 'person-circle', header: 'Profile' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            headerTitle: t.header,
            tabBarIcon: ({ color, size }) => <Ionicons name={t.icon} color={color as string} size={size} />,
          }}
        />
      ))}
    </Tabs>
  );
}
