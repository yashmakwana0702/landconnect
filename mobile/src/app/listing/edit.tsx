import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { LeafletMap } from '@/components/LeafletMap';
import { Button, Field } from '@/components/ui';
import { api, mediaUrl } from '@/lib/api';
import { formatInr, parseInr } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { Listing, ListingInput } from '@/lib/types';

interface LocalPhoto {
  uri: string;
  name: string;
  type: string;
}

const DEFAULT_PIN = { lat: 13.0707, lng: 77.7982 }; // Hoskote

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const navigation = useNavigation();
  const [existing, setExisting] = useState<Listing | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [area, setArea] = useState('');
  const [locality, setLocality] = useState('');
  const [pin, setPin] = useState(DEFAULT_PIN);
  const [hidePin, setHidePin] = useState(false);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  useLayoutEffect(() => navigation.setOptions({ title: id ? 'Edit listing' : 'New listing' }), [navigation, id]);

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`).then((l) => {
      setExisting(l);
      setTitle(l.title);
      setDescription(l.description);
      setPrice(String(l.price_inr));
      setArea(String(l.area_acres));
      setLocality(l.locality);
      setPin({ lat: l.latitude, lng: l.longitude });
      setHidePin(l.hide_exact_location);
    });
  }, [id]);

  const pickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo access to add pictures.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 6 });
    if (result.canceled) return;
    setPhotos((prev) => [
      ...prev,
      ...result.assets.map((a, i) => ({ uri: a.uri, name: a.fileName ?? `photo-${Date.now()}-${i}.jpg`, type: a.mimeType ?? 'image/jpeg' })),
    ]);
  };

  const locateMe = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow location to drop the pin where you are.');
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setPin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };

  const removeExistingImage = async (imageId: string) => {
    if (!existing) return;
    setExisting(await api.del<Listing>(`/listings/${existing.id}/images/${imageId}`));
  };

  const save = async () => {
    const priceInr = parseInr(price);
    const acres = parseFloat(area);
    if (!title.trim() || !locality.trim() || !priceInr || !(acres > 0)) {
      return Alert.alert('Missing details', 'Title, price, area and locality are required.');
    }
    const body: ListingInput = {
      title: title.trim(),
      description: description.trim(),
      price_inr: priceInr,
      area_acres: acres,
      locality: locality.trim(),
      latitude: pin.lat,
      longitude: pin.lng,
      hide_exact_location: hidePin,
    };
    setSaving(true);
    try {
      const saved = existing ? await api.patch<Listing>(`/listings/${existing.id}`, body) : await api.post<Listing>('/listings', body);
      if (photos.length) {
        const form = new FormData();
        // React Native's FormData accepts { uri, name, type } file descriptors.
        photos.forEach((p) => form.append('files', p as unknown as Blob));
        await api.upload<Listing>(`/listings/${saved.id}/images`, form);
      }
      router.replace(`/listing/${saved.id}`);
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const parsed = parseInr(price);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Photos</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
        {existing?.images.map((img) => (
          <Thumb key={img.id} uri={mediaUrl(img.url)} onRemove={() => removeExistingImage(img.id)} />
        ))}
        {photos.map((p, i) => (
          <Thumb key={p.uri} uri={p.uri} onRemove={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} />
        ))}
        <Pressable style={styles.addPhoto} onPress={pickPhotos}>
          <Ionicons name="camera-outline" size={26} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: 12 }}>Add</Text>
        </Pressable>
      </ScrollView>

      <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. 5 acre farmland off NH-75" />
      <Field label="Description" value={description} onChangeText={setDescription} multiline placeholder="Soil, water, road access, title status…" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Field label="Price" value={price} onChangeText={setPrice} placeholder="2.5 cr or 80 lakh" hint={parsed ? formatInr(parsed) : 'Use cr / lakh'} />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Area (acres)" value={area} onChangeText={setArea} keyboardType="decimal-pad" placeholder="5" />
        </View>
      </View>
      <Field label="Locality" value={locality} onChangeText={setLocality} placeholder="Hoskote, Bidadi, Kolar…" />

      <View style={styles.rowBetween}>
        <Text style={styles.label}>Pin location (tap or drag)</Text>
        <Pressable onPress={locateMe} style={styles.locBtn}>
          <Ionicons name="locate" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: '600' }}>Use my location</Text>
        </Pressable>
      </View>
      <View style={styles.map}>
        <LeafletMap pin={pin} center={pin} zoom={13} onPick={(lat, lng) => setPin({ lat, lng })} style={{ flex: 1 }} />
      </View>
      <Text style={styles.coords}>
        {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
      </Text>

      <View style={[styles.rowBetween, { marginVertical: 16 }]}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontWeight: '600', color: colors.text }}>Hide exact location</Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>Others see only an approximate area (~1 km) until you share details in chat.</Text>
        </View>
        <Switch value={hidePin} onValueChange={setHidePin} trackColor={{ true: colors.accent }} />
      </View>

      <Button title={existing ? 'Save changes' : 'Publish listing'} onPress={save} loading={saving} />
    </ScrollView>
  );
}

function Thumb({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View>
      <Image source={{ uri }} style={styles.thumb} />
      <Pressable onPress={onRemove} style={styles.remove} hitSlop={8}>
        <Ionicons name="close" size={14} color={colors.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  thumb: { width: 84, height: 84, borderRadius: radius.md },
  remove: { position: 'absolute', top: 4, right: 4, backgroundColor: '#000A', borderRadius: 10, padding: 2 },
  addPhoto: { width: 84, height: 84, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  map: { height: 240, borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  coords: { fontSize: 12, color: colors.muted, marginTop: 4 },
});
