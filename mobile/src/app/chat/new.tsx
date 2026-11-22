import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, RoleBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { colors } from '@/lib/theme';
import type { Conversation, PublicUser } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

/** Start a 1:1 chat (pick one person) or a group / meeting room (pick several). */
export default function NewChat() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const { data } = useLoad(() => api.get<PublicUser[]>(`/users${q ? `?q=${encodeURIComponent(q)}` : ''}`), q);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const isGroup = selected.length > 1;

  const create = async () => {
    setBusy(true);
    try {
      const conv = await api.post<Conversation>('/conversations', { member_ids: selected, title: isGroup ? title.trim() || 'Land discussion' : undefined });
      router.replace(`/chat/${conv.id}`);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search people by name" placeholderTextColor={colors.muted} style={{ flex: 1, fontSize: 15 }} />
      </View>
      {isGroup ? (
        <TextInput value={title} onChangeText={setTitle} placeholder="Group name (e.g. Hoskote deal)" placeholderTextColor={colors.muted} style={styles.title} />
      ) : null}
      <FlatList
        data={data ?? []}
        keyExtractor={(u) => u.id}
        renderItem={({ item }) => {
          const on = selected.includes(item.id);
          return (
            <Pressable style={styles.row} onPress={() => toggle(item.id)}>
              <Avatar name={item.display_name} role={item.role} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.name}>{item.display_name}</Text>
                <RoleBadge role={item.role} />
              </View>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? colors.accent : colors.border} />
            </Pressable>
          );
        }}
      />
      <View style={{ padding: 16 }}>
        <Button
          title={selected.length === 0 ? 'Select people' : isGroup ? `Create group (${selected.length + 1})` : 'Start chat'}
          disabled={selected.length === 0}
          loading={busy}
          onPress={create}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface },
  title: { marginHorizontal: 12, marginBottom: 8, borderBottomWidth: 2, borderBottomColor: colors.primary, fontSize: 16, paddingVertical: 8, color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
});
