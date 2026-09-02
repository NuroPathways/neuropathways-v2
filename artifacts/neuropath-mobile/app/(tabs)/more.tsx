import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

interface MenuRow {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  sub: string;
  iconColor: string;
  iconBg: string;
  onPress: () => void;
}

export default function MoreScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const name = user?.child_name ?? user?.username ?? "User";
  const initials = name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/login");
        },
      },
    ]);
  };

  const menuItems: MenuRow[] = [
    {
      icon: "alert-circle",
      label: "Help Right Now",
      sub: "Get instant support",
      iconColor: "#DC2626",
      iconBg: "#FEE2E2",
      onPress: () => router.push("/help"),
    },
    {
      icon: "target",
      label: "Goals & Milestones",
      sub: "Track your progress",
      iconColor: "#D97706",
      iconBg: "#FEF3C7",
      onPress: () => router.push("/goals"),
    },
    {
      icon: "file-text",
      label: "Documents",
      sub: "Treatment plans & materials",
      iconColor: "#2563EB",
      iconBg: "#DBEAFE",
      onPress: () => router.push("/documents" as any),
    },
    {
      icon: "trending-up",
      label: "Progress Reports",
      sub: "Behavior trends over time",
      iconColor: "#7C3AED",
      iconBg: "#EDE9FE",
      onPress: () => router.push("/progress" as any),
    },
  ];

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: "700" as const,
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
    },
    scroll: { flex: 1 },
    profileCard: {
      margin: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700" as const,
      fontFamily: "Inter_700Bold",
    },
    profileName: {
      fontSize: 17,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    profileSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    sectionLabel: {
      paddingHorizontal: 20,
      paddingBottom: 10,
      fontSize: 12,
      fontWeight: "600" as const,
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.7,
    },
    menuGroup: {
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
      marginBottom: 20,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    menuRowLast: {
      borderBottomWidth: 0,
    },
    menuIcon: {
      width: 38,
      height: 38,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    menuLabel: {
      fontSize: 15,
      fontWeight: "500" as const,
      color: colors.foreground,
      fontFamily: "Inter_500Medium",
    },
    menuSub: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 1,
    },
    logoutBtn: {
      marginHorizontal: 20,
      marginBottom: insets.bottom + (Platform.OS === "web" ? 34 : 20),
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    logoutText: {
      fontSize: 15,
      fontWeight: "500" as const,
      color: colors.destructive,
      fontFamily: "Inter_500Medium",
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>More</Text>
      </View>

      <ScrollView style={s.scroll}>
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials}</Text>
          </View>
          <View>
            <Text style={s.profileName}>{name}</Text>
            <Text style={s.profileSub}>
              {user?.username ? `@${user.username}` : "NeuroPath client"}
            </Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Quick Access</Text>
        <View style={s.menuGroup}>
          {menuItems.map((item, i) => (
            <Pressable
              key={item.label}
              style={[s.menuRow, i === menuItems.length - 1 && s.menuRowLast]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                item.onPress();
              }}
            >
              <View style={[s.menuIcon, { backgroundColor: item.iconBg }]}>
                <Feather name={item.icon} size={19} color={item.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuLabel}>{item.label}</Text>
                <Text style={s.menuSub}>{item.sub}</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>

        <Pressable style={s.logoutBtn} onPress={handleLogout}>
          <Feather name="log-out" size={18} color={colors.destructive} />
          <Text style={s.logoutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
