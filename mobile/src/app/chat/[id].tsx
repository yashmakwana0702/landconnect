import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { callStore } from '@/lib/callStore';
import { conversationTitle } from '@/lib/conversation';
import { formatTime } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { colors } from '@/lib/theme';
import type { CallKind, Conversation, Message } from '@/lib/types';

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const navigation = useNavigation();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.get<Conversation>(`/conversations/${id}`), api.get<Message[]>(`/conversations/${id}/messages?limit=100`)])
      .then(([c, m]) => {
        if (!active) return;
        setConv(c);
        setMessages(m);
      })
      .catch((e) => Alert.alert('Error', (e as Error).message));
    return () => {
      active = false;
    };
  }, [id]);

  useRealtime((e) => {
    if (e.type === 'message.new' && e.data.conversation_id === id) {
      setMessages((prev) => (prev.some((m) => m.id === e.data.id) ? prev : [...prev, e.data]));
    }
  });

  const startCall = useCallback(
    async (kind: CallKind) => {
      try {
        const session = await callStore.start(id, kind);
        router.push(`/call/${session.call.id}`);
      } catch (err) {
        Alert.alert('Cannot call', (err as Error).message);
      }
    },
    [id],
  );

  useLayoutEffect(() => {
    if (!conv) return;
    navigation.setOptions({
      title: conversationTitle(conv, me.id),
      headerRight: () => (
        <View style={{ flexDirection: 'row', gap: 22, paddingRight: 8 }}>
          {conv.is_group ? (
            <Pressable onPress={() => router.push(`/meeting/${conv.id}`)} hitSlop={8}>
              <Ionicons name="people-circle-outline" size={26} color={colors.white} />
            </Pressable>
          ) : (
            <>
              <Pressable onPress={() => startCall('video')} hitSlop={8}>
                <Ionicons name="videocam" size={24} color={colors.white} />
              </Pressable>
              <Pressable onPress={() => startCall('audio')} hitSlop={8}>
                <Ionicons name="call" size={22} color={colors.white} />
              </Pressable>
            </>
          )}
        </View>
      ),
    });
  }, [conv, navigation, me.id, startCall]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const msg = await api.post<Message>(`/conversations/${id}/messages`, { body });
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (e) {
      setText(body);
      Alert.alert('Not sent', (e as Error).message);
    }
  };

  const names = Object.fromEntries((conv?.members ?? []).map((m) => [m.id, m.display_name]));
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.chatBg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      {conv?.listing ? (
        <Pressable style={styles.listingBar} onPress={() => router.push(`/listing/${conv.listing!.id}`)}>
          <Ionicons name="leaf" size={16} color={colors.primary} />
          <Text style={styles.listingText} numberOfLines={1}>
            {conv.listing.title}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}
      {conv?.is_group ? (
        <Pressable style={styles.meetingBar} onPress={() => router.push(`/meeting/${conv.id}`)}>
          <Ionicons name="videocam" size={16} color={colors.white} />
          <Text style={styles.meetingText}>Join meeting room</Text>
        </Pressable>
      ) : null}
      <FlatList
        data={[...messages].reverse()}
        inverted
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 10 }}
        renderItem={({ item }) => <Bubble msg={item} mine={item.sender_id === me.id} sender={conv?.is_group ? names[item.sender_id] : undefined} />}
      />
      <View style={styles.inputBar}>
        <TextInput value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={colors.muted} style={styles.input} multiline />
        <Pressable onPress={send} style={styles.send}>
          <Ionicons name="send" size={20} color={colors.white} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ msg, mine, sender }: { msg: Message; mine: boolean; sender?: string }) {
  if (msg.kind !== 'text') {
    const icon = msg.kind === 'meeting' ? 'videocam' : msg.body.startsWith('Missed') ? 'call-outline' : 'call';
    return (
      <View style={styles.system}>
        <Ionicons name={icon} size={13} color={msg.body.startsWith('Missed') ? colors.danger : colors.muted} />
        <Text style={styles.systemText}>
          {msg.body} · {formatTime(msg.created_at)}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.other]}>
      {sender && !mine ? <Text style={styles.sender}>{sender}</Text> : null}
      <Text style={styles.body}>{msg.body}</Text>
      <Text style={styles.time}>{formatTime(msg.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  listingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.white, paddingHorizontal: 14, paddingVertical: 10 },
  listingText: { flex: 1, color: colors.text, fontWeight: '600' },
  meetingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, paddingVertical: 8 },
  meetingText: { color: colors.white, fontWeight: '700' },
  bubble: { maxWidth: '80%', borderRadius: 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4, marginVertical: 3 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleMine, borderTopRightRadius: 2 },
  other: { alignSelf: 'flex-start', backgroundColor: colors.bubbleOther, borderTopLeftRadius: 2 },
  sender: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  body: { fontSize: 15, color: colors.text },
  time: { fontSize: 10, color: colors.muted, alignSelf: 'flex-end', marginTop: 2 },
  system: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', backgroundColor: '#FFFFFFD9', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginVertical: 6 },
  systemText: { fontSize: 12, color: colors.muted },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 8 },
  input: { flex: 1, backgroundColor: colors.white, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, maxHeight: 120, color: colors.text },
  send: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
