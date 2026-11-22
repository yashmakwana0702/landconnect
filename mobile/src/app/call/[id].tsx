import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CallRoom } from '@/components/CallRoom';
import { Avatar } from '@/components/ui';
import { useMe } from '@/lib/auth';
import { callStore, useCallState } from '@/lib/callStore';
import { formatDuration } from '@/lib/format';
import { closeModal } from '@/lib/nav';
import { colors } from '@/lib/theme';
import type { CallStatus } from '@/lib/types';

const CLOSE_DELAY_MS = 1500;
const FINAL_LABELS: Partial<Record<CallStatus, string>> = {
  rejected: 'Call declined',
  missed: 'No answer',
  cancelled: 'Call cancelled',
  ended: 'Call ended',
};

/** Outgoing (ringing) and connected call screen. */
export default function CallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const { session } = useCallState();
  const call = session?.call.id === id ? session.call : null;
  const status = call?.status;
  const live = status === 'ringing' || status === 'active';
  const elapsed = useElapsed(status === 'active');

  // Close shortly after the call reaches a final state (or if there is no call at all).
  useEffect(() => {
    if (live) return;
    const t = setTimeout(() => {
      callStore.clearSession();
      closeModal();
    }, call ? CLOSE_DELAY_MS : 0);
    return () => clearTimeout(t);
  }, [live, call]);

  // Leaving the screen any other way (e.g. Android back) still hangs up.
  const statusRef = useRef(status);
  useLayoutEffect(() => {
    statusRef.current = status;
  });
  useEffect(
    () => () => {
      if (statusRef.current === 'ringing' || statusRef.current === 'active') callStore.end(id);
    },
    [id],
  );

  const hangUp = useCallback(() => {
    callStore.end(id);
  }, [id]);
  const onRemoteLeft = useCallback(() => {
    if (statusRef.current === 'active') callStore.end(id);
  }, [id]);

  if (!call) return <View style={styles.root} />;
  const isCaller = call.caller.id === me.id;
  const peer = isCaller ? call.callee : call.caller;
  const label = call.kind === 'video' ? 'Video call' : 'Voice call';
  const subtitle =
    status === 'ringing' ? (isCaller ? 'Ringing…' : 'Connecting…') : status === 'active' ? `${label} · ${formatDuration(elapsed)}` : FINAL_LABELS[status!] ?? '';

  if (!live || !session?.livekit) {
    return (
      <View style={[styles.root, styles.center]}>
        <Avatar name={peer.display_name} role={peer.role} size={110} />
        <Text style={styles.name}>{peer.display_name}</Text>
        <Text style={styles.status}>{subtitle}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CallRoom
        credentials={session.livekit}
        video={call.kind === 'video'}
        title={peer.display_name}
        subtitle={subtitle}
        onHangUp={hangUp}
        onRemoteLeft={onRemoteLeft}
      />
    </View>
  );
}

/** Seconds since `running` became true (local clock, so device/server skew doesn't matter). */
function useElapsed(running: boolean): number {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const t = setInterval(() => setSecs((Date.now() - start) / 1000), 1000);
    return () => clearInterval(t);
  }, [running]);
  return running ? secs : 0;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.callBg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 14 },
  name: { color: colors.white, fontSize: 26, fontWeight: '800' },
  status: { color: '#D1D7DB', fontSize: 16 },
});
