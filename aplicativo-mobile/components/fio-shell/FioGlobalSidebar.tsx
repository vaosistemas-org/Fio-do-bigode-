import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FioColors, FioShadow } from '@/constants/fio-theme';

type SidebarLevel = 0 | 1 | 2;

type NavigationItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (pathname: string) => boolean;
};

const NAVIGATION: NavigationItem[] = [
  {
    key: 'fio',
    label: 'Meu FIO',
    href: '/',
    icon: 'pulse-outline',
    match: (pathname) => pathname === '/' || pathname === '/(tabs)',
  },
  {
    key: 'works',
    label: 'Obras',
    href: '/works',
    icon: 'business-outline',
    match: (pathname) =>
      pathname === '/works' ||
      pathname.startsWith('/works/') ||
      pathname.startsWith('/new-work') ||
      pathname.startsWith('/client-profile') ||
      pathname.startsWith('/environment') ||
      pathname.startsWith('/new-environment') ||
      pathname.startsWith('/work-participants'),
  },
  {
    key: 'messages',
    label: 'Mensagens',
    href: '/messages',
    icon: 'chatbubbles-outline',
    match: (pathname) => pathname.startsWith('/messages'),
  },
  {
    key: 'links',
    label: 'Vínculos',
    href: '/links',
    icon: 'git-network-outline',
    match: (pathname) =>
      pathname.startsWith('/links') ||
      pathname.startsWith('/company-link') ||
      pathname.startsWith('/company-invitation'),
  },
  {
    key: 'profile',
    label: 'Meu perfil',
    href: '/profile',
    icon: 'person-outline',
    match: (pathname) =>
      pathname === '/profile' || pathname === '/edit-profile',
  },
  {
    key: 'professional',
    label: 'Perfil profissional',
    href: '/my-professional-profile',
    icon: 'id-card-outline',
    match: (pathname) => pathname.startsWith('/my-professional-profile'),
  },
  {
    key: 'company',
    label: 'Empresa',
    href: '/company',
    icon: 'storefront-outline',
    match: (pathname) =>
      pathname === '/company' ||
      pathname.startsWith('/professional-profile') ||
      pathname.startsWith('/company-team') ||
      pathname.startsWith('/edit-professional-profile'),
  },
  {
    key: 'settings',
    label: 'Configurações',
    href: '/settings',
    icon: 'settings-outline',
    match: (pathname) => pathname.startsWith('/settings'),
  },
];

export const FIO_SIDEBAR_RAIL_WIDTH = 54;

export function FioGlobalSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<SidebarLevel>(0);

  const activeItem = useMemo(
    () => NAVIGATION.find((item) => item.match(pathname)) ?? NAVIGATION[0],
    [pathname]
  );

  const items = level === 0 ? [activeItem] : NAVIGATION;
  const width = level === 2 ? 238 : level === 1 ? 66 : FIO_SIDEBAR_RAIL_WIDTH;

  function cycleLevel() {
    setLevel((current) => ((current + 1) % 3) as SidebarLevel);
  }

  function open(item: NavigationItem) {
    if (level === 0) {
      setLevel(1);
      return;
    }

    router.push(item.href as never);
    setLevel(0);
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { width }]}
    >
      <View
        style={[
          styles.sidebar,
          {
            width,
            paddingTop: Math.max(insets.top, 14),
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        {level > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              level === 1 ? 'Mostrar nomes do menu' : 'Recolher menu'
            }
            style={styles.brandButton}
            onPress={cycleLevel}
          >
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>F</Text>
            </View>
            {level === 2 && (
              <View style={styles.brandIdentity}>
                <Text style={styles.brandName}>FIO</Text>
                <Text style={styles.brandCaption}>GESTÃO DE OBRAS</Text>
              </View>
            )}
            {level === 2 && (
              <Ionicons
                name="chevron-back-outline"
                size={17}
                color={FioColors.textSoft}
              />
            )}
          </Pressable>
        )}

        <View style={[styles.navigation, level === 0 && styles.navigationCompact]}>
          {items.map((item) => {
            const active = item.key === activeItem.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={
                  level === 0 ? 'Expandir menu principal' : item.label
                }
                style={({ pressed }) => [
                  styles.item,
                  level === 2 && styles.itemWide,
                  active && styles.itemActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => open(item)}
              >
                <Ionicons
                  name={item.icon}
                  size={21}
                  color={active ? FioColors.ink : '#B9BAB5'}
                />
                {level === 2 && (
                  <Text
                    numberOfLines={1}
                    style={[styles.itemLabel, active && styles.itemLabelActive]}
                  >
                    {item.label}
                  </Text>
                )}
                {level === 2 && active && <View style={styles.activeDot} />}
              </Pressable>
            );
          })}
        </View>

        {level === 0 && <View style={styles.compactGoldLine} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
  },
  sidebar: {
    flex: 1,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#30332F',
    backgroundColor: FioColors.ink,
    ...FioShadow,
  },
  brandButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 3,
    borderRadius: 13,
  },
  brandMark: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5A513E',
    borderRadius: 13,
    backgroundColor: '#242622',
  },
  brandLetter: {
    fontFamily: 'serif',
    fontSize: 23,
    fontWeight: '900',
    color: FioColors.gold,
  },
  brandIdentity: { flex: 1, minWidth: 0 },
  brandName: {
    fontFamily: 'serif',
    fontSize: 17,
    fontWeight: '900',
    color: FioColors.white,
  },
  brandCaption: {
    marginTop: 1,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: FioColors.gold,
  },
  navigation: { flex: 1, marginTop: 20, gap: 5 },
  navigationCompact: { justifyContent: 'center', marginTop: 0 },
  item: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  itemWide: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    paddingHorizontal: 13,
  },
  itemActive: { backgroundColor: FioColors.gold },
  itemLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#D4D5D0',
  },
  itemLabelActive: { fontWeight: '900', color: FioColors.ink },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: FioColors.green,
  },
  compactGoldLine: {
    width: 20,
    height: 3,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.gold,
  },
  pressed: { opacity: 0.68 },
});
