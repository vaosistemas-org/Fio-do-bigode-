import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FioColors, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type SidebarLevel = 0 | 2;

type NavigationItem = {
  key: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  match: (pathname: string) => boolean;
};

const NAVIGATION: NavigationItem[] = [
  {
    key: 'home',
    label: 'Página inicial',
    href: '/home',
    icon: 'home-outline',
    match: (pathname) => pathname.startsWith('/home'),
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
    key: 'agenda',
    label: 'Agenda',
    href: '/agenda',
    icon: 'calendar-outline',
    match: (pathname) => pathname.startsWith('/agenda'),
  },
  {
    key: 'notifications',
    label: 'Notificações',
    href: '/notifications',
    icon: 'notifications-outline',
    match: (pathname) => pathname.startsWith('/notifications'),
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

export const FIO_SIDEBAR_RAIL_WIDTH = 22;
const SIDEBAR_SWIPE_DISTANCE = 44;
const SIDEBAR_SWIPE_VELOCITY = 0.25;

export function FioGlobalSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [level, setLevel] = useState<SidebarLevel>(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc('get_my_notification_unread_count'),
      supabase.rpc('get_my_message_unread_count'),
    ]).then(([notificationResult, messageResult]) => {
      if (!active) return;
      setUnreadNotifications(Number(notificationResult.data ?? 0));
      setUnreadMessages(Number(messageResult.data ?? 0));
    });
    return () => { active = false; };
  }, [pathname]);

  const activeItem = useMemo(
    () => NAVIGATION.find((item) => item.match(pathname)) ?? NAVIGATION[0],
    [pathname]
  );

  const width = level === 2 ? 220 : FIO_SIDEBAR_RAIL_WIDTH;

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const horizontalMovement =
            Math.abs(gesture.dx) > 10 &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35;
          const verticalMovement =
            Math.abs(gesture.dy) > 10 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.35;

          if (verticalMovement) return true;
          if (!horizontalMovement) return false;
          return level === 0 ? gesture.dx > 0 : gesture.dx < 0;
        },
        onPanResponderRelease: (_event, gesture) => {
          const shouldGoNext =
            gesture.dy <= -SIDEBAR_SWIPE_DISTANCE ||
            gesture.vy <= -SIDEBAR_SWIPE_VELOCITY;
          const shouldGoPrevious =
            gesture.dy >= SIDEBAR_SWIPE_DISTANCE ||
            gesture.vy >= SIDEBAR_SWIPE_VELOCITY;
          const shouldOpen =
            level === 0 &&
            (gesture.dx >= SIDEBAR_SWIPE_DISTANCE ||
              gesture.vx >= SIDEBAR_SWIPE_VELOCITY);
          const shouldClose =
            level === 2 &&
            (gesture.dx <= -SIDEBAR_SWIPE_DISTANCE ||
              gesture.vx <= -SIDEBAR_SWIPE_VELOCITY);

          if (shouldGoNext) navigateVertical(1);
          else if (shouldGoPrevious) navigateVertical(-1);
          else if (shouldOpen) expandMenu();
          else if (shouldClose) collapseMenu();
        },
        onPanResponderTerminationRequest: () => true,
        onShouldBlockNativeResponder: () => false,
      }),
    // The responder intentionally reads the current route and menu level.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeItem.key, level]
  );

  function navigateVertical(direction: 1 | -1) {
    const activeIndex = NAVIGATION.findIndex((item) => item.key === activeItem.key);
    const nextIndex = (activeIndex + direction + NAVIGATION.length) % NAVIGATION.length;
    router.push(NAVIGATION[nextIndex].href as never);
    setLevel(0);
  }

  function expandMenu() {
    setLevel(2);
  }

  function collapseMenu() {
    setLevel(0);
  }

  function open(item: NavigationItem) {
    if (level === 0) {
      expandMenu();
      return;
    }

    router.push(item.href as never);
    setLevel(0);
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { width }]}
      {...swipeResponder.panHandlers}
    >
      <View
        style={[
          styles.sidebar,
          {
            width,
            paddingHorizontal: level === 0 ? 0 : 6,
            paddingTop: Math.max(insets.top, 14),
            paddingBottom: Math.max(insets.bottom, 14),
          },
        ]}
      >
        {level === 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Expandir menu principal"
            accessibilityHint="Toque ou arraste para a direita"
            style={styles.collapsedTouchArea}
            onPress={expandMenu}
          />
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Recolher menu"
            accessibilityHint="Toque ou arraste para a esquerda"
            style={styles.brandButton}
            onPress={collapseMenu}
          >
            <View style={styles.brandMark}>
              <Text style={styles.brandLetter}>F</Text>
            </View>
            <View style={styles.brandIdentity}>
              <Text style={styles.brandName}>FIO</Text>
              <Text style={styles.brandCaption}>GESTÃO DE OBRAS</Text>
            </View>
            <Ionicons
              name="chevron-back-outline"
              size={17}
              color={FioColors.textMuted}
            />
          </Pressable>
        )}

        {level === 0 && <View style={styles.brandSpacer} />}

        <View
          pointerEvents={level === 0 ? 'none' : 'auto'}
          style={styles.navigation}
        >
          {NAVIGATION.map((item) => {
            const active = item.key === activeItem.key;
            const unreadCount = item.key === 'notifications'
              ? unreadNotifications
              : item.key === 'messages'
              ? unreadMessages
              : 0;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={
                  level === 0 ? 'Expandir menu principal' : item.label
                }
                style={({ pressed }) => [
                  styles.item,
                  level === 0 && styles.itemCompact,
                  level === 2 && styles.itemWide,
                  level === 0 && !active && styles.itemHidden,
                  active && level === 2 && styles.itemActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => open(item)}
              >
                <Ionicons
                  name={item.icon}
                  size={level === 0 ? 16 : 20}
                  color={
                    level === 0
                      ? FioColors.ink
                      : active
                      ? FioColors.ink
                      : FioColors.textMuted
                  }
                />
                {level === 2 && (
                  <View style={styles.itemLabelRow}>
                    <Text numberOfLines={1} style={[styles.itemLabel, active && styles.itemLabelActive]}>{item.label}</Text>
                    {unreadCount > 0 && (
                      <View style={styles.notificationBadge}>
                        <Text style={styles.notificationBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                      </View>
                    )}
                  </View>
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
    borderRightWidth: 1,
    borderRightColor: FioColors.line,
    backgroundColor: FioColors.surfaceMuted,
    ...FioShadow,
  },
  collapsedTouchArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  brandSpacer: { minHeight: 50 },
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
    borderColor: FioColors.lineStrong,
    borderRadius: 13,
    backgroundColor: FioColors.surfaceRaised,
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
    color: FioColors.ink,
  },
  brandCaption: {
    marginTop: 1,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: FioColors.gold,
  },
  navigation: { flex: 1, marginTop: 12, gap: 3 },
  item: {
    width: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  itemCompact: {
    width: FIO_SIDEBAR_RAIL_WIDTH,
    borderRadius: 0,
  },
  itemHidden: { opacity: 0 },
  itemWide: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 12,
    paddingHorizontal: 13,
  },
  itemActive: { backgroundColor: FioColors.goldSoft },
  itemLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: FioColors.textMuted,
  },
  itemLabelActive: { fontWeight: '900', color: FioColors.ink },
  itemLabelRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  notificationBadge: { minWidth: 19, height: 19, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 999, backgroundColor: FioColors.orange },
  notificationBadgeText: { fontSize: 9, fontWeight: '900', color: FioColors.textOnAccent },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: FioColors.gold,
  },
  compactGoldLine: {
    width: 12,
    height: 3,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.gold,
  },
  pressed: { opacity: 0.68 },
});
