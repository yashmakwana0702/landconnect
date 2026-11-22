import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ListingCard } from '@/components/ListingCard';
import { Avatar, Button, Field, RoleBadge } from '@/components/ui';
import { api, API_URL } from '@/lib/api';
import { canManageListings, useAuth, useMe } from '@/lib/auth';
import { useRealtimeStatus } from '@/lib/realtime';
import { colors, radius } from '@/lib/theme';
import type { Listing, Me } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function Profile() {
  const me = useMe();
  const { signOut, setUser } = useAuth();
  const status = useRealtimeStatus();
  const [phone, setPhone] = useState(me.phone ?? '');
  const manages = canManageListings(me.role);
  const { data: mine } = useLoad(() => (manages ? api.get<Listing[]>('/listings?mine=true') : Promise.resolve([])));

  const update = async (patch: Partial<Me>) => {
    try {
      setUser(await api.patch<Me>('/me', patch));
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Avatar name={me.display_name} role={me.role} size={72} />
        <Text style={styles.name}>{me.display_name}</Text>
        <RoleBadge role={me.role} />
        <Text style={styles.email}>{me.email}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Privacy</Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>Accept in-app calls</Text>
            <Text style={styles.switchHint}>When off, nobody can ring you. Chat still works.</Text>
          </View>
          <Switch value={me.calls_enabled} onValueChange={(v) => update({ calls_enabled: v })} trackColor={{ true: colors.accent }} />
        </View>
        <Field label="Phone (private)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" onEndEditing={() => update({ phone: phone.trim() || null })} hint="Only you can see this. Other users never get your number or email." />
      </View>

      {manages ? (
        <>
          <Text style={styles.section}>My listings</Text>
          {(mine ?? []).map((l) => (
            <ListingCard key={l.id} listing={l} onPress={() => router.push(`/listing/${l.id}`)} />
          ))}
          <Button title="Add a listing" icon="add" variant="outline" onPress={() => router.push('/listing/edit')} style={{ marginHorizontal: 16 }} />
        </>
      ) : null}

      <View style={[styles.card, { marginTop: 20 }]}>
        <Text style={styles.switchHint}>Server: {API_URL}</Text>
        <Text style={styles.switchHint}>Realtime: {status}</Text>
      </View>
      <Button title="Sign out" variant="danger" onPress={signOut} style={{ marginHorizontal: 16, marginTop: 8 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: 6, paddingVertical: 24, backgroundColor: colors.white },
  name: { fontSize: 20, fontWeight: '800', color: colors.text },
  email: { fontSize: 13, color: colors.muted },
  card: { backgroundColor: colors.white, margin: 16, marginBottom: 0, borderRadius: radius.lg, padding: 16, gap: 10 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  switchHint: { fontSize: 12, color: colors.muted },
  section: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase', margin: 16, marginBottom: 10 },
});
