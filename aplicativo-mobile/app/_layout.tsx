import {
  DarkTheme,
  ThemeProvider,
} from '@react-navigation/native';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
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
import { FIO_CLIENT_SIDEBAR_WIDTH, FioClientSidebar } from '@/components/fio-shell/FioClientSidebar';
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function RootLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const [
    isAuthenticated,
    setIsAuthenticated,
  ] = useState(false);

  const [
    isProfileComplete,
    setIsProfileComplete,
  ] = useState(false);

  const [hasClientAccess, setHasClientAccess] = useState(false);
  const [hasProfessionalAccess, setHasProfessionalAccess] = useState(false);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !isProfileComplete || !Device.isDevice) return;
    let active = true;
    async function registerPush() {
      const permissions = await Notifications.getPermissionsAsync();
      let status = permissions.status;
      if (status !== 'granted') {
        const requested = await Notifications.requestPermissionsAsync();
        status = requested.status;
      }
      if (status !== 'granted' || !active) return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
      await supabase.rpc('register_fio_push_token', {
        p_token: token.data,
        p_platform: 'ios',
      });
    }
    registerPush().catch(() => undefined);
    return () => { active = false; };
  }, [isAuthenticated, isProfileComplete]);

  async function checkProfile(
    userId: string
  ) {
    const [profileResult, clientResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, phone, job_title, coverage_area'
        )
        .eq('id', userId)
        .maybeSingle(),
      supabase.rpc('is_client_portal_user'),
    ]);
    const data = profileResult.data;
    const clientPortal = Boolean(clientResult.data);

    const professionalComplete = Boolean(data?.full_name?.trim() && data?.phone?.trim() && data?.job_title?.trim() && data?.job_title.trim().toLowerCase() !== 'cliente' && data?.coverage_area?.trim());
    const clientComplete = Boolean(data?.full_name?.trim());
    setHasClientAccess(clientPortal);
    setHasProfessionalAccess(professionalComplete);
    setIsProfileComplete(clientPortal ? clientComplete : professionalComplete);
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
            setHasClientAccess(false);
            setHasProfessionalAccess(false);

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

  useEffect(() => {
    if (!isLoading && hasClientAccess && !hasProfessionalAccess && (pathname === '/' || pathname === '/(tabs)')) {
      router.replace('/client/home');
    }
  }, [hasClientAccess, hasProfessionalAccess, isLoading, pathname, router]);

  if (isLoading) {
    return null;
  }

  const isClientArea = pathname.startsWith('/client/');
  const showInternalShell = isAuthenticated && isProfileComplete && !pathname.startsWith('/fio/');

  return (
    <ThemeProvider value={FioNavigationTheme}>
      <View style={styles.application}>
        <View
          style={[
            styles.navigator,
            showInternalShell && [styles.navigatorWithSidebar, isClientArea && { marginLeft: FIO_CLIENT_SIDEBAR_WIDTH }],
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
            isProfileComplete &&
            hasProfessionalAccess
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

          <Stack.Screen name="work-person-profile" />

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

        <Stack.Protected guard={isAuthenticated && isProfileComplete && hasClientAccess}>
          <Stack.Screen name="client/home" />
          <Stack.Screen name="client/works" />
          <Stack.Screen name="client/work" />
          <Stack.Screen name="client/fio" />
          <Stack.Screen name="client/settings" />
          <Stack.Screen name="client/professionals" />
          <Stack.Screen name="client/public-profile" />
          <Stack.Screen name="client/edit-profile" />
          <Stack.Screen name="client/security" />
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

        {showInternalShell && (isClientArea ? <FioClientSidebar hasProfessionalAccess={hasProfessionalAccess} /> : <FioGlobalSidebar hasClientAccess={hasClientAccess} />)}
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
