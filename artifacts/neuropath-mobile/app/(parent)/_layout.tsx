import React from "react";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useParent } from "@/context/ParentContext";

export default function ParentTabs() {
  const c = useColors();
  const { child } = useParent();
  const icon = (n: keyof typeof Feather.glyphMap) => ({ color, size }: { color: string; size: number }) => <Feather name={n} color={color} size={size} />;
  return (
    <Tabs
      key={child?.id ?? "none"}
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontFamily: "Inter_700Bold", color: c.foreground },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.mutedForeground,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, ...(Platform.OS === "web" ? { height: 84 } : {}) },
        tabBarLabelStyle: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Support Now", tabBarIcon: icon("life-buoy") }} />
      <Tabs.Screen name="log" options={{ title: "Log", tabBarIcon: icon("edit-3") }} />
      <Tabs.Screen name="documents" options={{ title: "Documents", tabBarIcon: icon("file-text") }} />
      <Tabs.Screen name="chat" options={{ title: "Ask", tabBarIcon: icon("message-circle") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("menu") }} />
    </Tabs>
  );
}
