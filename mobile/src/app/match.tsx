import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ListingCard } from '@/components/ListingCard';
import { Button, Chip, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatInr } from '@/lib/format';
import { colors, radius } from '@/lib/theme';
import type { BuyerRequirements, MatchResponse } from '@/lib/types';

const EXAMPLES = [
  '5-10 acres near Hoskote under 3.5 crore with road access',
  'At least 1 acre near Devanahalli, budget 2.5 cr, clear title',
  'Farmland with water near Kolar below 70 lakh',
];

function understood(req: BuyerRequirements): string[] {
  const out: string[] = [];
  if (req.budget_min_inr && req.budget_max_inr) out.push(`${formatInr(req.budget_min_inr)}–${formatInr(req.budget_max_inr)}`);
  else if (req.budget_max_inr) out.push(`≤ ${formatInr(req.budget_max_inr)}`);
  else if (req.budget_min_inr) out.push(`≥ ${formatInr(req.budget_min_inr)}`);
  if (req.area_min_acres && req.area_max_acres) out.push(`${req.area_min_acres}–${req.area_max_acres} acres`);
  else if (req.area_min_acres) out.push(`≥ ${req.area_min_acres} acres`);
  else if (req.area_max_acres) out.push(`≤ ${req.area_max_acres} acres`);
  req.locations.forEach((l) => out.push(`📍 ${l}`));
  req.must_haves.forEach((m) => out.push(`✓ ${m}`));
  return out;
}

export default function Match() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MatchResponse | null>(null);

  const run = async (text = query) => {
    if (text.trim().length < 3) return;
    setQuery(text);
    setBusy(true);
    try {
      setResult(await api.post<MatchResponse>('/match', { query: text.trim(), limit: 10 }));
    } catch (e) {
      Alert.alert('Matching failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <View style={{ padding: 16, gap: 10 }}>
      <Text style={styles.lead}>Tell us what land you need, in your own words.</Text>
      <TextInput value={query} onChangeText={setQuery} multiline placeholder="e.g. 5 acres near Hoskote under 3 crore with road access" placeholderTextColor={colors.muted} style={styles.input} />
      <Button title="Find matching parcels" icon="sparkles" onPress={() => run()} loading={busy} />
      {!result ? (
        <View style={{ gap: 6 }}>
          {EXAMPLES.map((ex) => (
            <Pressable key={ex} onPress={() => run(ex)} style={styles.example}>
              <Ionicons name="bulb-outline" size={14} color={colors.primary} />
              <Text style={styles.exampleText}>{ex}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.understood}>
          <Text style={styles.small}>Understood as {result.parsed_by === 'llm' ? '(AI)' : '(rules)'}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {understood(result.requirements).map((t) => (
              <Chip key={t} label={t} />
            ))}
          </View>
        </View>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: colors.surface }}
      data={result?.results ?? []}
      keyExtractor={(r) => r.listing.id}
      ListHeaderComponent={header}
      ListEmptyComponent={result ? <EmptyState icon="search-outline" title="No close matches" subtitle="Try a wider budget or a nearby locality." /> : undefined}
      renderItem={({ item }) => (
        <View>
          <View style={styles.scoreRow}>
            <View style={styles.score}>
              <Text style={styles.scoreText}>{Math.round(item.score)}% match</Text>
            </View>
            <Text style={styles.reasons} numberOfLines={2}>
              {item.reasons.join(' · ')}
            </Text>
          </View>
          <ListingCard listing={item.listing} onPress={() => router.push(`/listing/${item.listing.id}`)} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  lead: { fontSize: 15, color: colors.text },
  input: { minHeight: 80, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, fontSize: 15, textAlignVertical: 'top', color: colors.text },
  example: { flexDirection: 'row', gap: 6, alignItems: 'center', padding: 10, backgroundColor: colors.white, borderRadius: radius.md },
  exampleText: { color: colors.text, fontSize: 13, flex: 1 },
  understood: { backgroundColor: colors.white, borderRadius: radius.md, padding: 12, gap: 8 },
  small: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6 },
  score: { backgroundColor: colors.accent, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  scoreText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  reasons: { flex: 1, fontSize: 12, color: colors.muted },
});
