import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { entities } from "@/lib/api";

export default function DocumentsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const childId = user?.id;

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["documents", childId],
    queryFn: () => entities.Document.filter({ childId }).catch(() => []),
    enabled: !!childId,
  });

  const iconForCategory = (cat?: string) => {
    if (!cat) return "file-text";
    const c = cat.toLowerCase();
    if (c.includes("plan")) return "clipboard";
    if (c.includes("report")) return "bar-chart-2";
    if (c.includes("form")) return "file";
    return "file-text";
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: Platform.OS === "web" ? 67 : 0,
      paddingHorizontal: 20,
      paddingBottom: 16,
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
    headerSub: {
      fontSize: 13,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    scroll: { flex: 1 },
    list: { padding: 20, gap: 10 },
    docCard: {
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 14,
    },
    docIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: `${colors.primary}14`,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    docTitle: {
      fontSize: 15,
      fontWeight: "600" as const,
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
    },
    docCat: {
      fontSize: 12,
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    loadingBox: {
      paddingVertical: 60,
      alignItems: "center" as const,
    },
    emptyBox: {
      margin: 20,
      backgroundColor: colors.card,
      borderRadius: colors.radius,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: "dashed" as const,
      padding: 36,
      alignItems: "center" as const,
      gap: 12,
    },
    emptyText: {
      color: colors.mutedForeground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      textAlign: "center" as const,
    },
  });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Documents</Text>
        <Text style={s.headerSub}>Treatment plans and materials</Text>
      </View>

      <ScrollView style={s.scroll}>
        {isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : docs.length === 0 ? (
          <View style={s.emptyBox}>
            <Feather name="folder" size={32} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No documents yet</Text>
            <Text style={[s.emptyText, { fontSize: 12 }]}>
              Your clinician will share documents here
            </Text>
          </View>
        ) : (
          <View style={s.list}>
            {docs.map((doc: any) => (
              <Pressable key={doc.id} style={s.docCard}>
                <View style={s.docIcon}>
                  <Feather
                    name={iconForCategory(doc.category) as any}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.docTitle} numberOfLines={1}>
                    {doc.title ?? doc.fileName ?? "Document"}
                  </Text>
                  <Text style={s.docCat}>
                    {doc.category ?? "Document"}
                  </Text>
                </View>
                <Feather name="download" size={16} color={colors.mutedForeground} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
