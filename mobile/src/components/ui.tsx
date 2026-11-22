import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { initials } from '@/lib/format';
import { colors, radius, roleColors } from '@/lib/theme';
import type { Role } from '@/lib/types';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Avatar({ name, role, size = 44 }: { name: string; role?: Role; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: role ? roleColors[role] : colors.muted,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.white, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name) || '?'}</Text>
    </View>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <View style={[styles.badge, { backgroundColor: roleColors[role] + '1A' }]}>
      <Text style={[styles.badgeText, { color: roleColors[role] }]}>{role.toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, icon, tone = 'default' }: { label: string; icon?: IconName; tone?: 'default' | 'warn' }) {
  const color = tone === 'warn' ? '#B26A00' : colors.primaryDark;
  return (
    <View style={[styles.chip, tone === 'warn' && { backgroundColor: '#FFF4E0' }]}>
      {icon ? <Ionicons name={icon} size={12} color={color} /> : null}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, icon, variant = 'primary', loading, disabled, style }: ButtonProps) {
  const outline = variant === 'outline';
  const bg = outline ? 'transparent' : variant === 'danger' ? colors.danger : colors.primary;
  const fg = outline ? colors.primary : colors.white;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: outline ? colors.primary : bg, opacity: pressed || disabled ? 0.7 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, subtitle, children }: { icon: IconName; title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={48} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function RoundButton({ icon, onPress, color, size = 64, label }: { icon: IconName; onPress: () => void; color: string; size?: number; label?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Ionicons name={icon} size={size * 0.45} color={colors.white} />
      </Pressable>
      {label ? <Text style={{ color: colors.white, fontSize: 12 }}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E7F5F1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  button: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.white,
  },
  hint: { fontSize: 12, color: colors.muted, marginTop: 4 },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  emptySub: { fontSize: 14, color: colors.muted, textAlign: 'center' },
});
