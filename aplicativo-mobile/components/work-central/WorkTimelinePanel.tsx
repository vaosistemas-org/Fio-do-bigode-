import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { WorkEnvironment } from '@/components/work-central/types';
import { WorkGeneralLinkManager } from '@/components/work-central/WorkGeneralLinkManager';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type TimelineFilter = 'all' | 'general' | string;
type TimelineCategory = 'all' | 'updates' | 'photos' | 'pending';
type DiaryVisibility = 'internal' | 'shared' | 'company';
type FioPriority = 'normal' | 'important' | 'urgent';
type PhotoSource = 'camera' | 'gallery';
type WorkStatus =
  | 'agendada'
  | 'em_andamento'
  | 'aguardando_peca'
  | 'aguardando_cliente'
  | 'finalizada';

const WORK_STATUS_OPTIONS: { value: WorkStatus; label: string }[] = [
  { value: 'agendada', label: 'Agendada' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'aguardando_peca', label: 'Aguardando peça' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente' },
  { value: 'finalizada', label: 'Finalizada' },
];

type DraftPhoto = {
  key: string;
  asset: ImagePicker.ImagePickerAsset;
  source: PhotoSource;
};

type TimelinePhoto = {
  id: string;
  storage_path: string;
  file_name: string | null;
  signed_url: string | null;
};

type WorkEvent = {
  id: string;
  environment_id: string | null;
  environment_name: string | null;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  visibility: DiaryVisibility | null;
  priority: FioPriority;
  created_at: string;
  photos: TimelinePhoto[];
};

type RawWorkEvent = Omit<WorkEvent, 'photos'> & {
  photos?: Array<{
    id: string;
    storage_path: string;
    file_name: string | null;
  }> | null;
};

function makeFileName() {
  return `fio-diario-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.jpg`;
}

function dayKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isToday(value: string) {
  return dayKey(value) === dayKey(new Date().toISOString());
}

function formatDay(value: string) {
  const label = new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return isToday(value) ? `Hoje · ${label}` : label;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventIcon(eventType: string | null): keyof typeof Ionicons.glyphMap {
  if (eventType === 'ATUALIZACAO_OPERACIONAL') return 'construct-outline';
  if (eventType?.startsWith('ENTREGA_')) return 'checkmark-done-outline';
  if (eventType?.startsWith('DOCUMENTO_')) return 'document-text-outline';
  if (eventType?.startsWith('FOTO_')) return 'camera-outline';
  if (eventType?.startsWith('PENDENCIA_')) return 'alert-circle-outline';
  if (eventType?.includes('AMBIENTE')) return 'grid-outline';
  if (eventType?.includes('PARTICIPANTE')) return 'people-outline';
  if (eventType === 'DIARIO_REGISTRO_MANUAL') return 'create-outline';
  return 'pulse-outline';
}

function isPendingEvent(event: WorkEvent) {
  return !!event.event_type?.startsWith('PENDENCIA_');
}

function isPhotoEvent(event: WorkEvent) {
  return !!event.event_type?.startsWith('FOTO_') || event.photos.length > 0;
}

function isUpdateEvent(event: WorkEvent) {
  return !isPendingEvent(event) && !event.event_type?.startsWith('FOTO_');
}

function matchesCategory(event: WorkEvent, category: TimelineCategory) {
  if (category === 'all') return true;
  if (category === 'pending') return isPendingEvent(event);
  if (category === 'photos') return isPhotoEvent(event);
  return isUpdateEvent(event);
}

function plural(value: number, singular: string, pluralLabel: string) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

export function WorkTimelinePanel({
  workId,
  environments,
  canWrite,
  canManage = false,
  workStatus,
  newEntryRequest = 0,
  environmentFilterId,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  canWrite: boolean;
  canManage?: boolean;
  workStatus: string;
  newEntryRequest?: number;
  environmentFilterId?: string;
  onChanged?: () => void;
}) {
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [dayOpen, setDayOpen] = useState<Record<string, boolean>>({});
  const [dayFilters, setDayFilters] = useState<Record<string, TimelineCategory>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [modalMessage, setModalMessage] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [doneToday, setDoneToday] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [blockers, setBlockers] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<WorkStatus | null>(null);
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<DiaryVisibility>('internal');
  const [priority, setPriority] = useState<FioPriority>('normal');
  const [selectedPhotos, setSelectedPhotos] = useState<DraftPhoto[]>([]);

  async function loadEvents() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.rpc('get_work_timeline', {
      p_work_id: workId,
    });

    if (error) {
      setMessage(error.message);
      setEvents([]);
      setLoading(false);
      return;
    }

    const withUrls = await Promise.all(
      ((data ?? []) as RawWorkEvent[]).map(async (event) => {
        const photos = await Promise.all(
          (event.photos ?? []).map(async (photo) => {
            const { data: signedData } = await supabase.storage
              .from('work-photos')
              .createSignedUrl(photo.storage_path, 60 * 60);
            return {
              ...photo,
              signed_url: signedData?.signedUrl ?? null,
            } as TimelinePhoto;
          })
        );
        return { ...event, photos } as WorkEvent;
      })
    );

    setEvents(withUrls);
    setLoading(false);
  }

  useEffect(() => {
    setDayOpen({});
    setDayFilters({});
    loadEvents();
  }, [workId]);

  useEffect(() => {
    if (newEntryRequest > 0 && canWrite) openForm();
  }, [newEntryRequest, canWrite, environmentFilterId]);

  useEffect(() => {
    setFilter(environmentFilterId ?? 'all');
  }, [environmentFilterId]);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'general') {
      return events.filter((event) => !event.environment_id);
    }
    return events.filter((event) => event.environment_id === filter);
  }, [events, filter]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{
      key: string;
      label: string;
      today: boolean;
      events: WorkEvent[];
      updates: number;
      photos: number;
      pending: number;
    }> = [];

    for (const event of visibleEvents) {
      const key = dayKey(event.created_at);
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = {
          key,
          label: formatDay(event.created_at),
          today: isToday(event.created_at),
          events: [],
          updates: 0,
          photos: 0,
          pending: 0,
        };
        groups.push(group);
      }

      group.events.push(event);
      if (isPendingEvent(event)) group.pending += 1;
      if (isPhotoEvent(event)) {
        group.photos += Math.max(event.photos.length, 1);
      }
      if (isUpdateEvent(event)) group.updates += 1;
    }

    return groups;
  }, [visibleEvents]);

  function resetForm() {
    setDoneToday('');
    setNextSteps('');
    setBlockers('');
    setSelectedStatus(null);
    setEnvironmentId(null);
    setVisibility('internal');
    setPriority('normal');
    setSelectedPhotos([]);
    setUploadProgress('');
    setModalMessage('');
  }

  function openForm() {
    resetForm();
    setEnvironmentId(environmentFilterId ?? null);
    setMessage('');
    setSuccessMessage('');
    setFormVisible(true);
  }

  function closeForm() {
    if (saving) return;
    setFormVisible(false);
    resetForm();
  }

  function addDraftPhotos(
    assets: ImagePicker.ImagePickerAsset[],
    source: PhotoSource
  ) {
    setSelectedPhotos((current) => [
      ...current,
      ...assets.map((asset, index) => ({
        key: `${asset.uri}-${Date.now()}-${index}`,
        asset,
        source,
      })),
    ].slice(0, 20));
  }

  async function choosePhotos(source: PhotoSource) {
    if (saving) return;
    if (selectedPhotos.length >= 20) {
      Alert.alert('Limite atingido', 'Você pode anexar até 20 fotos por atualização.');
      return;
    }

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Câmera não autorizada',
          'Permita o acesso à câmera para registrar a atualização.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        base64: true,
        allowsEditing: false,
      });
      if (!result.canceled) addDraftPhotos(result.assets, source);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Fotos não autorizadas',
        'Permita o acesso às fotos para anexar imagens à atualização.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 20 - selectedPhotos.length,
      orderedSelection: true,
      allowsEditing: false,
      quality: 0.75,
      base64: true,
    });
    if (!result.canceled) addDraftPhotos(result.assets, source);
  }

  async function uploadPhoto(
    eventId: string,
    draft: DraftPhoto,
    createdBy: string
  ) {
    if (!draft.asset.base64) {
      throw new Error('Não foi possível ler uma das imagens selecionadas.');
    }

    const fileName = makeFileName();
    const targetFolder = environmentId ?? 'general';
    const storagePath = `${workId}/${targetFolder}/diary/${eventId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('work-photos')
      .upload(storagePath, decode(draft.asset.base64), {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
      .from('work_photos')
      .insert({
        work_id: workId,
        environment_id: environmentId,
        diary_event_id: eventId,
        collection: 'work',
        visibility,
        storage_path: storagePath,
        file_name: draft.asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: draft.asset.fileSize ?? null,
        caption: doneToday.trim() || 'Fotos do dia',
        taken_at:
          draft.source === 'camera' ? new Date().toISOString() : null,
        created_by: createdBy,
      });

    if (insertError) {
      await supabase.storage.from('work-photos').remove([storagePath]);
      throw insertError;
    }
  }

  async function saveEntry() {
    if (!canWrite || saving) return;
    if (
      !doneToday.trim() &&
      !nextSteps.trim() &&
      !blockers.trim() &&
      selectedPhotos.length === 0 &&
      (!selectedStatus || selectedStatus === workStatus)
    ) {
      setModalMessage('Registre o que foi feito, o próximo passo, um bloqueio ou uma foto.');
      return;
    }

    setSaving(true);
    setModalMessage('');
    setMessage('');
    setSuccessMessage('');
    let eventCreated = false;
    const photoCount = selectedPhotos.length;
    const todayKey = dayKey(new Date().toISOString());

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        throw new Error('Usuário não autenticado.');
      }

      const { data, error } = await supabase.rpc('record_work_operational_update', {
        p_work_id: workId,
        p_environment_id: environmentId,
        p_status: canManage ? selectedStatus : null,
        p_done_today: doneToday.trim() || (selectedPhotos.length ? 'Fotos do dia' : null),
        p_next_steps: nextSteps.trim() || null,
        p_blockers: blockers.trim() || null,
        p_visibility: visibility,
        p_priority: priority,
      });
      if (error) throw error;

      const eventId = data as string | null;
      if (!eventId) throw new Error('O registro foi criado sem identificação.');
      eventCreated = true;

      for (let index = 0; index < selectedPhotos.length; index += 1) {
        setUploadProgress(
          `Enviando foto ${index + 1} de ${selectedPhotos.length}...`
        );
        await uploadPhoto(eventId, selectedPhotos[index], authData.user.id);
      }

      setFormVisible(false);
      resetForm();
      await loadEvents();
      setFilter('all');
      setDayOpen((current) => ({ ...current, [todayKey]: true }));
      setDayFilters((current) => ({ ...current, [todayKey]: 'all' }));
      setSuccessMessage(
        photoCount > 0
          ? 'Atualização e fotos registradas no FIO.'
          : 'Atualização registrada no FIO.'
      );
      if (photoCount > 0) onChanged?.();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar a atualização.';

      if (eventCreated) {
        setFormVisible(false);
        resetForm();
        await loadEvents();
        setFilter('all');
        setDayOpen((current) => ({ ...current, [todayKey]: true }));
        setDayFilters((current) => ({ ...current, [todayKey]: 'all' }));
        setMessage(
          `A atualização foi registrada, mas uma foto não foi enviada. ${errorMessage}`
        );
        if (photoCount > 0) onChanged?.();
      } else {
        setModalMessage(errorMessage);
      }
    } finally {
      setSaving(false);
      setUploadProgress('');
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.muted}>Carregando o FIO...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.compactSummary}>
        <View style={styles.summaryItem}>
          <Ionicons name="pulse-outline" size={18} color={FioColors.green} />
          <Text style={styles.summaryNumber}>{events.length}</Text>
          <Text style={styles.summaryLabel}>registros</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Ionicons name="create-outline" size={18} color={FioColors.green} />
          <Text style={styles.summaryNumber}>
            {events.filter(
              (event) =>
                event.event_type === 'DIARIO_REGISTRO_MANUAL' ||
                event.event_type === 'ATUALIZACAO_OPERACIONAL'
            ).length}
          </Text>
          <Text style={styles.summaryLabel}>atualizações</Text>
        </View>
      </View>

      <WorkGeneralLinkManager
        workId={workId}
        canManage={canManage}
      />

      <Text style={styles.filterLabel}>FILTRAR POR LOCAL</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <Pressable
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Tudo
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterChip,
            filter === 'general' && styles.filterChipActive,
          ]}
          onPress={() => setFilter('general')}
        >
          <Text
            style={[
              styles.filterText,
              filter === 'general' && styles.filterTextActive,
            ]}
          >
            Geral da obra
          </Text>
        </Pressable>
        {environments.map((environment) => (
          <Pressable
            key={environment.id}
            style={[
              styles.filterChip,
              filter === environment.id && styles.filterChipActive,
            ]}
            onPress={() => setFilter(environment.id)}
          >
            <Text
              style={[
                styles.filterText,
                filter === environment.id && styles.filterTextActive,
              ]}
            >
              {environment.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!successMessage && (
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle-outline" size={18} color={FioColors.success} />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      {groupedEvents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhuma atualização neste filtro</Text>
        </View>
      ) : (
        groupedEvents.map((group) => {
          const open = dayOpen[group.key] ?? group.today;
          const category = dayFilters[group.key] ?? 'all';
          const eventsForDay =
            category === 'all'
              ? group.events
              : group.events.filter(
                  (event) => matchesCategory(event, category)
                );
          const summary = [
            group.updates
              ? plural(group.updates, 'atualização', 'atualizações')
              : null,
            group.photos ? plural(group.photos, 'foto', 'fotos') : null,
            group.pending
              ? plural(group.pending, 'pendência', 'pendências')
              : null,
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <View key={group.key} style={styles.dayGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${open ? 'Recolher' : 'Expandir'} ${group.label}`}
                style={styles.dayHeader}
                onPress={() =>
                  setDayOpen((current) => ({
                    ...current,
                    [group.key]: !open,
                  }))
                }
              >
                <View style={styles.dayIdentity}>
                  <Text style={styles.dayTitle}>{group.label}</Text>
                  <Text numberOfLines={1} style={styles.daySummary}>
                    {summary}
                  </Text>
                </View>
                <View style={styles.dayCount}>
                  <Text style={styles.dayCountText}>{group.events.length}</Text>
                </View>
                <Ionicons
                  name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={21}
                  color={FioColors.text}
                />
              </Pressable>

              {open && (
                <>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryFilters}
                  >
                    {([
                      ['all', 'Tudo', group.events.length],
                      ['updates', 'Atualizações', group.updates],
                      ['photos', 'Fotos', group.photos],
                      ['pending', 'Pendências', group.pending],
                    ] as Array<[TimelineCategory, string, number]>).map(
                      ([key, label, count]) =>
                        (key === 'all' || count > 0) && (
                          <Pressable
                            key={key}
                            style={[
                              styles.categoryChip,
                              category === key && styles.categoryChipActive,
                            ]}
                            onPress={() =>
                              setDayFilters((current) => ({
                                ...current,
                                [group.key]: key,
                              }))
                            }
                          >
                            <Text
                              style={[
                                styles.categoryText,
                                category === key && styles.categoryTextActive,
                              ]}
                            >
                              {label} {count}
                            </Text>
                          </Pressable>
                        )
                    )}
                  </ScrollView>

                  {eventsForDay.map((event, index) => {
                    const hidePhotoFileName =
                      event.event_type?.startsWith('FOTO_') &&
                      event.photos.length > 0;
                    return (
                      <View key={event.id} style={styles.eventRow}>
                        <View style={styles.timelineColumn}>
                          <View style={styles.eventIcon}>
                            <Ionicons
                              name={eventIcon(event.event_type)}
                              size={15}
                              color="#FFFFFF"
                            />
                          </View>
                          {index < eventsForDay.length - 1 && (
                            <View style={styles.timelineLine} />
                          )}
                        </View>

                        <View style={styles.eventCard}>
                          <View style={styles.eventTop}>
                            <Text style={styles.eventTitle}>
                              {event.title || 'Atualização da obra'}
                            </Text>
                            <View style={styles.eventTopMeta}>
                              {event.priority !== 'normal' && (
                                <View
                                  style={[
                                    styles.eventPriority,
                                    event.priority === 'urgent' &&
                                      styles.eventPriorityUrgent,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.eventPriorityText,
                                      event.priority === 'urgent' &&
                                        styles.eventPriorityTextUrgent,
                                    ]}
                                  >
                                    {event.priority === 'urgent'
                                      ? 'Urgente'
                                      : 'Importante'}
                                  </Text>
                                </View>
                              )}
                              <Text style={styles.eventTime}>
                                {formatTime(event.created_at)}
                              </Text>
                            </View>
                          </View>

                          {!!event.description && !hidePhotoFileName && (
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
                                <View key={photo.id} style={styles.timelinePhotoFrame}>
                                  {photo.signed_url ? (
                                    <Image
                                      source={{ uri: photo.signed_url }}
                                      style={styles.timelinePhoto}
                                    />
                                  ) : (
                                    <Ionicons
                                      name="image-outline"
                                      size={24}
                                      color={FioColors.gold}
                                    />
                                  )}
                                </View>
                              ))}
                            </ScrollView>
                          )}

                          <View style={styles.eventMetaRow}>
                            <Text numberOfLines={1} style={styles.eventScope}>
                              {event.environment_name || 'Geral da obra'}
                            </Text>
                            {canWrite && (
                              <View
                                style={[
                                  styles.visibilityBadge,
                                  event.visibility === 'shared' &&
                                    styles.visibilityBadgeShared,
                                  event.visibility === 'company' &&
                                    styles.visibilityBadgeCompany,
                                ]}
                              >
                                <Ionicons
                                  name={
                                    event.visibility === 'shared'
                                      ? 'eye-outline'
                                      : event.visibility === 'company'
                                      ? 'business-outline'
                                      : 'lock-closed-outline'
                                  }
                                  size={11}
                                  color={
                                    event.visibility === 'shared'
                                      ? FioColors.success
                                      : event.visibility === 'company'
                                      ? FioColors.green
                                      : FioColors.textMuted
                                  }
                                />
                                <Text
                                  style={[
                                    styles.visibilityText,
                                    event.visibility === 'shared' &&
                                      styles.visibilityTextShared,
                                    event.visibility === 'company' &&
                                      styles.visibilityTextCompany,
                                  ]}
                                >
                                  {event.visibility === 'shared'
                                    ? 'Visível'
                                    : event.visibility === 'company'
                                    ? 'Empresa'
                                    : 'Equipe'}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.actorRow}>
                            <Ionicons
                              name="person-outline"
                              size={12}
                              color="#8A92A1"
                            />
                            <Text numberOfLines={1} style={styles.eventActor}>
                              {event.actor_full_name || 'Usuário do FIO'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </View>
          );
        })
      )}

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIdentity}>
                <Text numberOfLines={1} style={styles.modalTitle}>
                  Atualização do dia
                </Text>
                <Text style={styles.modalSubtitle}>
                  Avanço, próximos passos, bloqueios e fotos entram no FIO.
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeForm}>
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.label}>O que foi feito hoje?</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={doneToday}
                onChangeText={setDoneToday}
                placeholder="Ex.: Montagem dos armários inferiores concluída"
                placeholderTextColor={FioColors.textSoft}
                multiline
                editable={!saving}
              />

              <Text style={styles.label}>O que vem agora?</Text>
              <TextInput
                style={[styles.input, styles.textareaCompact]}
                value={nextSteps}
                onChangeText={setNextSteps}
                placeholder="Ex.: Ajustar portas e instalar puxadores"
                placeholderTextColor={FioColors.textSoft}
                multiline
                editable={!saving}
              />

              <Text style={styles.label}>Há algum bloqueio?</Text>
              <TextInput
                style={[styles.input, styles.textareaCompact]}
                value={blockers}
                onChangeText={setBlockers}
                placeholder="Ex.: Aguardando pedra da bancada"
                placeholderTextColor={FioColors.textSoft}
                multiline
                editable={!saving}
              />

              <Text style={styles.label}>Onde aconteceu?</Text>
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, environmentId === null && styles.chipActive]}
                  onPress={() => setEnvironmentId(null)}
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.chipText,
                      environmentId === null && styles.chipTextActive,
                    ]}
                  >
                    Geral da obra
                  </Text>
                </Pressable>
                {environments.map((environment) => (
                  <Pressable
                    key={environment.id}
                    style={[
                      styles.chip,
                      environmentId === environment.id && styles.chipActive,
                    ]}
                    onPress={() => setEnvironmentId(environment.id)}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        environmentId === environment.id && styles.chipTextActive,
                      ]}
                    >
                      {environment.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {canManage && (
                <>
                  <Text style={styles.label}>Status geral da obra</Text>
                  <Text style={styles.fieldHelper}>
                    O avanço percentual continua calculado pelos ambientes.
                  </Text>
                  <View style={styles.chips}>
                    {WORK_STATUS_OPTIONS.map((option) => {
                      const active = (selectedStatus ?? workStatus) === option.value;
                      return (
                        <Pressable
                          key={option.value}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelectedStatus(option.value)}
                          disabled={saving}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              )}

              <View style={styles.photoLabelRow}>
                <Text style={styles.label}>Fotos da atualização</Text>
                <Text style={styles.photoLimit}>{selectedPhotos.length}/20</Text>
              </View>
              <View style={styles.photoActions}>
                <Pressable
                  style={styles.photoActionPrimary}
                  onPress={() => choosePhotos('camera')}
                  disabled={saving}
                >
                  <Ionicons name="camera-outline" size={21} color={FioColors.textOnAccent} />
                  <Text style={styles.photoActionPrimaryText}>Câmera</Text>
                </Pressable>
                <Pressable
                  style={styles.photoActionSecondary}
                  onPress={() => choosePhotos('gallery')}
                  disabled={saving}
                >
                  <Ionicons name="images-outline" size={20} color={FioColors.green} />
                  <Text style={styles.photoActionSecondaryText}>Galeria</Text>
                </Pressable>
              </View>

              {selectedPhotos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.selectedPhotos}
                >
                  {selectedPhotos.map((photo) => (
                    <View key={photo.key} style={styles.selectedPhotoFrame}>
                      <Image
                        source={{ uri: photo.asset.uri }}
                        style={styles.selectedPhoto}
                      />
                      <Pressable
                        accessibilityLabel="Remover foto"
                        style={styles.removePhoto}
                        onPress={() =>
                          setSelectedPhotos((current) =>
                            current.filter((item) => item.key !== photo.key)
                          )
                        }
                        disabled={saving}
                      >
                        <Ionicons name="close" size={15} color={FioColors.textOnAccent} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              <Text style={styles.label}>Prioridade no FIO</Text>
              <View style={styles.chips}>
                {([
                  ['normal', 'Normal'],
                  ['important', 'Importante'],
                  ['urgent', 'Urgente'],
                ] as Array<[FioPriority, string]>).map(([value, label]) => (
                  <Pressable
                    key={value}
                    style={[
                      styles.chip,
                      priority === value && styles.chipActive,
                      priority === value && value === 'urgent' && styles.chipUrgent,
                    ]}
                    onPress={() => setPriority(value)}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        priority === value && styles.chipTextActive,
                        priority === value && value === 'urgent' && styles.chipTextUrgent,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {priority !== 'normal' && (
                <Text style={styles.priorityHelper}>
                  Este registro ficará aberto no Meu FIO de quem tiver permissão.
                </Text>
              )}

              <Text style={styles.label}>Quem pode ver?</Text>
              <Pressable
                style={[
                  styles.visibilityOption,
                  visibility === 'internal' && styles.visibilityOptionActive,
                ]}
                onPress={() => setVisibility('internal')}
                disabled={saving}
              >
                <View style={styles.visibilityOptionIcon}>
                  <Ionicons name="lock-closed-outline" size={20} color={FioColors.green} />
                </View>
                <View style={styles.visibilityOptionIdentity}>
                  <Text style={styles.visibilityOptionTitle}>Somente equipe</Text>
                  <Text style={styles.visibilityOptionSubtitle}>
                    Padrão. Não aparece no modo de visualização.
                  </Text>
                </View>
                <Ionicons
                  name={visibility === 'internal' ? 'radio-button-on' : 'radio-button-off'}
                  size={21}
                  color={visibility === 'internal' ? FioColors.green : FioColors.textSoft}
                />
              </Pressable>

              <Pressable
                style={[
                  styles.visibilityOption,
                  visibility === 'shared' && styles.visibilityOptionActive,
                ]}
                onPress={() => setVisibility('shared')}
                disabled={saving}
              >
                <View style={styles.visibilityOptionIcon}>
                  <Ionicons name="eye-outline" size={20} color={FioColors.success} />
                </View>
                <View style={styles.visibilityOptionIdentity}>
                  <Text style={styles.visibilityOptionTitle}>
                    Visível no modo de visualização
                  </Text>
                  <Text style={styles.visibilityOptionSubtitle}>
                    Libera este registro e suas fotos.
                  </Text>
                </View>
                <Ionicons
                  name={visibility === 'shared' ? 'radio-button-on' : 'radio-button-off'}
                  size={21}
                  color={visibility === 'shared' ? FioColors.green : FioColors.textSoft}
                />
              </Pressable>

              {!!modalMessage && (
                <View style={styles.modalErrorCard}>
                  <Text style={styles.errorText}>{modalMessage}</Text>
                </View>
              )}

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveEntry}
                disabled={saving}
              >
                {saving && <ActivityIndicator color={FioColors.textOnAccent} size="small" />}
                <Text style={styles.saveText}>
                  {saving
                    ? uploadProgress || 'Registrando...'
                    : 'Registrar no FIO'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: FioColors.textMuted },
  compactSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  summaryDivider: { width: 1, height: 24, backgroundColor: FioColors.lineStrong },
  summaryNumber: { fontSize: 17, fontWeight: '900', color: FioColors.green },
  summaryLabel: { fontSize: 10, color: FioColors.textMuted },
  filterLabel: { marginTop: 12, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: FioColors.textMuted },
  filters: { paddingTop: 7, paddingBottom: 2, gap: 7 },
  filterChip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: 999 },
  filterChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  filterText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  filterTextActive: { color: FioColors.green },
  successCard: { marginTop: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, backgroundColor: FioColors.successSoft },
  successText: { flex: 1, fontSize: 10, color: FioColors.success },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, color: FioColors.danger },
  emptyCard: { marginTop: 10, padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  emptyTitle: { fontSize: 11, fontWeight: '700', color: FioColors.textMuted },
  dayGroup: { marginTop: 11 },
  dayHeader: { minHeight: 56, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  dayIdentity: { flex: 1, minWidth: 0 },
  dayTitle: { fontSize: 11, fontWeight: '900', color: FioColors.text },
  daySummary: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  dayCount: { minWidth: 26, height: 26, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.goldSoft },
  dayCountText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  categoryFilters: { paddingTop: 8, paddingBottom: 7, gap: 6 },
  categoryChip: { minHeight: 34, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: 999, backgroundColor: FioColors.surface },
  categoryChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  categoryText: { fontSize: 9, fontWeight: '700', color: FioColors.textMuted },
  categoryTextActive: { color: FioColors.green },
  eventRow: { flexDirection: 'row', gap: 8 },
  timelineColumn: { width: 28, alignItems: 'center' },
  eventIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FioColors.green, zIndex: 2 },
  timelineLine: { width: 2, flex: 1, minHeight: 35, backgroundColor: FioColors.lineStrong },
  eventCard: { flex: 1, minWidth: 0, marginBottom: 8, padding: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  eventTopMeta: { alignItems: 'flex-end', gap: 4 },
  eventPriority: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: FioColors.goldSoft },
  eventPriorityUrgent: { backgroundColor: FioColors.orange },
  eventPriorityText: { fontSize: 7, fontWeight: '900', color: FioColors.gold },
  eventPriorityTextUrgent: { color: FioColors.textOnAccent },
  eventTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: FioColors.text },
  eventTime: { fontSize: 9, color: FioColors.textSoft },
  eventDescription: { marginTop: 4, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  photoStrip: { paddingTop: 8, gap: 7 },
  timelinePhotoFrame: { width: 82, height: 68, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9, backgroundColor: FioColors.surfaceMuted },
  timelinePhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  eventMetaRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  eventScope: { flex: 1, fontSize: 9, fontWeight: '800', color: FioColors.green },
  visibilityBadge: { minHeight: 22, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: FioColors.surfaceMuted },
  visibilityBadgeShared: { backgroundColor: FioColors.greenSoft },
  visibilityBadgeCompany: { backgroundColor: FioColors.greenSoft },
  visibilityText: { fontSize: 8, fontWeight: '800', color: FioColors.textMuted },
  visibilityTextShared: { color: FioColors.green },
  visibilityTextCompany: { color: FioColors.green },
  actorRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventActor: { flex: 1, fontSize: 8, color: FioColors.textSoft },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 15, 12, 0.68)' },
  modalCard: { maxHeight: '92%', padding: 18, paddingBottom: 10, borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  modalHeader: { marginBottom: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalIdentity: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: FioColors.text },
  modalSubtitle: { marginTop: 3, fontSize: 10, color: FioColors.textMuted },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surfaceRaised },
  modalContent: { paddingBottom: 24 },
  label: { marginTop: 13, marginBottom: 6, fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  fieldHelper: { marginTop: -2, marginBottom: 7, fontSize: 8, lineHeight: 12, color: FioColors.textSoft },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, fontSize: 13, color: FioColors.text, backgroundColor: FioColors.surfaceRaised },
  textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  textareaCompact: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 40, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999 },
  chipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  chipUrgent: { borderColor: FioColors.orange, backgroundColor: FioColors.orange },
  chipText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  chipTextActive: { color: FioColors.green },
  chipTextUrgent: { color: FioColors.white },
  priorityHelper: { marginTop: 6, fontSize: 8, lineHeight: 12, color: FioColors.green },
  photoLabelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  photoLimit: { marginBottom: 6, fontSize: 9, color: FioColors.textSoft },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoActionPrimary: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: FioColors.green },
  photoActionPrimaryText: { fontSize: 11, fontWeight: '800', color: FioColors.textOnAccent },
  photoActionSecondary: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.greenSoft },
  photoActionSecondaryText: { fontSize: 11, fontWeight: '800', color: FioColors.green },
  selectedPhotos: { paddingTop: 9, gap: 8 },
  selectedPhotoFrame: { width: 78, height: 78, overflow: 'visible', borderRadius: 11, backgroundColor: FioColors.surfaceMuted },
  selectedPhoto: { width: '100%', height: '100%', borderRadius: 11, resizeMode: 'cover' },
  removePhoto: { position: 'absolute', top: -5, right: -5, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 999, backgroundColor: '#263146' },
  visibilityOption: { minHeight: 58, marginBottom: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  visibilityOptionActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  visibilityOptionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FioColors.greenSoft },
  visibilityOptionIdentity: { flex: 1, minWidth: 0 },
  visibilityOptionTitle: { fontSize: 10, fontWeight: '800', color: FioColors.text },
  visibilityOptionSubtitle: { marginTop: 2, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  modalErrorCard: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: FioColors.dangerSoft },
  saveButton: { minHeight: 50, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: FioColors.green },
  disabledButton: { opacity: 0.55 },
  saveText: { fontSize: 13, fontWeight: '800', color: FioColors.textOnAccent },
});
