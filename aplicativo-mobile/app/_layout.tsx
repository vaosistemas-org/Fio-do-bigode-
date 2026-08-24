import {
  DarkTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useEffect,
  useState,
} from 'react';
import 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';

import {
  FIO_SIDEBAR_RAIL_WIDTH,
  FioGlobalSidebar,
} from '@/components/fio-shell/FioGlobalSidebar';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

const FioNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: FioColors.green,
    background: FioColors.canvas,
    card: FioColors.surfaceMuted,
    text: FioColors.text,
    border: FioColors.line,
    notification: FioColors.orange,
  },
};

export default function RootLayout() {
  const pathname = usePathname();
  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    isProfileComplete,
    setIsProfileComplete,
  ] = useState(false);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  async function checkProfile(
    userId: string
  ) {
    const { data } =
      await supabase
        .from('profiles')
        .select(
          'full_name, phone, job_title, coverage_area'
        )
        .eq('id', userId)
        .maybeSingle();

    const profileComplete =
      Boolean(
        data?.full_name?.trim() &&
          data?.phone?.trim() &&
          data?.job_title?.trim() &&
          data?.coverage_area?.trim()
      );

    setIsProfileComplete(
      profileComplete
    );
  }

  useEffect(() => {
    async function loadSession() {
      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      setIsAuthenticated(
        !!session
      );

      if (session) {
        await checkProfile(
          session.user.id
        );
      } else {
        setIsProfileComplete(
          false
        );
      }

      setIsLoading(false);
    }

    loadSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setIsAuthenticated(
            !!session
          );

          if (!session) {
            setIsProfileComplete(
              false
            );

            setIsLoading(false);

            return;
          }

          setIsLoading(true);

          setTimeout(
            async () => {
              await checkProfile(
                session.user.id
              );

              setIsLoading(
                false
              );
            },
            0
          );
        }
      );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return null;
  }

  const showInternalShell =
    isAuthenticated &&
    isProfileComplete &&
    !pathname.startsWith('/fio/');

  return (
    <ThemeProvider value={FioNavigationTheme}>
      <View style={styles.application}>
        <View
          style={[
            styles.navigator,
            showInternalShell && styles.navigatorWithSidebar,
          ]}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              gestureEnabled: true,
              fullScreenGestureEnabled: true,
              gestureDirection: 'horizontal',
              animationMatchesGesture: true,
            }}
          >
        {/* USUÁRIO LOGADO + PERFIL COMPLETO */}
        <Stack.Protected
          guard={
            isAuthenticated &&
            isProfileComplete
          }
        >
          <Stack.Screen
            name="(tabs)"
          />

          <Stack.Screen name="home" />

          <Stack.Screen
            name="profile"
          />

          <Stack.Screen name="messages" />

          <Stack.Screen name="links" />

          <Stack.Screen name="my-professional-profile" />

          <Stack.Screen name="public-profile" />

          <Stack.Screen name="company" />

          <Stack.Screen name="client-profile" />

          <Stack.Screen name="settings" />

          <Stack.Screen name="security" />

          <Stack.Screen name="piece-tracking" />

          <Stack.Screen
            name="works"
          />

          <Stack.Screen
            name="agenda"
          />

          <Stack.Screen
            name="notifications"
          />

          <Stack.Screen
  name="works/[id]"
/>

<Stack.Screen
  name="work-participants"
/>

<Stack.Screen
  name="add-work-participant"
/>

<Stack.Screen
  name="new-work"
/>

          <Stack.Screen
            name="environments"
          />

          <Stack.Screen
            name="new-environment"
          />

          <Stack.Screen
            name="environment/[id]"
          />

          <Stack.Screen
            name="environment-progress"
          />

          <Stack.Screen
           name="edit-environment"
          />

          <Stack.Screen
           name="environment-photos"
          />

          <Stack.Screen
           name="environment-measurements"
          />

          <Stack.Screen
           name="measurement-editor"
          />

          <Stack.Screen
            name="edit-profile"
          />

          <Stack.Screen
            name="company-link"
          />

          <Stack.Screen
           name="professional-profile"
          />

          <Stack.Screen
           name="edit-professional-profile"
          />

          <Stack.Screen
           name="company-team"
          />

          <Stack.Screen
           name="company-invite"
          />

          <Stack.Screen
           name="company-invitations"
          />

          <Stack.Screen
            name="company-link-requests"
          />

          <Stack.Screen
            name="modal"
            options={{
              presentation:
                'modal',
              title: 'Modal',
            }}
          />
        </Stack.Protected>

        {/* LOGADO MAS PERFIL INCOMPLETO */}
        <Stack.Protected
          guard={
            isAuthenticated &&
            !isProfileComplete
          }
        >
          <Stack.Screen
            name="complete-profile"
          />
        </Stack.Protected>

        {/* NÃO AUTENTICADO */}
        <Stack.Protected
          guard={!isAuthenticated}
        >
          <Stack.Screen
            name="login"
          />

          <Stack.Screen
            name="signup"
          />
        </Stack.Protected>

        {/* RECUPERAÇÃO DE SENHA */}
        <Stack.Screen
          name="reset-password"
          options={{
            headerShown: false,
          }}
        />

        {/* LEITURA EXTERNA DO FIO GERAL */}
        <Stack.Screen
          name="fio/[token]"
        />
          </Stack>
        </View>

        {showInternalShell && <FioGlobalSidebar />}
      </View>

      <StatusBar style="light" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  application: { flex: 1 },
  navigator: { flex: 1 },
  navigatorWithSidebar: { marginLeft: FIO_SIDEBAR_RAIL_WIDTH },
});
