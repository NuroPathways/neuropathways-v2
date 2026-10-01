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
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/context/AuthContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function RootLayoutNav() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const publicScreen = ["login", "signup", "privacy", "clinician-login", "+not-found"].includes(segments[0] as string);
    if (!isAuthenticated && !publicScreen) {
      router.replace("/login");
    } else if (isAuthenticated && (["login", "signup", "clinician-login"].includes(segments[0] as string) || (user?.role === "clinician" && segments[0] === "(tabs)") || (user?.role !== "clinician" && ["clinician", "clinician-client", "clinician-create-client"].includes(segments[0] as string)))) {
      router.replace(user?.role === "clinician" ? "/clinician" : "/(tabs)");
    }
  }, [isAuthenticated, isLoading, segments, user?.role]);

  return (
    <Stack screenOptions={{ headerBackTitle: "Back" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: "Create account" }} />
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
            <GestureHandlerRootView>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
