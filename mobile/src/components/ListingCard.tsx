import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { mediaUrl } from '@/lib/api';
import { formatAcres, formatInr } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Listing } from '@/lib/types';

import { Chip, RoleBadge } from './ui';

export function ListingPhoto({ listing, height }: { listing: Listing; height: number }) {
  const first = listing.images[0];
  if (first) return <Image source={{ uri: mediaUrl(first.url) }} style={{ height, width: '100%' }} resizeMode="cover" />;
  return (
    <View style={[styles.placeholder, { height }]}>
      <Ionicons name="leaf-outline" size={height / 3} color="#9CCFC2" />
    </View>
  );
}

export function ListingCard({ listing, onPress, footer }: { listing: Listing; onPress: () => void; footer?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <ListingPhoto listing={listing} height={170} />
      {listing.status === 'sold' ? (
        <View style={styles.sold}>
          <Text style={styles.soldText}>SOLD</Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.price}>{formatInr(listing.price_inr)}</Text>
          <RoleBadge role={listing.owner.role} />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        <View style={[styles.row, { justifyContent: 'flex-start', gap: 6, flexWrap: 'wrap' }]}>
          <Chip icon="resize-outline" label={formatAcres(listing.area_acres)} />
          <Chip icon="location-outline" label={listing.locality} />
          {listing.location_is_approximate ? <Chip icon="eye-off-outline" label="Approx. pin" tone="warn" /> : null}
        </View>
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { width: '100%', backgroundColor: '#E7F5F1', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 20, fontWeight: '800', color: colors.text },
  title: { fontSize: 15, color: colors.text },
  footer: { fontSize: 12, color: colors.muted, marginTop: 2 },
  sold: { position: 'absolute', top: 12, left: 12, backgroundColor: colors.danger, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  soldText: { color: colors.white, fontWeight: '800', fontSize: 11 },
});
