import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ParentProvider, useParent } from "@/context/ParentContext";
import "@/lib/parent";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const parent = useParent();

  useEffect(() => {
    if (isLoading || !parent.ready) return;
    if (user?.role === "family" && !parent.parent) return;
    const seg = segments[0] as string;
    const parentRoutes = ["(parent)", "parent-quickstart", "parent-edit", "parent-connect", "parent-add-child", "privacy", "+not-found"];
    if (parent.parent) {
      if (parent.children.length === 0) {
        if (seg !== "parent-quickstart" && seg !== "privacy") router.replace("/parent-quickstart" as never);
      } else if (!parent.child && parent.children.length > 1) {
        if (seg !== "(parent)" && seg !== "privacy") router.replace("/(parent)/home" as never);
      } else if (!parent.setupComplete) {
        if (seg !== "parent-quickstart" && seg !== "privacy") router.replace("/parent-quickstart" as never);
      } else if (!parentRoutes.includes(seg)) router.replace("/(parent)/home" as never);
      return;
    }
    if (!isAuthenticated && seg === "parent-welcome") return;
    if (isAuthenticated && ["parent-welcome", "parent-quickstart", "(parent)", "parent-edit", "parent-connect", "parent-add-child"].includes(seg)) {
      router.replace(user?.role === "clinician" ? "/clinician" : "/(tabs)");
      return;
    }
    if (!isAuthenticated && ["(parent)", "parent-quickstart", "parent-edit", "parent-connect", "parent-add-child"].includes(seg)) {
      router.replace("/parent-welcome" as never);
      return;
    }
    const publicScreen = ["login", "signup", "legacy-signup", "privacy", "clinician-login", "parent-welcome", "+not-found"].includes(segments[0] as string);
    if (!isAuthenticated && !publicScreen) {
      router.replace("/login");
    } else if (isAuthenticated && (["login", "signup", "legacy-signup", "clinician-login"].includes(segments[0] as string) || (user?.role === "clinician" && segments[0] === "(tabs)") || (user?.role !== "clinician" && ["clinician", "clinician-client", "clinician-create-client"].includes(segments[0] as string)))) {
      router.replace(user?.role === "clinician" ? "/clinician" : "/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, user?.role, parent.ready, parent.parent, parent.children, parent.child, parent.setupComplete]);

  if (isLoading || !parent.ready) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}><Text accessibilityLiveRegion="polite">Loading your account…</Text></View>;
  }
  if (user?.role === "family" && parent.ready && !parent.parent) {
    return <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 16 }}><Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600" }}>Family sign-in needs attention</Text><Text>{parent.error || "Your family session could not be verified. Sign in again or ask your clinic to correct the family relationship."}</Text><Pressable accessibilityRole="button" onPress={() => void parent.signout()}><Text style={{ color: "#0f766e", fontSize: 18 }}>Sign out and try again</Text></Pressable></View>;
  }
  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(parent)" options={{ headerShown: false }} />
      <Stack.Screen name="parent-welcome" options={{ headerShown: false }} />
      <Stack.Screen name="parent-quickstart" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="parent-edit" options={{ title: "Edit child" }} />
      <Stack.Screen name="parent-add-child" options={{ title: "Add a child" }} />
      <Stack.Screen name="parent-connect" options={{ title: "Connect to a clinic" }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="legacy-signup" options={{ title: "Create account" }} />
      <Stack.Screen name="privacy" options={{ title: "Privacy policy" }} />
      <Stack.Screen name="clinician-login" options={{ title: "Clinician sign in" }} />
      <Stack.Screen name="clinician" options={{ title: "Clinician workspace" }} />
      <Stack.Screen name="clinician-client" options={{ title: "Client details" }} />
      <Stack.Screen name="clinician-create-client" options={{ title: "Add a client" }} />
      <Stack.Screen name="check-in" options={{ title: "Daily check-in" }} />
      <Stack.Screen name="wins" options={{ title: "Wins" }} />
      <Stack.Screen name="profile" options={{ title: "Profile" }} />
      <Stack.Screen name="family" options={{ title: "Choose a child" }} />
      <Stack.Screen name="change-code" options={{ title: "Change access code" }} />
      <Stack.Screen
        name="help"
        options={{ title: "Help Right Now", presentation: "card" }}
      />
      <Stack.Screen
        name="goals"
        options={{ title: "Goals & Milestones", presentation: "card" }}
      />
      <Stack.Screen
        name="documents"
        options={{ title: "Documents", presentation: "card" }}
      />
      <Stack.Screen
        name="progress"
        options={{ title: "Progress Reports", presentation: "card" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ParentProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </ParentProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
