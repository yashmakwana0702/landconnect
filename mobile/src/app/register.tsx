import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, roleColors } from '@/lib/theme';
import type { Role } from '@/lib/types';

const ROLES: { role: Role; title: string; desc: string }[] = [
  { role: 'buyer', title: 'Buyer', desc: 'Browse land, chat and call owners' },
  { role: 'seller', title: 'Seller', desc: 'List and manage your own land' },
  { role: 'broker', title: 'Broker', desc: 'List land on behalf of owners' },
];

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('buyer');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await register({ email: email.trim(), password, display_name: name.trim(), role, phone: phone.trim() || undefined });
    } catch (e) {
      Alert.alert('Could not register', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.section}>I am a…</Text>
      <View style={{ gap: 8, marginBottom: 18 }}>
        {ROLES.map((r) => {
          const selected = r.role === role;
          return (
            <Pressable key={r.role} onPress={() => setRole(r.role)} style={[styles.role, selected && { borderColor: roleColors[r.role], backgroundColor: roleColors[r.role] + '12' }]}>
              <View style={[styles.radio, selected && { borderColor: roleColors[r.role] }]}>
                {selected ? <View style={[styles.dot, { backgroundColor: roleColors[r.role] }]} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>{r.title}</Text>
                <Text style={styles.roleDesc}>{r.desc}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Field label="Display name" value={name} onChangeText={setName} placeholder="Shown to other users" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry hint="At least 8 characters" />
      <Field label="Phone (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Private. Never shown to other users; calls happen in the app." />
      <Button title="Create account" onPress={submit} loading={busy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 8 },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: colors.border, borderRadius: 14, padding: 14 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  roleTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  roleDesc: { fontSize: 13, color: colors.muted },
});
