import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, ScrollView, type TextInputProps, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

export function Screen({ children, top = false }: { children: React.ReactNode; top?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={{ padding: 18, paddingTop: top ? insets.top + 18 : 18, paddingBottom: 48, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </KeyboardAwareScrollViewCompat>
  );
}

export function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontFamily: "Inter_700Bold", fontSize: 26, color: c.foreground }}>{children}</Text>
      {sub ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, color: c.secondary }}>{sub}</Text> : null}
    </View>
  );
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: ViewStyle; tone?: "primary" | "warn" }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: tone === "primary" ? c.primary : c.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: tone ? 0 : 1, borderColor: c.border }, tone === "warn" && { borderLeftWidth: 4, borderLeftColor: c.destructive, borderWidth: 1 }, style]}>
      {children}
    </View>
  );
}

export function T({ children, weight = "regular", size = 15, color, style }: { children: React.ReactNode; weight?: "regular" | "semi" | "bold"; size?: number; color?: string; style?: object }) {
  const c = useColors();
  const f = weight === "bold" ? "Inter_700Bold" : weight === "semi" ? "Inter_600SemiBold" : "Inter_400Regular";
  return <Text style={[{ fontFamily: f, fontSize: size, lineHeight: size * 1.45, color: color ?? c.foreground }, style]}>{children}</Text>;
}

export function Btn({ label, onPress, kind = "primary", loading, disabled, icon, testID }: { label: string; onPress: () => void; kind?: "primary" | "ghost" | "danger"; loading?: boolean; disabled?: boolean; icon?: keyof typeof Feather.glyphMap; testID?: string }) {
  const c = useColors();
  const bg = kind === "primary" ? c.primary : kind === "danger" ? c.destructive : "transparent";
  const fg = kind === "ghost" ? c.primary : c.primaryForeground;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [{ minHeight: 50, borderRadius: 14, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, kind === "ghost" && { borderWidth: 1.5, borderColor: c.primary }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 16, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...p }: TextInputProps & { label: string; hint?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: c.foreground }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.mutedForeground}
        {...p}
        style={[{ minHeight: 50, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 16, color: c.foreground }, p.multiline && { minHeight: 96, textAlignVertical: "top" }, p.style]}
      />
      {hint ? <Text style={{ fontFamily: "Inter_400Regular", fontSize: 12, color: c.mutedForeground }}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 11, borderRadius: 999, backgroundColor: selected ? c.primary : c.card, borderWidth: 1, borderColor: selected ? c.primary : c.border }}>
      <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 14, color: selected ? c.primaryForeground : c.foreground }}>{label}</Text>
    </Pressable>
  );
}

export function Check({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: checked ? c.primary : c.border, backgroundColor: checked ? c.primary : c.card, alignItems: "center", justifyContent: "center" }}>
        {checked ? <Feather name="check" size={16} color={c.primaryForeground} /> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = useColors();
  return (
    <Card tone="warn">
      <T color={c.destructive} weight="semi">{message}</T>
      {onRetry ? <Btn kind="ghost" label="Try again" onPress={onRetry} /> : null}
    </Card>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  const c = useColors();
  return (
    <Card>
      {Array.from({ length: lines }).map((_, i) => (
        <View key={i} style={{ height: 14, borderRadius: 7, backgroundColor: c.muted, width: i === 0 ? "60%" : "95%" }} />
      ))}
    </Card>
  );
}

export function Row({ children, wrap }: { children: React.ReactNode; wrap?: boolean }) {
  return <View style={{ flexDirection: "row", flexWrap: wrap ? "wrap" : "nowrap", gap: 8, alignItems: "center" }}>{children}</View>;
}

export const msg = (e: unknown, fallback = "Something went wrong. Try again.") => (e instanceof Error && e.message ? e.message : fallback);
export { ScrollView, StyleSheet };
