import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, Vibration, View } from 'react-native';

import { Avatar, RoleBadge, RoundButton } from '@/components/ui';
import { useCallState, callStore } from '@/lib/callStore';
import { closeModal } from '@/lib/nav';
import { colors } from '@/lib/theme';

const RING_PATTERN = [0, 900, 700];

/** Full-screen incoming call: accept or decline. Closes itself if the caller hangs up. */
export default function IncomingCall() {
  const { incoming } = useCallState();
  const [call] = useState(incoming);
  const answering = useRef(false);

  useEffect(() => {
    Vibration.vibrate(RING_PATTERN, true);
    return () => Vibration.cancel();
  }, []);

  useEffect(() => {
    if (!incoming && !answering.current) closeModal(); // cancelled, missed, or declined
  }, [incoming]);

  if (!call) return null;

  const accept = async () => {
    answering.current = true;
    Vibration.cancel();
    try {
      const session = await callStore.accept(call.id);
      router.replace(`/call/${session.call.id}`);
    } catch (e) {
      answering.current = false;
      Alert.alert('Call unavailable', (e as Error).message);
      closeModal();
    }
  };

  const decline = () => {
    Vibration.cancel();
    callStore.reject(call.id).catch(() => undefined);
  };

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.kind}>{call.kind === 'video' ? 'Incoming video call' : 'Incoming voice call'}</Text>
        <Avatar name={call.caller.display_name} role={call.caller.role} size={120} />
        <Text style={styles.name}>{call.caller.display_name}</Text>
        <RoleBadge role={call.caller.role} />
        <Text style={styles.privacy}>🔒 LandConnect call · numbers stay private</Text>
      </View>
      <View style={styles.actions}>
        <RoundButton icon="close" color={colors.danger} size={72} label="Decline" onPress={decline} />
        <RoundButton icon={call.kind === 'video' ? 'videocam' : 'call'} color={colors.accent} size={72} label="Accept" onPress={accept} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDark, justifyContent: 'space-between', paddingVertical: 90 },
  top: { alignItems: 'center', gap: 14 },
  kind: { color: '#CDEDE5', fontSize: 16, marginBottom: 12 },
  name: { color: colors.white, fontSize: 28, fontWeight: '800' },
  privacy: { color: '#CDEDE5', fontSize: 13, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'space-around' },
});
