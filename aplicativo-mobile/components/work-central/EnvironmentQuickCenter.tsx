import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { WorkSectionKey } from '@/components/work-central/types';
import {
  FioColors,
  FioRadius,
  FioShadow,
} from '@/constants/fio-theme';

export type EnvironmentQuickCounts = {
  pending: number;
  photos: number;
  measurements: number;
  documents: number;
  fio: number;
};

const ITEMS: {
  section: Exclude<WorkSectionKey, 'environments'>;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  countKey: keyof EnvironmentQuickCounts;
  tone: string;
  soft: string;
}[] = [
  {
    section: 'pending',
    label: 'Pendências',
    icon: 'alert-circle-outline',
    countKey: 'pending',
    tone: FioColors.orange,
    soft: FioColors.orangeSoft,
  },
  {
    section: 'photos',
    label: 'Fotos',
    icon: 'images-outline',
    countKey: 'photos',
    tone: FioColors.green,
    soft: FioColors.greenSoft,
  },
  {
    section: 'measurements',
    label: 'Medições',
    icon: 'resize-outline',
    countKey: 'measurements',
    tone: '#6A685F',
    soft: '#EEEDE8',
  },
  {
    section: 'documents',
    label: 'Documentos',
    icon: 'document-text-outline',
    countKey: 'documents',
    tone: FioColors.gold,
    soft: FioColors.goldSoft,
  },
  {
    section: 'fio',
    label: 'Diário',
    icon: 'pulse-outline',
    countKey: 'fio',
    tone: FioColors.green,
    soft: FioColors.greenSoft,
  },
];

export function EnvironmentQuickCenter({
  counts,
  canWrite,
  onOpenSection,
  onCamera,
  onMore,
}: {
  counts: EnvironmentQuickCounts;
  canWrite: boolean;
  onOpenSection: (section: Exclude<WorkSectionKey, 'environments'>) => void;
  onCamera: () => void;
  onMore: () => void;
}) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.headingRow}>
        <View style={styles.headingIdentity}>
          <Text style={styles.eyebrow}>CENTRAL DO AMBIENTE</Text>
          <Text style={styles.heading}>Acesso rápido</Text>
        </View>

        {canWrite && (
          <View style={styles.headingActions}>
            <Pressable
              accessibilityLabel="Adicionar foto neste ambiente"
              style={({ pressed }) => [
                styles.roundAction,
                pressed && styles.pressed,
              ]}
              onPress={onCamera}
            >
              <Ionicons
                name="camera-outline"
                size={20}
                color={FioColors.green}
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Abrir ações deste ambiente"
              style={({ pressed }) => [
                styles.roundAction,
                styles.moreAction,
                pressed && styles.pressed,
              ]}
              onPress={onMore}
            >
              <Ionicons name="add-outline" size={22} color={FioColors.white} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.grid}>
        {ITEMS.map((item) => (
          <Pressable
            key={item.section}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${item.label} deste ambiente`}
            style={({ pressed }) => [
              styles.quickCard,
              pressed && styles.quickCardPressed,
            ]}
            onPress={() => onOpenSection(item.section)}
          >
            <View style={[styles.iconBox, { backgroundColor: item.soft }]}>
              <Ionicons name={item.icon} size={21} color={item.tone} />
            </View>
            <View style={styles.cardIdentity}>
              <Text numberOfLines={1} style={styles.cardLabel}>
                {item.label}
              </Text>
              <Text style={[styles.cardCount, { color: item.tone }]}>
                {counts[item.countKey]}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward-outline"
              size={17}
              color={FioColors.textSoft}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 13,
    padding: 11,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: FioRadius.large,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    ...FioShadow,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headingIdentity: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
    color: FioColors.gold,
  },
  heading: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '900',
    color: FioColors.text,
  },
  headingActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  roundAction: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(36, 88, 62, 0.22)',
    borderRadius: FioRadius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.84)',
  },
  moreAction: {
    borderColor: FioColors.green,
    backgroundColor: FioColors.green,
  },
  grid: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCard: {
    minHeight: 68,
    flexGrow: 1,
    flexBasis: '46%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: 'rgba(214, 216, 211, 0.82)',
    borderRadius: FioRadius.medium,
    backgroundColor: 'rgba(255, 254, 251, 0.82)',
  },
  quickCardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  iconBox: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
  },
  cardIdentity: { flex: 1, minWidth: 0 },
  cardLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: FioColors.textMuted,
  },
  cardCount: { marginTop: 2, fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.68 },
});
