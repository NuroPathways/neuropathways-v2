import React, { useEffect } from "react";
import { Tabs, useGlobalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { Platform } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useParent } from "@/context/ParentContext";

export const unstable_settings = { initialRouteName: "home" };

export default function ParentTabs() {
  const c = useColors();
  const { child, children, selectChild } = useParent();
  const { child_id } = useGlobalSearchParams<{ child_id?: string }>();
  useEffect(() => {
    const authorized = children.find((item) => item.id === child_id);
    if (authorized && authorized.id !== child?.id) void selectChild(authorized.id);
  }, [child_id, children, child?.id, selectChild]);
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
      <Tabs.Screen name="home" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="help-now" options={{ title: "Help Now", tabBarIcon: icon("life-buoy") }} />
      <Tabs.Screen name="practice" options={{ title: "Practice", tabBarIcon: icon("activity") }} />
      <Tabs.Screen name="family-goals" options={{ title: "Goals", tabBarIcon: icon("target") }} />
      <Tabs.Screen name="more" options={{ title: "Menu", tabBarIcon: icon("menu") }} />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="log" options={{ href: null }} />
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="chat" options={{ href: null }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
