import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useEffect,
  useState,
} from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme =
    useColorScheme();

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

  return (
    <ThemeProvider
      value={
        colorScheme === 'dark'
          ? DarkTheme
          : DefaultTheme
      }
    >
      <Stack
        screenOptions={{
          headerShown: false,
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

          <Stack.Screen
            name="profile"
          />

          <Stack.Screen
            name="works"
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

      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
