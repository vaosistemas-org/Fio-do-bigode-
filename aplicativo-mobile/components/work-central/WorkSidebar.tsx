import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
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
        size={23}
        color={active ? '#FFFFFF' : '#34405A'}
      />

      {expanded && (
        <Text
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

export function WorkSidebar() {
  const router = useRouter();
  const [expanded, setExpanded] =
    useState(false);

  return (
    <View
      style={[
        styles.rail,
        expanded && styles.railExpanded,
      ]}
    >
      <Pressable
        accessibilityLabel={
          expanded
            ? 'Recolher menu'
            : 'Expandir menu'
        }
        accessibilityRole="button"
        style={styles.brandButton}
        onPress={() =>
          setExpanded((current) => !current)
        }
      >
        <Text style={styles.brand}>FIO</Text>

        {expanded && (
          <Ionicons
            name="chevron-back-outline"
            size={18}
            color="#4937D8"
          />
        )}
      </Pressable>

      <View style={styles.navigation}>
        <NavItem
          icon="home-outline"
          label="Início"
          expanded={expanded}
          onPress={() => router.replace('/')}
        />

        <NavItem
          icon="briefcase-outline"
          label="Obras"
          expanded={expanded}
          active
          onPress={() => router.replace('/works')}
        />

        <NavItem
          icon="person-outline"
          label="Meu FIO"
          expanded={expanded}
          onPress={() => router.push('/profile')}
        />
      </View>

      <View style={styles.bottom}>
        <NavItem
          icon={
            expanded
              ? 'chevron-back-outline'
              : 'chevron-forward-outline'
          }
          label="Recolher"
          expanded={expanded}
          onPress={() =>
            setExpanded((current) => !current)
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 56,
    height: '100%',
    paddingHorizontal: 7,
    paddingTop: 18,
    paddingBottom: 18,
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
    width: 184,
    shadowColor: '#152033',
    shadowOffset: {
      width: 8,
      height: 0,
    },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
  },
  brandButton: {
    minHeight: 48,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E3EA',
    borderRadius: 15,
  },
  brand: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#4937D8',
  },
  navigation: {
    marginTop: 30,
    gap: 10,
  },
  navItem: {
    minHeight: 46,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 13,
  },
  navItemActive: {
    backgroundColor: '#4937D8',
  },
  navLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#34405A',
  },
  navLabelActive: {
    color: '#FFFFFF',
  },
  bottom: {
    marginTop: 'auto',
  },
  pressed: {
    opacity: 0.65,
  },
});
