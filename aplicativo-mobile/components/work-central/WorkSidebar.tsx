import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type NavItemProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  expanded: boolean;
  active?: boolean;
  onPress: () => void;
};

function NavItem({
  icon,
  label,
  expanded,
  active,
  onPress,
}: NavItemProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.navItem,
        active && styles.navItemActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={21}
        color={active ? '#FFFFFF' : '#34405A'}
      />

      {expanded && (
        <Text
          numberOfLines={2}
          style={[
            styles.navLabel,
            active && styles.navLabelActive,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function WorkSidebar({
  onOpenTimeline,
}: {
  onOpenTimeline?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  function navigate(action: () => void) {
    setExpanded(false);
    action();
  }

  function showPlannedArea(title: string) {
    setExpanded(false);
    Alert.alert(
      title,
      'Este destino já está reservado no Meu FIO e será conectado na próxima etapa.'
    );
  }

  return (
    <View style={[styles.rail, expanded && styles.railExpanded]}>
      <Pressable
        accessibilityLabel={expanded ? 'Recolher Meu FIO' : 'Abrir Meu FIO'}
        accessibilityRole="button"
        style={styles.brandButton}
        onPress={() => setExpanded((current) => !current)}
      >
        <Text style={styles.brand}>{expanded ? 'MEU FIO' : 'F'}</Text>
        {expanded && (
          <Ionicons name="chevron-back-outline" size={18} color="#4937D8" />
        )}
      </Pressable>

      <View style={styles.navigation}>
        <NavItem
          icon="person-outline"
          label="Meu perfil"
          expanded={expanded}
          onPress={() => navigate(() => router.push('/profile'))}
        />
        <NavItem
          icon="business-outline"
          label="Empresas, vínculos e solicitações"
          expanded={expanded}
          onPress={() => navigate(() => router.push('/profile'))}
        />
        <NavItem
          icon="briefcase-outline"
          label="Central de obras"
          expanded={expanded}
          active
          onPress={() => navigate(() => router.replace('/works'))}
        />
        <NavItem
          icon="git-branch-outline"
          label="Segue o FIO"
          expanded={expanded}
          onPress={() => navigate(() => onOpenTimeline?.())}
        />
        <NavItem
          icon="settings-outline"
          label="Configurações"
          expanded={expanded}
          onPress={() => showPlannedArea('Configurações')}
        />
        <NavItem
          icon="shield-checkmark-outline"
          label="Segurança"
          expanded={expanded}
          onPress={() => showPlannedArea('Segurança')}
        />
      </View>

      <View style={styles.bottom}>
        <NavItem
          icon={expanded ? 'chevron-back-outline' : 'chevron-forward-outline'}
          label="Recolher"
          expanded={expanded}
          onPress={() => setExpanded((current) => !current)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 50,
    height: '100%',
    paddingHorizontal: 5,
    paddingTop: 12,
    paddingBottom: 14,
    borderRightWidth: 1,
    borderRightColor: '#E2E5EA',
    backgroundColor: '#FFFFFF',
    zIndex: 20,
  },
  railExpanded: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 250,
    paddingHorizontal: 10,
    shadowColor: '#152033',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 12,
  },
  brandButton: {
    minHeight: 44,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E3EA',
    borderRadius: 13,
  },
  brand: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#4937D8',
  },
  navigation: { marginTop: 22, gap: 6 },
  navItem: {
    minHeight: 44,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
  },
  navItemActive: { backgroundColor: '#4937D8' },
  navLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    color: '#34405A',
  },
  navLabelActive: { color: '#FFFFFF' },
  bottom: { marginTop: 'auto' },
  pressed: { opacity: 0.65 },
});
