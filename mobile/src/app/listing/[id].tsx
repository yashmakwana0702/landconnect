import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LeafletMap } from '@/components/LeafletMap';
import { ListingPhoto } from '@/components/ListingCard';
import { Avatar, Button, Chip, RoleBadge } from '@/components/ui';
import { api, mediaUrl } from '@/lib/api';
import { callStore } from '@/lib/callStore';
import { formatAcres, formatInr } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { CallKind, Conversation, Listing } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

const WIDTH = Dimensions.get('window').width;

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: listing, error } = useLoad(() => api.get<Listing>(`/listings/${id}`), id);
  const [busy, setBusy] = useState<string | null>(null);

  if (error) return <Text style={{ padding: 20, color: colors.danger }}>{error}</Text>;
  if (!listing) return null;

  const openChat = async (): Promise<Conversation> =>
    api.post<Conversation>('/conversations', { member_ids: [listing.owner.id], listing_id: listing.id });

  const chat = async () => {
    setBusy('chat');
    try {
      const conv = await openChat();
      router.push(`/chat/${conv.id}`);
    } catch (e) {
      Alert.alert('Error', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const call = async (kind: CallKind) => {
    setBusy(kind);
    try {
      const conv = await openChat();
      const session = await callStore.start(conv.id, kind);
      router.push(`/call/${session.call.id}`);
    } catch (e) {
      Alert.alert('Cannot call', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleSold = async () => {
    await api.patch(`/listings/${listing.id}`, { status: listing.status === 'sold' ? 'active' : 'sold' });
    router.back();
  };

  const remove = () =>
    Alert.alert('Delete listing?', 'This removes the listing and its photos.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await api.del(`/listings/${listing.id}`);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView style={{ backgroundColor: colors.surface }} contentContainerStyle={{ paddingBottom: 40 }}>
      {listing.images.length ? (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {listing.images.map((img) => (
            <Image key={img.id} source={{ uri: mediaUrl(img.url) }} style={{ width: WIDTH, height: 260 }} />
          ))}
        </ScrollView>
      ) : (
        <ListingPhoto listing={listing} height={200} />
      )}

      <View style={styles.section}>
        <Text style={styles.price}>{formatInr(listing.price_inr)}</Text>
        <Text style={styles.title}>{listing.title}</Text>
        <View style={styles.chips}>
          <Chip icon="resize-outline" label={formatAcres(listing.area_acres)} />
          <Chip icon="pricetag-outline" label={`${formatInr(Math.round(listing.price_inr / listing.area_acres))} / acre`} />
          <Chip icon="location-outline" label={listing.locality} />
          {listing.status === 'sold' ? <Chip label="SOLD" tone="warn" /> : null}
        </View>
        {listing.description ? <Text style={styles.desc}>{listing.description}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Location</Text>
        <View style={styles.map}>
          <LeafletMap
            markers={[{ id: listing.id, lat: listing.latitude, lng: listing.longitude, label: listing.locality, approximate: listing.location_is_approximate }]}
            zoom={listing.location_is_approximate ? 13 : 14}
            style={{ flex: 1 }}
          />
        </View>
        {listing.location_is_approximate ? <Text style={styles.note}>The owner shows an approximate area. The exact pin is shared after you talk.</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Listed by</Text>
        <View style={styles.owner}>
          <Avatar name={listing.owner.display_name} role={listing.owner.role} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.ownerName}>{listing.owner.display_name}</Text>
            <RoleBadge role={listing.owner.role} />
          </View>
        </View>
        <Text style={styles.note}>🔒 Contact details stay private. Chat or call inside LandConnect.</Text>
      </View>

      <View style={styles.actions}>
        {listing.is_mine ? (
          <>
            <Button title="Edit" icon="create-outline" onPress={() => router.push(`/listing/edit?id=${listing.id}`)} />
            <Button title={listing.status === 'sold' ? 'Mark as available' : 'Mark as sold'} variant="outline" onPress={toggleSold} />
            <Button title="Delete" variant="danger" icon="trash-outline" onPress={remove} />
          </>
        ) : (
          <>
            <Button title="Chat with owner" icon="chatbubble-ellipses" onPress={chat} loading={busy === 'chat'} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Voice call" icon="call" variant="outline" onPress={() => call('audio')} loading={busy === 'audio'} style={{ flex: 1 }} />
              <Button title="Video call" icon="videocam" variant="outline" onPress={() => call('video')} loading={busy === 'video'} style={{ flex: 1 }} />
            </View>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { backgroundColor: colors.white, padding: 16, marginBottom: 8, gap: 8 },
  price: { fontSize: 26, fontWeight: '800', color: colors.text },
  title: { fontSize: 17, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  desc: { fontSize: 15, color: colors.text, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '700', color: colors.primary, textTransform: 'uppercase' },
  map: { height: 200, borderRadius: radius.md, overflow: 'hidden' },
  note: { fontSize: 12, color: colors.muted },
  owner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ownerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  actions: { padding: 16, gap: 10 },
});
