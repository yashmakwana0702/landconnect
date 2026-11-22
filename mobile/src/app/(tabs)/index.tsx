import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { ListingCard } from '@/components/ListingCard';
import { EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { canManageListings, useMe } from '@/lib/auth';
import { colors, radius } from '@/lib/theme';
import type { Listing } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Community() {
  const me = useMe();
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, loading, reload, error } = useLoad(
    () => api.get<Listing[]>(`/listings${submitted ? `?q=${encodeURIComponent(submitted)}` : ''}`),
    submitted,
  );

  const header = (
    <View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => setSubmitted(query.trim())}
          placeholder="Search locality, title…"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={{ flex: 1, fontSize: 15, color: colors.text }}
        />
        {query ? (
          <Pressable
            onPress={() => {
              setQuery('');
              setSubmitted('');
            }}
          >
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      <Pressable style={styles.match} onPress={() => router.push('/match')}>
        <Ionicons name="sparkles" size={22} color={colors.white} />
        <View style={{ flex: 1 }}>
          <Text style={styles.matchTitle}>Find land with AI</Text>
          <Text style={styles.matchSub}>Describe what you need, e.g. “5 acres near Hoskote under 3 Cr”</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.white} />
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <FlatList
        data={data ?? []}
        keyExtractor={(l) => l.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <ListingCard listing={item} onPress={() => router.push(`/listing/${item.id}`)} footer={`Listed by ${item.owner.display_name}`} />
        )}
        ListEmptyComponent={loading ? undefined : <EmptyState icon="leaf-outline" title="No listings yet" subtitle="Pull to refresh, or try another search." />}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} colors={[colors.primary]} />}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      {canManageListings(me.role) ? (
        <Pressable style={styles.fab} onPress={() => router.push('/listing/edit')}>
          <Ionicons name="add" size={30} color={colors.white} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  match: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryDark,
  },
  matchTitle: { color: colors.white, fontWeight: '800', fontSize: 15 },
  matchSub: { color: '#CDEDE5', fontSize: 12, marginTop: 2 },
  error: { color: colors.danger, marginHorizontal: 16, marginBottom: 8 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
