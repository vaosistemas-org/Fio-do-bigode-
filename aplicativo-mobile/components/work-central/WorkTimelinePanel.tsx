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
import { supabase } from '@/lib/supabase';

type TimelineFilter = 'all' | 'general' | string;
type TimelineCategory = 'all' | 'updates' | 'photos' | 'pending';
type DiaryVisibility = 'internal' | 'shared';
type PhotoSource = 'camera' | 'gallery';

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
  newEntryRequest = 0,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  canWrite: boolean;
  newEntryRequest?: number;
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<DiaryVisibility>('internal');
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
  }, [newEntryRequest, canWrite]);

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
    setTitle('');
    setDescription('');
    setEnvironmentId(null);
    setVisibility('internal');
    setSelectedPhotos([]);
    setUploadProgress('');
    setModalMessage('');
  }

  function openForm() {
    resetForm();
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
        caption: title.trim(),
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
    if (!title.trim()) {
      setModalMessage('Informe o título da atualização.');
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

      const { data, error } = await supabase.rpc('create_work_diary_entry', {
        p_work_id: workId,
        p_environment_id: environmentId,
        p_title: title.trim(),
        p_description: description.trim() || null,
        p_visibility: visibility,
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
        <ActivityIndicator color="#4937D8" />
        <Text style={styles.muted}>Carregando o FIO...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.compactSummary}>
        <View style={styles.summaryItem}>
          <Ionicons name="pulse-outline" size={18} color="#4937D8" />
          <Text style={styles.summaryNumber}>{events.length}</Text>
          <Text style={styles.summaryLabel}>registros</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Ionicons name="create-outline" size={18} color="#4937D8" />
          <Text style={styles.summaryNumber}>
            {events.filter(
              (event) => event.event_type === 'DIARIO_REGISTRO_MANUAL'
            ).length}
          </Text>
          <Text style={styles.summaryLabel}>manuais</Text>
        </View>
      </View>

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
          <Ionicons name="checkmark-circle-outline" size={18} color="#207A50" />
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
                  color="#34405A"
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
                            <Text style={styles.eventTime}>
                              {formatTime(event.created_at)}
                            </Text>
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
                                      color="#8A82D5"
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
                                ]}
                              >
                                <Ionicons
                                  name={
                                    event.visibility === 'shared'
                                      ? 'eye-outline'
                                      : 'lock-closed-outline'
                                  }
                                  size={11}
                                  color={
                                    event.visibility === 'shared'
                                      ? '#207A50'
                                      : '#697386'
                                  }
                                />
                                <Text
                                  style={[
                                    styles.visibilityText,
                                    event.visibility === 'shared' &&
                                      styles.visibilityTextShared,
                                  ]}
                                >
                                  {event.visibility === 'shared'
                                    ? 'Visível'
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
                  Nova atualização
                </Text>
                <Text style={styles.modalSubtitle}>
                  Texto e fotos entram juntos na linha do tempo.
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeForm}>
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.modalContent}
            >
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Materiais recebidos"
                placeholderTextColor="#98A0AE"
                maxLength={160}
                editable={!saving}
              />

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Conte o que aconteceu"
                placeholderTextColor="#98A0AE"
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
                  <Ionicons name="camera-outline" size={21} color="#FFFFFF" />
                  <Text style={styles.photoActionPrimaryText}>Câmera</Text>
                </Pressable>
                <Pressable
                  style={styles.photoActionSecondary}
                  onPress={() => choosePhotos('gallery')}
                  disabled={saving}
                >
                  <Ionicons name="images-outline" size={20} color="#4937D8" />
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
                        <Ionicons name="close" size={15} color="#FFFFFF" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
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
                  <Ionicons name="lock-closed-outline" size={20} color="#4937D8" />
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
                  color={visibility === 'internal' ? '#4937D8' : '#A5ACB8'}
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
                  <Ionicons name="eye-outline" size={20} color="#207A50" />
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
                  color={visibility === 'shared' ? '#4937D8' : '#A5ACB8'}
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
                {saving && <ActivityIndicator color="#FFFFFF" size="small" />}
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
  muted: { fontSize: 11, color: '#7A8394' },
  compactSummary: { minHeight: 48, flexDirection: 'row', alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F2FC' },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  summaryDivider: { width: 1, height: 24, backgroundColor: '#DDD9F2' },
  summaryNumber: { fontSize: 17, fontWeight: '900', color: '#4937D8' },
  summaryLabel: { fontSize: 10, color: '#666180' },
  filterLabel: { marginTop: 12, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#727B8D' },
  filters: { paddingTop: 7, paddingBottom: 2, gap: 7 },
  filterChip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 999 },
  filterChipActive: { borderColor: '#4937D8', backgroundColor: '#ECE9FF' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#717B8E' },
  filterTextActive: { color: '#4937D8' },
  successCard: { marginTop: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 11, backgroundColor: '#EAF8F0' },
  successText: { flex: 1, fontSize: 10, color: '#207A50' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 11, color: '#B42318' },
  emptyCard: { marginTop: 10, padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: '#F6F7F9' },
  emptyTitle: { fontSize: 11, fontWeight: '700', color: '#727C8E' },
  dayGroup: { marginTop: 11 },
  dayHeader: { minHeight: 56, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#DCE0E7', borderRadius: 13, backgroundColor: '#F8F8FC' },
  dayIdentity: { flex: 1, minWidth: 0 },
  dayTitle: { fontSize: 11, fontWeight: '900', color: '#34405A' },
  daySummary: { marginTop: 3, fontSize: 9, color: '#7A8394' },
  dayCount: { minWidth: 26, height: 26, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#EAE7FF' },
  dayCountText: { fontSize: 10, fontWeight: '900', color: '#4937D8' },
  categoryFilters: { paddingTop: 8, paddingBottom: 7, gap: 6 },
  categoryChip: { minHeight: 34, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E3E9', borderRadius: 999, backgroundColor: '#FFFFFF' },
  categoryChipActive: { borderColor: '#7467DB', backgroundColor: '#F0EEFF' },
  categoryText: { fontSize: 9, fontWeight: '700', color: '#737D8F' },
  categoryTextActive: { color: '#4937D8' },
  eventRow: { flexDirection: 'row', gap: 8 },
  timelineColumn: { width: 28, alignItems: 'center' },
  eventIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#4937D8', zIndex: 2 },
  timelineLine: { width: 2, flex: 1, minHeight: 35, backgroundColor: '#DDD9F6' },
  eventCard: { flex: 1, minWidth: 0, marginBottom: 8, padding: 10, borderWidth: 1, borderColor: '#E1E4EA', borderRadius: 12, backgroundColor: '#FFFFFF' },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  eventTitle: { flex: 1, fontSize: 11, fontWeight: '800', color: '#263146' },
  eventTime: { fontSize: 9, color: '#8B93A2' },
  eventDescription: { marginTop: 4, fontSize: 10, lineHeight: 15, color: '#5E687B' },
  photoStrip: { paddingTop: 8, gap: 7 },
  timelinePhotoFrame: { width: 82, height: 68, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9, backgroundColor: '#EFEDFC' },
  timelinePhoto: { width: '100%', height: '100%', resizeMode: 'cover' },
  eventMetaRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 },
  eventScope: { flex: 1, fontSize: 9, fontWeight: '800', color: '#4937D8' },
  visibilityBadge: { minHeight: 22, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: '#F0F2F5' },
  visibilityBadgeShared: { backgroundColor: '#EAF8F0' },
  visibilityText: { fontSize: 8, fontWeight: '800', color: '#697386' },
  visibilityTextShared: { color: '#207A50' },
  actorRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventActor: { flex: 1, fontSize: 8, color: '#7C8596' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 25, 43, 0.38)' },
  modalCard: { maxHeight: '92%', padding: 18, paddingBottom: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { marginBottom: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalIdentity: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: '#172033' },
  modalSubtitle: { marginTop: 3, fontSize: 10, color: '#727C8E' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F2F5' },
  modalContent: { paddingBottom: 24 },
  label: { marginTop: 13, marginBottom: 6, fontSize: 10, fontWeight: '800', color: '#536078' },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, fontSize: 13, color: '#202B3D', backgroundColor: '#FAFBFC' },
  textarea: { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 40, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE0E7', borderRadius: 999 },
  chipActive: { borderColor: '#4937D8', backgroundColor: '#ECE9FF' },
  chipText: { fontSize: 10, fontWeight: '700', color: '#697386' },
  chipTextActive: { color: '#4937D8' },
  photoLabelRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  photoLimit: { marginBottom: 6, fontSize: 9, color: '#8A92A1' },
  photoActions: { flexDirection: 'row', gap: 8 },
  photoActionPrimary: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: '#4937D8' },
  photoActionPrimaryText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  photoActionSecondary: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BDB6EE', borderRadius: 12, backgroundColor: '#F5F3FF' },
  photoActionSecondaryText: { fontSize: 11, fontWeight: '800', color: '#4937D8' },
  selectedPhotos: { paddingTop: 9, gap: 8 },
  selectedPhotoFrame: { width: 78, height: 78, overflow: 'visible', borderRadius: 11, backgroundColor: '#EFEDFC' },
  selectedPhoto: { width: '100%', height: '100%', borderRadius: 11, resizeMode: 'cover' },
  removePhoto: { position: 'absolute', top: -5, right: -5, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 999, backgroundColor: '#263146' },
  visibilityOption: { minHeight: 58, marginBottom: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, backgroundColor: '#FFFFFF' },
  visibilityOptionActive: { borderColor: '#7467DB', backgroundColor: '#F5F3FF' },
  visibilityOptionIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#ECE9FF' },
  visibilityOptionIdentity: { flex: 1, minWidth: 0 },
  visibilityOptionTitle: { fontSize: 10, fontWeight: '800', color: '#34405A' },
  visibilityOptionSubtitle: { marginTop: 2, fontSize: 8, lineHeight: 12, color: '#7A8394' },
  modalErrorCard: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#FFF0EE' },
  saveButton: { minHeight: 50, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: '#4937D8' },
  disabledButton: { opacity: 0.55 },
  saveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
