import React from "react";
import { Platform, ScrollView, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DocumentLibrary from "@/components/DocumentLibrary";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function DocumentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 67 : 16,
          paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 24),
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: colors.mutedForeground, marginBottom: 12 }}>Documents for {user?.child_name || "your child"}</Text>
      <DocumentLibrary key={user?.id} childId={user?.role === "client" ? user.id : null} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
  },
});