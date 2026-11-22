import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { CallRoom } from '@/components/CallRoom';
import { api } from '@/lib/api';
import { closeModal } from '@/lib/nav';
import { colors } from '@/lib/theme';
import type { Conversation, LiveKitCredentials } from '@/lib/types';

/** Group meeting room for a conversation: anyone in the chat can join or leave at any time. */
export default function MeetingRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [creds, setCreds] = useState<LiveKitCredentials | null>(null);
  const [title, setTitle] = useState('Meeting room');

  useEffect(() => {
    (async () => {
      try {
        const conv = await api.get<Conversation>(`/conversations/${id}`);
        setTitle(conv.title || 'Meeting room');
        const meeting = await api.post<{ livekit: LiveKitCredentials }>(`/conversations/${id}/meeting`);
        setCreds(meeting.livekit);
      } catch (e) {
        Alert.alert('Cannot join', (e as Error).message);
        closeModal();
      }
    })();
  }, [id]);

  if (!creds) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <CallRoom
        credentials={creds}
        video
        title={title}
        subtitle="Meeting room"
        onHangUp={closeModal}
        waiting={<Text style={styles.waiting}>Waiting for others to join…</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.callBg },
  center: { alignItems: 'center', justifyContent: 'center' },
  waiting: { color: '#D1D7DB', fontSize: 15 },
});
