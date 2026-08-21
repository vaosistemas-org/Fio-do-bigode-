import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type FeedPriority = 'normal' | 'important' | 'urgent';
type FeedView = 'highlights' | 'all';
type FeedCategory =
  | 'all'
  | 'photos'
  | 'pending'
  | 'diary'
  | 'documents'
  | 'environments'
  | 'team';
type WorkSection =
  | 'environments'
  | 'pending'
  | 'fio'
  | 'photos'
  | 'measurements'
  | 'documents';

type FeedPhoto = {
  id: string;
  storage_path: string;
  file_name: string | null;
  signed_url: string | null;
};

type FeedEvent = {
  id: string;
  work_id: string;
  work_code: string;
  work_name: string;
  environment_id: string | null;
  environment_name: string | null;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  visibility: string | null;
  priority: FeedPriority;
  target_section: WorkSection;
  created_at: string;
  photos: FeedPhoto[];
};

type RawFeedEvent = Omit<FeedEvent, 'photos'> & {
  photos?: {
    id: string;
    storage_path: string;
    file_name: string | null;
  }[] | null;
};

type WorkTone = {
  accent: string;
};

const INITIAL_VISIBLE_EVENTS = 12;
const LOAD_MORE_STEP = 10;

const PRIORITY_LABEL: Record<FeedPriority, string> = {
  normal: 'Normal',
  important: 'Importante',
  urgent: 'Urgente',
};

const CATEGORY_OPTIONS: {
  key: FeedCategory;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'Todos os tipos', icon: 'apps-outline' },
  { key: 'photos', label: 'Fotos', icon: 'camera-outline' },
  { key: 'pending', label: 'Pendências', icon: 'alert-circle-outline' },
  { key: 'diary', label: 'Diário', icon: 'pulse-outline' },
  { key: 'documents', label: 'Documentos', icon: 'document-text-outline' },
  { key: 'environments', label: 'Ambientes', icon: 'grid-outline' },
  { key: 'team', label: 'Equipe', icon: 'people-outline' },
];

const WORK_TONES: WorkTone[] = [
  { accent: FioColors.green },
  { accent: FioColors.gold },
  { accent: FioColors.orange },
  { accent: FioColors.textMuted },
];

function formatMoment(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (sameDay) return `Hoje, ${time}`;
  return `${date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })} · ${time}`;
}

function eventTypeLabel(value: string | null) {
  if (value?.startsWith('PENDENCIA_')) return 'Pendência';
  if (value?.startsWith('FOTO_')) return 'Foto';
  if (value?.startsWith('DOCUMENTO_')) return 'Documento';
  if (value?.includes('AMBIENTE')) return 'Ambiente';
  if (value?.includes('PARTICIPANTE') || value?.includes('EQUIPE')) return 'Equipe';
  if (value === 'DIARIO_REGISTRO_MANUAL') return 'Diário';
  return 'Atualização';
}

function eventIcon(value: string | null): keyof typeof Ionicons.glyphMap {
  if (value?.startsWith('PENDENCIA_')) return 'alert-circle-outline';
  if (value?.startsWith('FOTO_')) return 'camera-outline';
  if (value?.startsWith('DOCUMENTO_')) return 'document-text-outline';
  if (value?.includes('AMBIENTE')) return 'grid-outline';
  if (value?.includes('PARTICIPANTE') || value?.includes('EQUIPE')) {
    return 'people-outline';
  }
  return 'pulse-outline';
}

function eventCategory(value: string | null): FeedCategory {
  if (value?.startsWith('FOTO_')) return 'photos';
  if (value?.startsWith('PENDENCIA_')) return 'pending';
  if (value?.startsWith('DOCUMENTO_')) return 'documents';
  if (value?.includes('AMBIENTE')) return 'environments';
  if (value?.includes('PARTICIPANTE') || value?.includes('EQUIPE')) return 'team';
  return 'diary';
}

function isHighlight(event: FeedEvent) {
  if (event.priority !== 'normal') return true;
  if (event.event_type === 'DIARIO_REGISTRO_MANUAL') return true;
  if (event.event_type === 'FOTO_ADICIONADA') return true;
  if (event.event_type?.startsWith('DOCUMENTO_')) return true;
  return [
    'PENDENCIA_CRIADA',
    'PENDENCIA_CONCLUIDA',
    'PENDENCIA_REABERTA',
  ].includes(event.event_type ?? '');
}

function workTone(workId: string) {
  const hash = Array.from(workId).reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  return WORK_TONES[hash % WORK_TONES.length];
}

function normalizeStoragePath(value: string) {
  const marker = '/work-photos/';
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) return value.slice(markerIndex + marker.length);
  return value.replace(/^work-photos\//, '');
}

function FeedPhotoView({
  photo,
  compact = false,
}: {
  photo: FeedPhoto;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : photo.signed_url;

  return (
    <View style={compact ? styles.compactPhotoFrame : styles.photoFrame}>
      {source ? (
        <Image
          source={source}
          style={styles.photo}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={140}
          recyclingKey={photo.id}
          onError={() => setFailed(true)}
        />
      ) : (
        <View style={styles.photoFallback}>
          <Ionicons
            name="image-outline"
            size={compact ? 18 : 23}
            color={FioColors.textSoft}
          />
          {!compact && <Text style={styles.photoFallbackText}>Não carregou</Text>}
        </View>
      )}
    </View>
  );
}

export default function FioFeedScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [feedView, setFeedView] = useState<FeedView>('highlights');
  const [category, setCategory] = useState<FeedCategory>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(INITIAL_VISIBLE_EVENTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const loadFeed = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setMessage('');

    const { data, error } = await supabase.rpc('get_my_fio_feed', {
      p_limit: 60,
    });

    if (error) {
      setEvents([]);
      setMessage(error.message);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const withUrls = await Promise.all(
      ((data ?? []) as RawFeedEvent[]).map(async (event) => {
        const photos = await Promise.all(
          (event.photos ?? []).map(async (photo) => {
            const path = normalizeStoragePath(photo.storage_path);
            const { data: signedData } = await supabase.storage
              .from('work-photos')
              .createSignedUrl(path, 60 * 60);

            return {
              ...photo,
              storage_path: path,
              signed_url: signedData?.signedUrl ?? null,
            } as FeedPhoto;
          })
        );
        return { ...event, photos } as FeedEvent;
      })
    );

    setEvents(withUrls);
    setDisplayLimit(INITIAL_VISIBLE_EVENTS);
    setRefreshing(false);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  const filteredEvents = useMemo(() => {
    const byImportance =
      feedView === 'highlights' ? events.filter(isHighlight) : events;
    if (category === 'all') return byImportance;
    return byImportance.filter(
      (event) => eventCategory(event.event_type) === category
    );
  }, [category, events, feedView]);

  const visibleEvents = useMemo(
    () => filteredEvents.slice(0, displayLimit),
    [displayLimit, filteredEvents]
  );

  function selectView(nextView: FeedView) {
    setFeedView(nextView);
    setDisplayLimit(INITIAL_VISIBLE_EVENTS);
  }

  function selectCategory(nextCategory: FeedCategory) {
    setCategory(nextCategory);
    setDisplayLimit(INITIAL_VISIBLE_EVENTS);
    setFiltersOpen(false);
  }

  function isOpen(event: FeedEvent) {
    return event.priority !== 'normal' || Boolean(expanded[event.id]);
  }

  function toggle(event: FeedEvent) {
    if (event.priority !== 'normal') return;
    setExpanded((current) => ({
      ...current,
      [event.id]: !current[event.id],
    }));
  }

  function openInWork(event: FeedEvent) {
    router.push({
      pathname: '/works/[id]',
      params: {
        id: event.work_id,
        section: event.target_section,
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.loadingText}>Carregando seu FIO...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        title="Meu FIO"
        actionIcon="refresh-outline"
        actionLabel="Atualizar Meu FIO"
        onAction={() => loadFeed(true)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadFeed(true)}
            tintColor={FioColors.gold}
          />
        }
      >
        <View style={styles.toolbar}>
          <FeedViewButton
            label="Destaques"
            active={feedView === 'highlights'}
            onPress={() => selectView('highlights')}
          />
          <FeedViewButton
            label="Tudo"
            active={feedView === 'all'}
            onPress={() => selectView('all')}
          />
          <Text style={styles.counter}>{filteredEvents.length}</Text>
          <Pressable
            accessibilityLabel="Filtrar atualizações"
            style={[
              styles.filterButton,
              (filtersOpen || category !== 'all') && styles.filterButtonActive,
            ]}
            onPress={() => setFiltersOpen((current) => !current)}
          >
            <Ionicons
              name="options-outline"
              size={18}
              color={
                filtersOpen || category !== 'all'
                  ? FioColors.white
                  : FioColors.ink
              }
            />
            <Text
              style={[
                styles.filterButtonText,
                (filtersOpen || category !== 'all') &&
                  styles.filterButtonTextActive,
              ]}
            >
              Filtrar
            </Text>
          </Pressable>
        </View>

        {filtersOpen && (
          <View style={styles.filterPanel}>
            {CATEGORY_OPTIONS.map((option) => {
              const selected = category === option.key;
              return (
                <Pressable
                  key={option.key}
                  style={[
                    styles.categoryButton,
                    selected && styles.categoryButtonActive,
                  ]}
                  onPress={() => selectCategory(option.key)}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={selected ? FioColors.green : FioColors.textMuted}
                  />
                  <Text
                    style={[
                      styles.categoryButtonText,
                      selected && styles.categoryButtonTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {!message && visibleEvents.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pulse-outline" size={26} color={FioColors.gold} />
            </View>
            <Text style={styles.emptyTitle}>Nada neste filtro</Text>
            <Text style={styles.emptyText}>
              Escolha outro tipo de atualização ou abra a visualização Tudo.
            </Text>
          </View>
        )}

        {visibleEvents.map((event, index) => {
          const open = isOpen(event);
          const highlighted = event.priority !== 'normal';
          const urgent = event.priority === 'urgent';
          const tone = workTone(event.work_id);
          const summary =
            event.title || event.description || 'Atualização registrada na obra.';
          const firstPhoto = event.photos[0];

          return (
            <View key={event.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View
                  style={[
                    styles.timelineIcon,
                    { backgroundColor: tone.accent },
                    highlighted && styles.timelineIconImportant,
                    urgent && styles.timelineIconUrgent,
                  ]}
                >
                  <Ionicons
                    name={eventIcon(event.event_type)}
                    size={15}
                    color={FioColors.white}
                  />
                </View>
                {index < visibleEvents.length - 1 && (
                  <View style={styles.timelineLine} />
                )}
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  open ? 'Recolher atualização' : 'Expandir atualização'
                }
                style={({ pressed }) => [
                  styles.eventCard,
                  { borderLeftColor: tone.accent },
                  highlighted && styles.eventCardImportant,
                  urgent && styles.eventCardUrgent,
                  pressed && event.priority === 'normal' && styles.pressed,
                ]}
                onPress={() => toggle(event)}
              >
                <View style={styles.eventHeader}>
                  <View style={styles.eventIdentity}>
                    <Text style={styles.workName} numberOfLines={1}>
                      {event.work_name}
                    </Text>
                    <Text style={styles.workCode} numberOfLines={1}>
                      {event.work_code} · {formatMoment(event.created_at)}
                    </Text>
                  </View>

                  {highlighted ? (
                    <View
                      style={[
                        styles.priorityBadge,
                        urgent && styles.priorityBadgeUrgent,
                      ]}
                    >
                      <Ionicons
                        name={urgent ? 'warning-outline' : 'bookmark-outline'}
                        size={11}
                        color={urgent ? FioColors.white : '#76571F'}
                      />
                      <Text
                        style={[
                          styles.priorityText,
                          urgent && styles.priorityTextUrgent,
                        ]}
                      >
                        {PRIORITY_LABEL[event.priority]}
                      </Text>
                    </View>
                  ) : (
                    <Ionicons
                      name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
                      size={17}
                      color={FioColors.textSoft}
                    />
                  )}
                </View>

                <View style={styles.summaryRow}>
                  <View style={styles.summaryIdentity}>
                    <View style={styles.typeRow}>
                      <View
                        style={[
                          styles.typeDot,
                          { backgroundColor: tone.accent },
                        ]}
                      />
                      <Text style={[styles.typeText, { color: tone.accent }]}>
                        {eventTypeLabel(event.event_type)}
                      </Text>
                      {!!event.environment_name && (
                        <Text style={styles.environmentText} numberOfLines={1}>
                          · {event.environment_name}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.eventSummary} numberOfLines={open ? 3 : 2}>
                      {summary}
                    </Text>
                  </View>
                  {!open && firstPhoto && (
                    <FeedPhotoView photo={firstPhoto} compact />
                  )}
                </View>

                {open && (
                  <View style={styles.eventBody}>
                    {!!event.description && event.description !== event.title && (
                      <Text style={styles.eventDescription}>
                        {event.description}
                      </Text>
                    )}

                    {event.photos.length > 0 && (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.photoStrip}
                      >
                        {event.photos.map((photo) => (
                          <FeedPhotoView key={photo.id} photo={photo} />
                        ))}
                      </ScrollView>
                    )}

                    {event.event_type?.startsWith('FOTO_') &&
                      event.photos.length === 0 && (
                        <View style={styles.missingPhotoNote}>
                          <Ionicons
                            name="image-outline"
                            size={17}
                            color={FioColors.textMuted}
                          />
                          <Text style={styles.missingPhotoText}>
                            Abra a obra para ver a foto registrada.
                          </Text>
                        </View>
                      )}

                    <View style={styles.footerRow}>
                      <View style={styles.authorRow}>
                        <Ionicons
                          name="person-circle-outline"
                          size={16}
                          color={FioColors.textMuted}
                        />
                        <Text style={styles.authorText} numberOfLines={1}>
                          {event.actor_full_name || 'Usuário do FIO'}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.workButton}
                        onPress={() => openInWork(event)}
                      >
                        <Text style={styles.workButtonText}>Ver na obra</Text>
                        <Ionicons
                          name="arrow-forward-outline"
                          size={15}
                          color={FioColors.white}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}
              </Pressable>
            </View>
          );
        })}

        {visibleEvents.length < filteredEvents.length && (
          <Pressable
            style={styles.moreButton}
            onPress={() =>
              setDisplayLimit((current) => current + LOAD_MORE_STEP)
            }
          >
            <Text style={styles.moreButtonText}>Mostrar mais</Text>
            <Ionicons
              name="chevron-down-outline"
              size={16}
              color={FioColors.green}
            />
          </Pressable>
        )}

        <View style={styles.securityNote}>
          <Ionicons
            name="lock-closed-outline"
            size={14}
            color={FioColors.green}
          />
          <Text style={styles.securityText}>
            Você vê somente o que sua permissão libera em cada obra.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function FeedViewButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.viewButton, active && styles.viewButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.viewButtonText,
          active && styles.viewButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingTop: 11,
    paddingBottom: 56,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FioColors.canvas,
  },
  loadingText: { marginTop: 9, fontSize: 11, color: FioColors.textMuted },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 9,
  },
  viewButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.surface,
  },
  viewButtonActive: {
    borderColor: FioColors.green,
    backgroundColor: FioColors.green,
  },
  viewButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: FioColors.textMuted,
  },
  viewButtonTextActive: { color: FioColors.white },
  counter: {
    minWidth: 24,
    fontSize: 9,
    textAlign: 'center',
    color: FioColors.textSoft,
  },
  filterButton: {
    minHeight: 36,
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.surface,
  },
  filterButtonActive: {
    borderColor: FioColors.ink,
    backgroundColor: FioColors.green,
  },
  filterButtonText: {
    fontSize: 9,
    fontWeight: '800',
    color: FioColors.textMuted,
  },
  filterButtonTextActive: { color: FioColors.white },
  filterPanel: {
    marginBottom: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 9,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.surface,
  },
  categoryButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.surfaceMuted,
  },
  categoryButtonActive: { backgroundColor: FioColors.greenSoft },
  categoryButtonText: {
    fontSize: 9,
    fontWeight: '700',
    color: FioColors.textMuted,
  },
  categoryButtonTextActive: { fontWeight: '900', color: FioColors.green },
  timelineRow: { flexDirection: 'row', gap: 7 },
  timelineRail: { width: 30, alignItems: 'center' },
  timelineIcon: {
    width: 30,
    height: 30,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  timelineIconImportant: { backgroundColor: FioColors.gold },
  timelineIconUrgent: { backgroundColor: FioColors.orange },
  timelineLine: {
    width: 1,
    flex: 1,
    minHeight: 34,
    backgroundColor: FioColors.line,
  },
  eventCard: {
    flex: 1,
    minWidth: 0,
    marginBottom: 8,
    padding: 10,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: FioColors.line,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.surface,
  },
  eventCardImportant: {
    borderLeftWidth: 4,
    borderLeftColor: FioColors.gold,
    backgroundColor: '#423B2D',
    ...FioShadow,
  },
  eventCardUrgent: {
    borderLeftColor: FioColors.orange,
    backgroundColor: FioColors.orangeSoft,
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventIdentity: { flex: 1, minWidth: 0 },
  workName: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  workCode: { marginTop: 1, fontSize: 8, color: FioColors.textSoft },
  priorityBadge: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.goldSoft,
  },
  priorityBadgeUrgent: { backgroundColor: FioColors.orange },
  priorityText: { fontSize: 8, fontWeight: '900', color: '#76571F' },
  priorityTextUrgent: { color: FioColors.white },
  summaryRow: {
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIdentity: { flex: 1, minWidth: 0 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  typeDot: { width: 5, height: 5, borderRadius: 999 },
  typeText: { fontSize: 8, fontWeight: '900' },
  environmentText: { flex: 1, fontSize: 8, color: FioColors.textMuted },
  eventSummary: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: FioColors.text,
  },
  compactPhotoFrame: {
    width: 58,
    height: 48,
    overflow: 'hidden',
    borderRadius: 9,
    backgroundColor: FioColors.surfaceMuted,
  },
  eventBody: {
    marginTop: 9,
    paddingTop: 9,
    borderTopWidth: 1,
    borderTopColor: FioColors.line,
  },
  eventDescription: {
    fontSize: 11,
    lineHeight: 16,
    color: FioColors.textMuted,
  },
  photoStrip: { paddingTop: 9, gap: 7 },
  photoFrame: {
    width: 116,
    height: 84,
    overflow: 'hidden',
    borderRadius: 10,
    backgroundColor: FioColors.surfaceMuted,
  },
  photo: { width: '100%', height: '100%' },
  photoFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  photoFallbackText: { fontSize: 8, color: FioColors.textSoft },
  missingPhotoNote: {
    marginTop: 8,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: FioColors.surfaceMuted,
  },
  missingPhotoText: { flex: 1, fontSize: 9, color: FioColors.textMuted },
  footerRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  authorText: { flex: 1, fontSize: 8, color: FioColors.textMuted },
  workButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 11,
    borderRadius: 10,
    backgroundColor: FioColors.green,
  },
  workButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.white },
  moreButton: {
    minHeight: 42,
    marginLeft: 37,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 11,
    backgroundColor: FioColors.surface,
  },
  moreButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  emptyCard: {
    alignItems: 'center',
    padding: 26,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.large,
    backgroundColor: FioColors.surface,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.goldSoft,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: '900',
    color: FioColors.text,
  },
  emptyText: {
    maxWidth: 300,
    marginTop: 4,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 15,
    color: FioColors.textMuted,
  },
  errorCard: {
    padding: 12,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.dangerSoft,
  },
  errorText: { fontSize: 11, lineHeight: 16, color: FioColors.danger },
  securityNote: {
    marginTop: 10,
    marginLeft: 37,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 11,
    backgroundColor: FioColors.greenSoft,
  },
  securityText: { flex: 1, fontSize: 9, color: FioColors.green },
  pressed: { opacity: 0.68 },
});
