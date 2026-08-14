import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FioColors } from '@/constants/fio-theme';

export function FioPageHeader({
  eyebrow,
  title,
  subtitle,
  actionIcon,
  actionLabel,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actionIcon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.identity}>
          {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
          <Text style={styles.title}>{title}</Text>
          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>

        {!!actionIcon && !!onAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            style={({ pressed }) => [
              styles.action,
              pressed && styles.pressed,
            ]}
            onPress={onAction}
          >
            <Ionicons name={actionIcon} size={21} color={FioColors.white} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: FioColors.ink },
  header: {
    minHeight: 104,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: FioColors.ink,
  },
  identity: { flex: 1, minWidth: 0 },
  eyebrow: {
    marginBottom: 4,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
    color: FioColors.gold,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '900',
    color: FioColors.white,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: '#BFC1BC',
  },
  action: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#41443F',
    borderRadius: 999,
    backgroundColor: '#262925',
  },
  pressed: { opacity: 0.68 },
});
