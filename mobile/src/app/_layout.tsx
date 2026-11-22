import { registerGlobals } from '@livekit/react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from '@/lib/auth';
import { callStore } from '@/lib/callStore';
import { RealtimeProvider, useRealtime } from '@/lib/realtime';
import { colors } from '@/lib/theme';

registerGlobals();

/** Routes call signaling events: rings this device, and syncs call state. */
function CallCoordinator() {
  useRealtime((event) => {
    if (event.type === 'call.incoming') {
      const live = callStore.get().session?.call.status;
      if (live === 'ringing' || live === 'active') return; // server also blocks busy callees
      callStore.setIncoming(event.data);
      router.push('/call/incoming');
    } else if (event.type.startsWith('call.')) {
      callStore.applyUpdate(event.data as Parameters<typeof callStore.applyUpdate>[0]);
    }
  });
  return null;
}

function RootNavigator() {
  const { ready, token } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }
  const callScreen = { headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false, animation: 'fade' } as const;
  return (
    <RealtimeProvider token={token}>
      <CallCoordinator />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: colors.white,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={!!token}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="listing/[id]" options={{ title: 'Listing' }} />
          <Stack.Screen name="listing/edit" options={{ title: 'Listing' }} />
          <Stack.Screen name="chat/[id]" options={{ title: '' }} />
          <Stack.Screen name="chat/new" options={{ title: 'New chat' }} />
          <Stack.Screen name="match" options={{ title: 'AI land match' }} />
          <Stack.Screen name="call/incoming" options={callScreen} />
          <Stack.Screen name="call/[id]" options={callScreen} />
          <Stack.Screen name="meeting/[id]" options={callScreen} />
        </Stack.Protected>
        <Stack.Protected guard={!token}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
          <Stack.Screen name="register" options={{ title: 'Create account' }} />
        </Stack.Protected>
      </Stack>
    </RealtimeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
