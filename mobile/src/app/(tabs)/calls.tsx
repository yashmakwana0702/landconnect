import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { callStore } from '@/lib/callStore';
import { formatDuration, formatWhen } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { colors } from '@/lib/theme';
import type { Call } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

function describe(call: Call, outgoing: boolean): { text: string; missed: boolean } {
  if (call.status === 'ended' && call.answered_at && call.ended_at) {
    const secs = (new Date(call.ended_at).getTime() - new Date(call.answered_at).getTime()) / 1000;
    return { text: formatDuration(secs), missed: false };
  }
  const missed = !outgoing && (call.status === 'missed' || call.status === 'cancelled');
  const labels: Record<string, string> = { missed: 'No answer', cancelled: 'Cancelled', rejected: 'Declined', ringing: 'Ringing', active: 'In progress' };
  return { text: missed ? 'Missed' : labels[call.status] ?? call.status, missed };
}

export default function Calls() {
  const me = useMe();
  const { data, loading, reload } = useLoad(() => api.get<Call[]>('/calls'));
  useRealtime((e) => {
    if (e.type.startsWith('call.')) reload();
  });

  const callBack = async (call: Call) => {
    try {
      const session = await callStore.start(call.conversation_id, call.kind);
      router.push(`/call/${session.call.id}`);
    } catch (e) {
      Alert.alert('Cannot call', (e as Error).message);
    }
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} colors={[colors.primary]} />}
      ListEmptyComponent={loading ? undefined : <EmptyState icon="call-outline" title="No calls yet" subtitle="Calls happen inside the app. Your phone number is never shared." />}
      renderItem={({ item }) => {
        const outgoing = item.caller.id === me.id;
        const peer = outgoing ? item.callee : item.caller;
        const { text, missed } = describe(item, outgoing);
        return (
          <View style={styles.row}>
            <Avatar name={peer.display_name} role={peer.role} size={48} />
            <Pressable style={styles.body} onPress={() => router.push(`/chat/${item.conversation_id}`)}>
              <Text style={[styles.name, missed && { color: colors.danger }]}>{peer.display_name}</Text>
              <View style={styles.meta}>
                <Ionicons name={outgoing ? 'arrow-up' : 'arrow-down'} size={14} color={missed ? colors.danger : colors.accent} style={{ transform: [{ rotate: '45deg' }] }} />
                <Text style={styles.metaText}>
                  {text} · {formatWhen(item.created_at)}
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={() => callBack(item)} hitSlop={10}>
              <Ionicons name={item.kind === 'video' ? 'videocam' : 'call'} size={24} color={colors.primary} />
            </Pressable>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  body: { flex: 1, gap: 3 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13, color: colors.muted },
});
