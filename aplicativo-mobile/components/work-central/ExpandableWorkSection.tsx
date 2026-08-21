import { Ionicons } from '@expo/vector-icons';
import { PropsWithChildren, ReactNode } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioColors } from '@/constants/fio-theme';

type Props = PropsWithChildren<{
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  open: boolean;
  onPress: () => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  badge?: string;
  headerAction?: ReactNode;
}>;

export function ExpandableWorkSection({
  title,
  subtitle,
  icon,
  open,
  onPress,
  onLayout,
  badge,
  headerAction,
  children,
}: Props) {
  return (
    <View
      onLayout={onLayout}
      style={[
        styles.card,
        open && styles.cardOpen,
      ]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [
            styles.headerMain,
            pressed && styles.pressed,
          ]}
          onPress={onPress}
        >
          <View style={styles.iconBox}>
            <Ionicons
              name={icon}
              size={19}
              color={FioColors.textOnAccent}
            />
          </View>

          <View style={styles.identity}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>
                {title}
              </Text>

              {!!badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {badge}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.subtitle}>
              {subtitle}
            </Text>
          </View>

          <Ionicons
            name={
              open
                ? 'chevron-up-outline'
                : 'chevron-down-outline'
            }
            size={21}
            color={FioColors.text}
          />
        </Pressable>

        {headerAction}
      </View>

      {open && (
        <View style={styles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 15,
    backgroundColor: FioColors.surface,
  },
  cardOpen: {
    borderWidth: 2,
    borderColor: FioColors.lineStrong,
  },
  header: {
    minHeight: 66,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pressed: {
    opacity: 0.7,
  },
  iconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: FioColors.green,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: FioColors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 14,
    color: FioColors.textMuted,
  },
  badge: {
    minWidth: 23,
    paddingHorizontal: 7,
    paddingVertical: 3,
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.greenSoft,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: FioColors.green,
  },
  content: {
    padding: 12,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: FioColors.line,
  },
});
