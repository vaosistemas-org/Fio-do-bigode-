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
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
          {!!subtitle && (
            <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>
          )}
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
            <Ionicons name={actionIcon} size={19} color={FioColors.ink} />
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: FioColors.surfaceMuted },
  header: {
    minHeight: 54,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: FioColors.line,
    backgroundColor: FioColors.surfaceMuted,
  },
  identity: { flex: 1, minWidth: 0 },
  eyebrow: {
    marginBottom: 1,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
    color: FioColors.gold,
  },
  title: {
    fontFamily: 'serif',
    fontSize: 20,
    lineHeight: 23,
    fontWeight: '900',
    color: FioColors.ink,
  },
  subtitle: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: FioColors.textMuted,
  },
  action: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 999,
    backgroundColor: FioColors.surface,
  },
  pressed: { opacity: 0.68 },
});
