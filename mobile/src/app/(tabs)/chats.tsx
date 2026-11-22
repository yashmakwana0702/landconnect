import { Ionicons } from '@expo/vector-icons';
import { router, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { useMe } from '@/lib/auth';
import { conversationTitle, otherMember } from '@/lib/conversation';
import { formatWhen } from '@/lib/format';
import { useRealtime } from '@/lib/realtime';
import { colors } from '@/lib/theme';
import type { Conversation } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Chats() {
  const me = useMe();
  const navigation = useNavigation();
  const { data, loading, reload } = useLoad(() => api.get<Conversation[]>('/conversations'));
  useRealtime((e) => {
    if (e.type === 'message.new') reload();
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => router.push('/chat/new')} style={{ paddingHorizontal: 16 }}>
          <Ionicons name="create-outline" size={24} color={colors.white} />
        </Pressable>
      ),
    });
  }, [navigation]);

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(c) => c.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} colors={[colors.primary]} />}
      ListEmptyComponent={
        loading ? undefined : <EmptyState icon="chatbubbles-outline" title="No chats yet" subtitle="Open a listing and tap Chat to message the owner, or start a group with the pencil icon." />
      }
      renderItem={({ item }) => {
        const other = otherMember(item, me.id);
        const last = item.last_message;
        const preview = last ? (last.kind === 'text' ? last.body : `📞 ${last.body}`) : item.listing ? `About: ${item.listing.title}` : 'Say hello 👋';
        return (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.id}`)}>
            {item.is_group ? (
              <View style={styles.groupIcon}>
                <Ionicons name="people" size={22} color={colors.white} />
              </View>
            ) : (
              <Avatar name={other?.display_name ?? '?'} role={other?.role} size={50} />
            )}
            <View style={styles.body}>
              <View style={styles.top}>
                <Text style={styles.name} numberOfLines={1}>
                  {conversationTitle(item, me.id)}
                </Text>
                <Text style={styles.time}>{formatWhen(item.last_message_at)}</Text>
              </View>
              {item.listing && last ? <Text style={styles.listing} numberOfLines={1}>🏞 {item.listing.title}</Text> : null}
              <Text style={styles.preview} numberOfLines={1}>
                {preview}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  groupIcon: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#5E7C8A', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 12, gap: 2 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  time: { fontSize: 12, color: colors.muted },
  listing: { fontSize: 12, color: colors.primary },
  preview: { fontSize: 14, color: colors.muted },
});
