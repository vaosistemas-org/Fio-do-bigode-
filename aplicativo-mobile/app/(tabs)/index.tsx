import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import {
  FioColors,
  FioRadius,
  FioShadow,
} from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type FeedPriority = 'normal' | 'important' | 'urgent';
type FeedFilter = 'all' | 'important' | 'urgent';
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
  photos?: Array<{
    id: string;
    storage_path: string;
    file_name: string | null;
  }> | null;
};

const PRIORITY_LABEL: Record<FeedPriority, string> = {
  normal: 'Normal',
  important: 'Importante',
  urgent: 'Urgente',
};

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
  })}, ${time}`;
}

function eventTypeLabel(value: string | null) {
  if (value?.startsWith('PENDENCIA_')) return 'Pendência';
  if (value?.startsWith('FOTO_')) return 'Foto';
  if (value?.startsWith('DOCUMENTO_')) return 'Documento';
  if (value?.includes('AMBIENTE')) return 'Ambiente';
  if (value?.includes('PARTICIPANTE')) return 'Equipe';
  if (value === 'DIARIO_REGISTRO_MANUAL') return 'Atualização';
  return 'Registro da obra';
}

function eventIcon(value: string | null): keyof typeof Ionicons.glyphMap {
  if (value?.startsWith('PENDENCIA_')) return 'alert-circle-outline';
  if (value?.startsWith('FOTO_')) return 'camera-outline';
  if (value?.startsWith('DOCUMENTO_')) return 'document-text-outline';
  if (value?.includes('AMBIENTE')) return 'grid-outline';
  if (value?.includes('PARTICIPANTE')) return 'people-outline';
  return 'pulse-outline';
}

export default function FioFeedScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const loadFeed = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setMessage('');

    const { data, error } = await supabase.rpc('get_my_fio_feed', {
      p_limit: 80,
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
            const { data: signedData } = await supabase.storage
              .from('work-photos')
              .createSignedUrl(photo.storage_path, 60 * 60);
            return {
              ...photo,
              signed_url: signedData?.signedUrl ?? null,
            } as FeedPhoto;
          })
        );
        return { ...event, photos } as FeedEvent;
      })
    );

    setEvents(withUrls);
    setRefreshing(false);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadFeed();
    }, [loadFeed])
  );

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    return events.filter((event) => event.priority === filter);
  }, [events, filter]);

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
        eyebrow="SUA LINHA DO TEMPO"
        title="Meu FIO"
        subtitle="Atualizações das obras das quais você faz parte."
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
        <View style={styles.introRow}>
          <View style={styles.introIdentity}>
            <Text style={styles.heading}>Acontecendo agora</Text>
            <Text style={styles.counter}>
              {events.length}{' '}
              {events.length === 1 ? 'registro visível' : 'registros visíveis'}
            </Text>
          </View>
          <Ionicons
            name="shield-checkmark-outline"
            size={21}
            color={FioColors.green}
          />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {([
            ['all', 'Tudo'],
            ['important', 'Importante'],
            ['urgent', 'Urgente'],
          ] as Array<[FeedFilter, string]>).map(([key, label]) => (
            <Pressable
              key={key}
              style={[styles.filter, filter === key && styles.filterActive]}
              onPress={() => setFilter(key)}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === key && styles.filterTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {!message && visibleEvents.length === 0 && (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pulse-outline" size={28} color={FioColors.gold} />
            </View>
            <Text style={styles.emptyTitle}>Seu FIO está tranquilo</Text>
            <Text style={styles.emptyText}>
              As próximas atualizações das suas obras aparecerão aqui.
            </Text>
          </View>
        )}

        {visibleEvents.map((event, index) => {
          const open = isOpen(event);
          const highlighted = event.priority !== 'normal';
          const urgent = event.priority === 'urgent';

          return (
            <View key={event.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View
                  style={[
                    styles.timelineIcon,
                    highlighted && styles.timelineIconImportant,
                    urgent && styles.timelineIconUrgent,
                  ]}
                >
                  <Ionicons
                    name={eventIcon(event.event_type)}
                    size={16}
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
                        size={12}
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
                      name={
                        open ? 'chevron-up-outline' : 'chevron-down-outline'
                      }
                      size={18}
                      color={FioColors.textSoft}
                    />
                  )}
                </View>

                <View style={styles.typeRow}>
                  <Text style={styles.typeText}>
                    {eventTypeLabel(event.event_type)}
                  </Text>
                  {!!event.environment_name && (
                    <Text style={styles.environmentText}>
                      · {event.environment_name}
                    </Text>
                  )}
                </View>

                {open && (
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTitle}>
                      {event.title || 'Atualização da obra'}
                    </Text>
                    {!!event.description && (
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
                          <View key={photo.id} style={styles.photoFrame}>
                            {photo.signed_url ? (
                              <Image
                                source={{ uri: photo.signed_url }}
                                style={styles.photo}
                              />
                            ) : (
                              <Ionicons
                                name="image-outline"
                                size={25}
                                color={FioColors.textSoft}
                              />
                            )}
                          </View>
                        ))}
                      </ScrollView>
                    )}

                    <View style={styles.footerRow}>
                      <View style={styles.authorRow}>
                        <Ionicons
                          name="person-circle-outline"
                          size={17}
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
                          size={16}
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

        <View style={styles.securityNote}>
          <Ionicons
            name="lock-closed-outline"
            size={15}
            color={FioColors.green}
          />
          <Text style={styles.securityText}>
            O FIO mostra apenas informações permitidas para o seu acesso em
            cada obra.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 70,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FioColors.canvas,
  },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  introRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  introIdentity: { flex: 1 },
  heading: { fontSize: 22, fontWeight: '900', color: FioColors.text },
  counter: { marginTop: 3, fontSize: 11, color: FioColors.textMuted },
  filters: { paddingTop: 16, paddingBottom: 19, gap: 8 },
  filter: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.surface,
  },
  filterActive: { borderColor: FioColors.ink, backgroundColor: FioColors.ink },
  filterText: { fontSize: 11, fontWeight: '800', color: FioColors.textMuted },
  filterTextActive: { color: FioColors.white },
  timelineRow: { flexDirection: 'row', gap: 10 },
  timelineRail: { width: 34, alignItems: 'center' },
  timelineIcon: {
    width: 34,
    height: 34,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: FioColors.green,
  },
  timelineIconImportant: { backgroundColor: FioColors.gold },
  timelineIconUrgent: { backgroundColor: FioColors.orange },
  timelineLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    backgroundColor: '#DCD8CF',
  },
  eventCard: {
    flex: 1,
    minWidth: 0,
    marginBottom: 13,
    padding: 14,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.surface,
    ...FioShadow,
  },
  eventCardImportant: {
    borderLeftWidth: 4,
    borderLeftColor: FioColors.gold,
  },
  eventCardUrgent: {
    borderLeftColor: FioColors.orange,
    backgroundColor: '#FFFCF8',
  },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventIdentity: { flex: 1, minWidth: 0 },
  workName: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  workCode: { marginTop: 2, fontSize: 9, color: FioColors.textSoft },
  priorityBadge: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.goldSoft,
  },
  priorityBadgeUrgent: { backgroundColor: FioColors.orange },
  priorityText: { fontSize: 9, fontWeight: '900', color: '#76571F' },
  priorityTextUrgent: { color: FioColors.white },
  typeRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  typeText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  environmentText: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  eventBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECE9E2',
  },
  eventTitle: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  eventDescription: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: FioColors.textMuted,
  },
  photoStrip: { paddingTop: 11, gap: 8 },
  photoFrame: {
    width: 124,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: FioColors.surfaceMuted,
  },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  footerRow: {
    marginTop: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  authorRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  authorText: { flex: 1, fontSize: 9, color: FioColors.textMuted },
  workButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: FioColors.ink,
  },
  workButtonText: {
    fontSize: 10,
    fontWeight: '900',
    color: FioColors.white,
  },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.large,
    backgroundColor: FioColors.surface,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.goldSoft,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '900',
    color: FioColors.text,
  },
  emptyText: {
    maxWidth: 310,
    marginTop: 5,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: FioColors.textMuted,
  },
  errorCard: {
    padding: 14,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.dangerSoft,
  },
  errorText: { fontSize: 12, lineHeight: 18, color: FioColors.danger },
  securityNote: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 13,
    borderRadius: 13,
    backgroundColor: FioColors.greenSoft,
  },
  securityText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 15,
    color: FioColors.green,
  },
  pressed: { opacity: 0.68 },
});
