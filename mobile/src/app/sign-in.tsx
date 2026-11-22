import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

const DEMO_ACCOUNTS = [
  { label: 'Buyer', email: 'buyer@demo.in' },
  { label: 'Seller', email: 'seller@demo.in' },
  { label: 'Broker', email: 'broker@demo.in' },
];

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (e) {
      Alert.alert('Sign in failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.primary }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Ionicons name="leaf" size={40} color={colors.primary} />
          </View>
          <Text style={styles.name}>LandConnect</Text>
          <Text style={styles.tagline}>Buy and sell land privately. Chat and call in the app, no phone numbers shared.</Text>
        </View>

        <View style={styles.card}>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
          <Button title="Sign in" onPress={submit} loading={busy} />
          <Link href="/register" asChild>
            <Pressable style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>New here? Create an account</Text>
            </Pressable>
          </Link>

          <Text style={styles.demoTitle}>Demo accounts (password demo1234)</Text>
          <View style={styles.demoRow}>
            {DEMO_ACCOUNTS.map((d) => (
              <Pressable
                key={d.email}
                style={styles.demo}
                onPress={() => {
                  setEmail(d.email);
                  setPassword('demo1234');
                }}
              >
                <Text style={styles.demoText}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  brand: { alignItems: 'center', marginBottom: 24, gap: 8 },
  logo: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  name: { color: colors.white, fontSize: 30, fontWeight: '800' },
  tagline: { color: '#D8F3EC', textAlign: 'center', fontSize: 14, paddingHorizontal: 20 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 20 },
  demoTitle: { marginTop: 22, color: colors.muted, fontSize: 12, textAlign: 'center' },
  demoRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  demo: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  demoText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
