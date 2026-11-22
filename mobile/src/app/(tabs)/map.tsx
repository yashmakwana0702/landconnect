import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LeafletMap } from '@/components/LeafletMap';
import { ListingPhoto } from '@/components/ListingCard';
import { api } from '@/lib/api';
import { formatAcres, formatInr } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Listing } from '@/lib/types';
import { useLoad } from '@/lib/useLoad';

export default function MapTab() {
  const { data } = useLoad(() => api.get<Listing[]>('/listings?limit=200'));
  const [selected, setSelected] = useState<Listing | null>(null);
  const listings = data ?? [];
  const markers = listings.map((l) => ({
    id: l.id,
    lat: l.latitude,
    lng: l.longitude,
    label: formatInr(l.price_inr),
    approximate: l.location_is_approximate,
  }));

  return (
    <View style={{ flex: 1 }}>
      <LeafletMap markers={markers} zoom={9} style={{ flex: 1 }} onMarkerPress={(id) => setSelected(listings.find((l) => l.id === id) ?? null)} />
      {selected ? (
        <Pressable style={styles.card} onPress={() => router.push(`/listing/${selected.id}`)}>
          <View style={styles.thumb}>
            <ListingPhoto listing={selected} height={80} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.price}>{formatInr(selected.price_inr)}</Text>
            <Text numberOfLines={1} style={styles.title}>
              {selected.title}
            </Text>
            <Text style={styles.meta}>
              {formatAcres(selected.area_acres)} · {selected.locality}
              {selected.location_is_approximate ? ' · approx. location' : ''}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.hint}>
          <Text style={styles.hintText}>Tap a price tag to preview the parcel</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  thumb: { width: 80, height: 80, borderRadius: radius.md, overflow: 'hidden' },
  price: { fontSize: 18, fontWeight: '800', color: colors.text },
  title: { fontSize: 14, color: colors.text },
  meta: { fontSize: 12, color: colors.muted },
  hint: { position: 'absolute', bottom: 16, alignSelf: 'center', backgroundColor: '#000A', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  hintText: { color: colors.white, fontSize: 13 },
});
