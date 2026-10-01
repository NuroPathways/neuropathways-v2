import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/api";

interface FamilyChild {
  id: string;
  childName: string;
  age?: number | string | null;
  diagnosis?: string | null;
}

async function loadFamilyChildren(): Promise<FamilyChild[]> {
  const response: unknown = await apiFetch("/mobile/children");
  if (!Array.isArray(response)) {
    throw new Error("The family list response was not in the expected format.");
  }

  return response.map((row: unknown) => {
    if (
      !row ||
      typeof row !== "object" ||
      !("id" in row) ||
      typeof row.id !== "string" ||
      !("childName" in row) ||
      typeof row.childName !== "string" ||
      !row.childName.trim()
    ) {
      throw new Error("The family list contains an invalid child record.");
    }

    const age = "age" in row ? row.age : null;
    const diagnosis = "diagnosis" in row ? row.diagnosis : null;
    if (
      (age !== null && age !== undefined && typeof age !== "string" && typeof age !== "number") ||
      (diagnosis !== null && diagnosis !== undefined && typeof diagnosis !== "string")
    ) {
      throw new Error("The family list contains an invalid child record.");
    }

    return {
      id: row.id,
      childName: row.childName,
      age,
      diagnosis,
    };
  });
}

export default function FamilyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, switchChild } = useAuth();
  const [busyChildId, setBusyChildId] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const isClient = user?.role === "client";

  const childrenQuery = useQuery<FamilyChild[], Error>({
    queryKey: ["family-children", user?.id],
    queryFn: loadFamilyChildren,
    enabled: isClient,
    retry: false,
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 0),
      paddingHorizontal: 20,
      paddingBottom: 17,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 23 },
    subtitle: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 4,
    },
    content: {
      width: "100%",
      maxWidth: 680,
      alignSelf: "center",
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 28),
    },
    explanation: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 13,
      padding: 16,
      marginBottom: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
    },
    explanationIcon: {
      width: 38,
      height: 38,
      borderRadius: 13,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    explanationTitle: {
      color: colors.foreground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 14,
      marginBottom: 4,
    },
    explanationText: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 13,
      lineHeight: 19,
    },
    sectionTitle: {
      color: colors.mutedForeground,
      fontFamily: "Inter_600SemiBold",
      fontSize: 12,
      letterSpacing: 0.7,
      textTransform: "uppercase",
      marginBottom: 11,
    },
    childCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 13,
      padding: 15,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
    },
    selectedCard: { borderColor: colors.primary, borderWidth: 2, padding: 14 },
    disabledCard: { opacity: 0.65 },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      color: colors.primary,
      fontFamily: "Inter_700Bold",
      fontSize: 17,
    },
    childDetails: { flex: 1 },
    childName: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 15 },
    childMeta: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 3,
    },
    currentLabel: {
      color: colors.primary,
      fontFamily: "Inter_600SemiBold",
      fontSize: 10,
      letterSpacing: 0.5,
      marginTop: 4,
      textTransform: "uppercase",
    },
    radio: {
      width: 23,
      height: 23,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    radioSelected: { borderColor: colors.primary },
    radioDot: {
      width: 11,
      height: 11,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    stateCard: {
      alignItems: "center",
      paddingHorizontal: 22,
      paddingVertical: 28,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: colors.radius,
    },
    stateText: {
      color: colors.mutedForeground,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      marginTop: 10,
    },
    retryButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginTop: 13,
    },
    retryText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    errorBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 12,
      marginBottom: 14,
      backgroundColor: colors.muted,
      borderRadius: colors.radius,
    },
    errorText: {
      flex: 1,
      color: colors.destructive,
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      lineHeight: 19,
    },
    bottom: { height: Platform.OS === "web" ? 34 : 10 },
  });

  const returnToPreviousScreen = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const handleSelect = async (child: FamilyChild) => {
    if (busyChildId) return;
    setSelectionError(null);
    if (child.id === user?.id) {
      returnToPreviousScreen();
      return;
    }

    setBusyChildId(child.id);
    try {
      await switchChild(child.id);
      setBusyChildId(null);
      returnToPreviousScreen();
    } catch (error) {
      setSelectionError(
        error instanceof Error ? error.message : "This child could not be selected. Please try again.",
      );
      setBusyChildId(null);
    }
  };

  const refresh = () => {
    void childrenQuery.refetch();
  };

  const children = childrenQuery.data ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Family</Text>
        <Text style={styles.subtitle}>Choose whose care space you want to view.</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={childrenQuery.isRefetching}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {!isClient ? (
          <View style={styles.stateCard}>
            <Feather name="lock" size={22} color={colors.mutedForeground} />
            <Text style={styles.stateText}>
              Family selection is available only to authenticated client accounts.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.explanation}>
              <View style={styles.explanationIcon}>
                <Feather name="users" size={19} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.explanationTitle}>One family, one selected child</Text>
                <Text style={styles.explanationText}>
                  Your selection scopes logs, messages, and documents to that child. You can switch back at any time. Only children already authorized for your account are shown.
                </Text>
              </View>
            </View>

            {selectionError && (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Feather name="alert-circle" size={17} color={colors.destructive} />
                <Text style={styles.errorText}>{selectionError}</Text>
              </View>
            )}

            {childrenQuery.isLoading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.stateText}>Loading authorized family members…</Text>
              </View>
            ) : childrenQuery.isError && children.length === 0 ? (
              <View style={styles.stateCard}>
                <Feather name="wifi-off" size={22} color={colors.mutedForeground} />
                <Text style={styles.stateText}>
                  {childrenQuery.error.message || "The family list could not be loaded. Please try again."}
                </Text>
                <Pressable
                  testID="family-retry"
                  accessibilityRole="button"
                  style={styles.retryButton}
                  onPress={() => void childrenQuery.refetch()}
                >
                  <Feather name="refresh-cw" size={15} color={colors.primary} />
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              </View>
            ) : children.length === 0 ? (
              <View style={styles.stateCard}>
                <Feather name="users" size={22} color={colors.mutedForeground} />
                <Text style={styles.stateText}>No children are currently available to this account.</Text>
              </View>
            ) : (
              <>
                {childrenQuery.isError && (
                  <View style={styles.errorBanner} accessibilityRole="alert">
                    <Feather name="alert-circle" size={17} color={colors.destructive} />
                    <Text style={styles.errorText}>
                      The latest family list could not be refreshed. Pull down to try again.
                    </Text>
                  </View>
                )}
                <Text style={styles.sectionTitle}>Available profiles</Text>
                {children.map((child) => {
                  const isSelected = child.id === user?.id;
                  const isBusy = busyChildId === child.id;
                  const age =
                    child.age !== null &&
                    child.age !== undefined &&
                    String(child.age).trim() !== ""
                      ? `Age ${child.age}`
                      : null;
                  const diagnosis = child.diagnosis?.trim() || null;
                  const meta = [age, diagnosis].filter(Boolean).join(" · ");

                  return (
                    <Pressable
                      key={child.id}
                      testID={`family-child-${child.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected, disabled: !!busyChildId }}
                      accessibilityLabel={`${child.childName}${isSelected ? ", current child" : ""}`}
                      style={({ pressed }) => [
                        styles.childCard,
                        isSelected && styles.selectedCard,
                        !!busyChildId && !isBusy && styles.disabledCard,
                        pressed && !busyChildId && { opacity: 0.82 },
                      ]}
                      onPress={() => void handleSelect(child)}
                      disabled={!!busyChildId}
                    >
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{child.childName.trim().slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={styles.childDetails}>
                        <Text style={styles.childName}>{child.childName}</Text>
                        {!!meta && <Text style={styles.childMeta}>{meta}</Text>}
                        {isSelected && <Text style={styles.currentLabel}>Current child</Text>}
                      </View>
                      {isBusy ? (
                        <ActivityIndicator color={colors.primary} />
                      ) : (
                        <View style={[styles.radio, isSelected && styles.radioSelected]}>
                          {isSelected && <View style={styles.radioDot} />}
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </>
            )}
          </>
        )}
        <View style={styles.bottom} />
      </ScrollView>
    </View>
  );
}