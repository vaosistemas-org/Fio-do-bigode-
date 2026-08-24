import { decode } from 'base64-arraybuffer';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  WorkEnvironment,
  WorkParticipant,
} from '@/components/work-central/types';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Priority = 'low' | 'normal' | 'high' | 'urgent';
type PendingStatus = 'open' | 'completed';

type PendingItem = {
  id: string;
  work_id: string;
  environment_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  responsible_user_id: string | null;
  due_date: string | null;
  blocks_delivery: boolean;
  status: PendingStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PendingPhoto = {
  id: string;
  pending_item_id: string;
  storage_path: string;
  file_name: string | null;
  created_by: string | null;
  created_at: string;
  signed_url: string | null;
};

type PieceTrack = {
  id: string;
  pending_item_id: string;
  status: string;
  expected_date: string | null;
  last_status_at: string;
};

type PhotoSource = 'camera' | 'gallery';

const PRIORITIES: Array<{
  value: Priority;
  label: string;
}> = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Importante' },
  { value: 'urgent', label: 'Urgente' },
];

const PRIORITY_ORDER: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

function formatDate(value: string | null) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function toDateValue(value: string | null) {
  if (!value) return new Date();
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeEvidenceFileName() {
  return `bo-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.jpg`;
}

export function WorkPendingPanel({
  workId,
  environments,
  participants,
  canWrite,
  canManage,
  userId,
  newRequest = 0,
  environmentFilterId,
  focusPendingItemId,
  onOpenCountChange,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  canWrite: boolean;
  canManage: boolean;
  userId: string | null;
  newRequest?: number;
  environmentFilterId?: string;
  focusPendingItemId?: string;
  onOpenCountChange?: (count: number) => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [pieceTracks, setPieceTracks] = useState<PieceTrack[]>([]);
  const [tab, setTab] = useState<PendingStatus>('open');
  const [trackingOnly, setTrackingOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('normal');
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [blocksDelivery, setBlocksDelivery] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const environmentNames = useMemo(
    () =>
      Object.fromEntries(
        environments.map((environment) => [
          environment.id,
          environment.name,
        ])
      ),
    [environments]
  );
  const participantNames = useMemo(
    () =>
      Object.fromEntries(
        participants.map((participant) => [
          participant.user_id,
          participant.full_name,
        ])
      ),
    [participants]
  );
  const operationalParticipants = participants.filter(
    (participant) => participant.access_level !== 'viewer'
  );

  async function loadItems() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('work_pending_items')
      .select(`
        id, work_id, environment_id, title, description,
        priority, responsible_user_id, due_date,
        blocks_delivery, status, completed_at,
        created_at, updated_at
      `)
      .eq('work_id', workId)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      setItems([]);
    } else {
      const loaded = (data ?? []) as PendingItem[];
      setItems(loaded);
      const focusedItem = focusPendingItemId
        ? loaded.find((item) => item.id === focusPendingItemId)
        : null;
      if (focusedItem) {
        setTab(focusedItem.status === 'completed' ? 'completed' : 'open');
        setExpandedId(focusedItem.id);
      }
      onOpenCountChange?.(
        loaded.filter((item) => item.status === 'open').length
      );
      const tracksResult = await supabase
        .from('work_piece_tracks')
        .select('id, pending_item_id, status, expected_date, last_status_at')
        .eq('work_id', workId);
      if (!tracksResult.error) {
        setPieceTracks((tracksResult.data ?? []) as PieceTrack[]);
      }
    }
    setLoading(false);
  }

  async function loadPhotos() {
    if (!canWrite) {
      setPhotos([]);
      return;
    }

    setPhotoMessage('');
    const { data, error } = await supabase
      .from('work_pending_photos')
      .select(`
        id, pending_item_id, storage_path, file_name,
        created_by, created_at
      `)
      .eq('work_id', workId)
      .order('created_at', { ascending: false });

    if (error) {
      setPhotos([]);
      setPhotoMessage(error.message);
      return;
    }

    const rows = (data ?? []) as Array<
      Omit<PendingPhoto, 'signed_url'>
    >;

    const withUrls = await Promise.all(
      rows.map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('work-pending-photos')
          .createSignedUrl(photo.storage_path, 60 * 60);

        return {
          ...photo,
          signed_url: signedData?.signedUrl ?? null,
        } as PendingPhoto;
      })
    );

    setPhotos(withUrls);
  }

  useEffect(() => {
    loadItems();
  }, [workId, focusPendingItemId]);

  useEffect(() => {
    loadPhotos();
  }, [workId, canWrite]);

  useEffect(() => {
    if (newRequest > 0 && canWrite) openNew();
  }, [newRequest, canWrite, environmentFilterId]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setEnvironmentId(null);
    setPriority('normal');
    setResponsibleId(null);
    setDueDate(null);
    setBlocksDelivery(false);
    setShowDatePicker(false);
  }

  function openNew() {
    resetForm();
    setEnvironmentId(environmentFilterId ?? null);
    setFormVisible(true);
  }

  function openEdit(item: PendingItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description ?? '');
    setEnvironmentId(item.environment_id);
    setPriority(item.priority);
    setResponsibleId(item.responsible_user_id);
    setDueDate(item.due_date);
    setBlocksDelivery(item.blocks_delivery);
    setShowDatePicker(false);
    setFormVisible(true);
  }

  async function saveItem() {
    if (!canWrite || saving) return;
    if (!title.trim()) {
      setMessage('Informe o título da pendência.');
      return;
    }

    setSaving(true);
    setMessage('');
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage('Usuário não autenticado.');
      setSaving(false);
      return;
    }

    const values = {
      environment_id: environmentId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      responsible_user_id: responsibleId,
      due_date: dueDate,
      blocks_delivery: blocksDelivery,
      updated_by: authData.user.id,
    };

    const result = editingId
      ? await supabase
          .from('work_pending_items')
          .update(values)
          .eq('id', editingId)
      : await supabase.from('work_pending_items').insert({
          ...values,
          work_id: workId,
          created_by: authData.user.id,
        });

    if (result.error) {
      setMessage(result.error.message);
      setSaving(false);
      return;
    }

    setFormVisible(false);
    resetForm();
    await loadItems();
    onChanged?.();
    setSaving(false);
  }

  async function changeStatus(item: PendingItem) {
    if (!canWrite || changingId) return;
    setChangingId(item.id);
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    const nextStatus: PendingStatus =
      item.status === 'open' ? 'completed' : 'open';
    const { error } = await supabase
      .from('work_pending_items')
      .update({
        status: nextStatus,
        completed_at:
          nextStatus === 'completed'
            ? new Date().toISOString()
            : null,
        completed_by:
          nextStatus === 'completed'
            ? authData.user?.id ?? null
            : null,
        updated_by: authData.user?.id ?? null,
      })
      .eq('id', item.id);

    if (error) setMessage(error.message);
    else {
      await loadItems();
      onChanged?.();
    }
    setChangingId(null);
  }

  async function uploadPhoto(
    pendingItemId: string,
    asset: ImagePicker.ImagePickerAsset,
    source: PhotoSource,
    createdBy: string
  ) {
    if (!asset.base64) {
      throw new Error('Não foi possível ler a imagem selecionada.');
    }

    const fileName = makeEvidenceFileName();
    const storagePath = `${workId}/${pendingItemId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('work-pending-photos')
      .upload(storagePath, decode(asset.base64), {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
      .from('work_pending_photos')
      .insert({
        pending_item_id: pendingItemId,
        work_id: workId,
        storage_path: storagePath,
        file_name: asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: asset.fileSize ?? null,
        taken_at:
          source === 'camera' ? new Date().toISOString() : null,
        created_by: createdBy,
      });

    if (insertError) {
      await supabase.storage
        .from('work-pending-photos')
        .remove([storagePath]);
      throw insertError;
    }
  }

  async function uploadPhotos(
    pendingItemId: string,
    assets: ImagePicker.ImagePickerAsset[],
    source: PhotoSource
  ) {
    if (!canWrite || uploadingId || assets.length === 0) return;

    setUploadingId(pendingItemId);
    setPhotoMessage('');

    try {
      const { data: authData, error: authError } =
        await supabase.auth.getUser();

      if (authError || !authData.user) {
        throw new Error('Usuário não autenticado.');
      }

      for (let index = 0; index < assets.length; index += 1) {
        setUploadProgress(`Enviando ${index + 1} de ${assets.length}...`);
        await uploadPhoto(
          pendingItemId,
          assets[index],
          source,
          authData.user.id
        );
      }

      await loadPhotos();
      setExpandedId(pendingItemId);
    } catch (error) {
      setPhotoMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar as fotos de B.O.'
      );
    } finally {
      setUploadingId(null);
      setUploadProgress('');
    }
  }

  async function choosePhotos(
    pendingItemId: string,
    source: PhotoSource
  ) {
    if (!canWrite || uploadingId) return;

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Câmera não autorizada',
          'Permita o acesso à câmera para registrar a evidência.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled) {
        await uploadPhotos(pendingItemId, result.assets, source);
      }
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Fotos não autorizadas',
        'Permita o acesso às fotos para adicionar as evidências.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 20,
      orderedSelection: true,
      allowsEditing: false,
      quality: 0.75,
      base64: true,
    });

    if (!result.canceled) {
      await uploadPhotos(pendingItemId, result.assets, source);
    }
  }

  function canDeletePhoto(photo: PendingPhoto) {
    return (
      canManage ||
      (canWrite && !!userId && photo.created_by === userId)
    );
  }

  function confirmDeletePhoto(photo: PendingPhoto) {
    if (!canDeletePhoto(photo) || deletingPhotoId) return;

    Alert.alert(
      'Excluir evidência?',
      'A foto será removida permanentemente da pasta de B.O.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => deletePhoto(photo),
        },
      ]
    );
  }

  async function deletePhoto(photo: PendingPhoto) {
    setDeletingPhotoId(photo.id);
    setPhotoMessage('');

    const { error: storageError } = await supabase.storage
      .from('work-pending-photos')
      .remove([photo.storage_path]);

    if (storageError) {
      setPhotoMessage(storageError.message);
      setDeletingPhotoId(null);
      return;
    }

    const { error } = await supabase
      .from('work_pending_photos')
      .delete()
      .eq('id', photo.id);

    if (error) setPhotoMessage(error.message);
    else await loadPhotos();

    setDeletingPhotoId(null);
  }

  const scopedItems = environmentFilterId
    ? items.filter((item) => item.environment_id === environmentFilterId)
    : items;
  const visibleItems = scopedItems
    .filter((item) => item.status === tab)
    .filter((item) => !trackingOnly || pieceTracks.some((track) => track.pending_item_id === item.id))
    .sort((a, b) => {
      if (a.blocks_delivery !== b.blocks_delivery) {
        return a.blocks_delivery ? -1 : 1;
      }
      return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    });
  const openCount = scopedItems.filter((item) => item.status === 'open').length;
  const completedCount = scopedItems.length - openCount;
  const trackedCount = scopedItems.filter((item) => pieceTracks.some((track) => track.pending_item_id === item.id)).length;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.muted}>Carregando pendências...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Abertas</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {scopedItems.filter(
              (item) => item.blocks_delivery && item.status === 'open'
            ).length}
          </Text>
          <Text style={styles.summaryLabel}>Impedem entrega</Text>
        </View>
      </View>

      {canWrite && (
        <Pressable style={styles.newButton} onPress={openNew}>
          <Ionicons name="add-outline" size={20} color="#FFFFFF" />
          <Text style={styles.newButtonText}>Nova pendência</Text>
        </Pressable>
      )}

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'open' && styles.tabActive]}
          onPress={() => setTab('open')}
        >
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>
            Abertas ({openCount})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => setTab('completed')}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            Concluídas ({completedCount})
          </Text>
        </Pressable>
      </View>

      {trackedCount > 0 && (
        <Pressable
          style={[styles.trackingFilter, trackingOnly && styles.trackingFilterActive]}
          onPress={() => setTrackingOnly((current) => !current)}
        >
          <Ionicons name="cube-outline" size={16} color={trackingOnly ? FioColors.textOnAccent : FioColors.gold} />
          <Text style={[styles.trackingFilterText, trackingOnly && styles.trackingFilterTextActive]}>
            Peças em rastreio ({trackedCount})
          </Text>
        </Pressable>
      )}

      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      {visibleItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {tab === 'open' ? 'Nenhuma pendência aberta' : 'Nenhuma pendência concluída'}
          </Text>
        </View>
      ) : (
        visibleItems.map((item) => {
          const expanded = expandedId === item.id;
          const pieceTrack = pieceTracks.find((track) => track.pending_item_id === item.id);
          const itemPhotos = photos.filter(
            (photo) => photo.pending_item_id === item.id
          );
          return (
            <View key={item.id} style={styles.itemCard}>
              <Pressable
                style={styles.itemHeader}
                onPress={() => setExpandedId(expanded ? null : item.id)}
              >
                <View style={styles.itemIdentity}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.priorityBadge, styles[`priority_${item.priority}`]]}>
                      <Text style={styles.priorityText}>
                        {PRIORITIES.find((option) => option.value === item.priority)?.label ?? 'Normal'}
                      </Text>
                    </View>
                    {item.blocks_delivery && (
                      <View style={styles.blockBadge}>
                        <Text style={styles.blockText}>Impede a entrega</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>
                    {item.environment_id
                      ? environmentNames[item.environment_id] ?? 'Ambiente'
                      : 'Geral da obra'}
                    {' · '}
                    {formatDate(item.due_date)}
                  </Text>
                  {canWrite && itemPhotos.length > 0 && (
                    <View style={styles.photoCountRow}>
                      <Ionicons name="lock-closed-outline" size={12} color="#6B5FC7" />
                      <Text style={styles.photoCountText}>
                        {itemPhotos.length}{' '}
                        {itemPhotos.length === 1 ? 'foto no B.O.' : 'fotos no B.O.'}
                      </Text>
                    </View>
                  )}
                  {pieceTrack && (
                    <View style={styles.trackingBadge}>
                      <Ionicons name="cube-outline" size={12} color={FioColors.gold} />
                      <Text style={styles.trackingBadgeText}>Peça: {pieceTrack.status.replaceAll('_', ' ')}</Text>
                    </View>
                  )}
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={20}
                  color={FioColors.text}
                />
              </Pressable>

              {expanded && (
                <View style={styles.itemBody}>
                  {!!item.description && (
                    <Text style={styles.description}>{item.description}</Text>
                  )}
                  <Text style={styles.detail}>
                    Responsável: {item.responsible_user_id
                      ? participantNames[item.responsible_user_id] ?? 'Responsável'
                      : 'Não definido'}
                  </Text>
                  {canWrite && (
                    <View style={styles.evidenceFolder}>
                      <View style={styles.evidenceHeader}>
                        <View style={styles.evidenceIcon}>
                          <Ionicons name="folder-outline" size={19} color={FioColors.green} />
                        </View>
                        <View style={styles.evidenceIdentity}>
                          <Text numberOfLines={1} style={styles.evidenceTitle}>B.O. interno</Text>
                          <Text numberOfLines={2} style={styles.evidenceHelp}>
                            Evidências ocultas na visualização.
                          </Text>
                        </View>
                        <View style={styles.evidenceCount}>
                          <Text style={styles.evidenceCountText}>{itemPhotos.length}</Text>
                        </View>
                      </View>

                      {itemPhotos.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.evidenceGallery}
                        >
                          {itemPhotos.map((photo) => (
                            <View key={photo.id} style={styles.evidencePhotoCard}>
                              {photo.signed_url ? (
                                <Image
                                  source={{ uri: photo.signed_url }}
                                  style={styles.evidencePhoto}
                                />
                              ) : (
                                <View style={styles.evidencePhotoFallback}>
                                  <Ionicons name="image-outline" size={22} color="#8A91A0" />
                                </View>
                              )}
                              {canDeletePhoto(photo) && (
                                <Pressable
                                  style={styles.deletePhotoButton}
                                  onPress={() => confirmDeletePhoto(photo)}
                                  disabled={deletingPhotoId !== null}
                                >
                                  {deletingPhotoId === photo.id ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                  ) : (
                                    <Ionicons name="trash-outline" size={14} color="#FFFFFF" />
                                  )}
                                </Pressable>
                              )}
                            </View>
                          ))}
                        </ScrollView>
                      )}

                      {uploadingId === item.id ? (
                        <View style={styles.uploadingRow}>
                          <ActivityIndicator size="small" color={FioColors.green} />
                          <Text style={styles.uploadingText}>{uploadProgress}</Text>
                        </View>
                      ) : (
                        <View style={styles.evidenceActions}>
                          <Pressable
                            style={styles.evidencePrimaryButton}
                            onPress={() => choosePhotos(item.id, 'camera')}
                            disabled={uploadingId !== null}
                          >
                            <Ionicons name="camera-outline" size={18} color="#FFFFFF" />
                            <Text numberOfLines={1} style={styles.evidencePrimaryText}>Câmera</Text>
                          </Pressable>
                          <Pressable
                            style={styles.evidenceSecondaryButton}
                            onPress={() => choosePhotos(item.id, 'gallery')}
                            disabled={uploadingId !== null}
                          >
                            <Ionicons name="images-outline" size={18} color={FioColors.green} />
                            <Text numberOfLines={1} style={styles.evidenceSecondaryText}>Galeria</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  )}
                  {canWrite && !!photoMessage && expandedId === item.id && (
                    <View style={styles.photoErrorCard}>
                      <Text style={styles.errorText}>{photoMessage}</Text>
                    </View>
                  )}
                  {canWrite && (
                    <View style={styles.itemActions}>
                      <Pressable
                        style={styles.trackButton}
                        onPress={() => router.push({ pathname: '/piece-tracking', params: { workId, pendingId: item.id } })}
                      >
                        <Ionicons name="cube-outline" size={16} color={FioColors.gold} />
                        <Text style={styles.trackButtonText}>{pieceTrack ? 'Ver rastreio' : 'Rastrear peça'}</Text>
                      </Pressable>
                      <Pressable style={styles.editButton} onPress={() => openEdit(item)}>
                        <Text style={styles.editText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.finishButton}
                        onPress={() => changeStatus(item)}
                        disabled={changingId !== null}
                      >
                        <Text style={styles.finishText}>
                          {changingId === item.id
                            ? 'Salvando...'
                            : item.status === 'open'
                            ? 'Concluir'
                            : 'Reabrir'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Editar pendência' : 'Nova pendência'}
              </Text>
              <Pressable style={styles.closeButton} onPress={() => setFormVisible(false)}>
                <Ionicons name="close-outline" size={25} color={FioColors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="O que precisa ser resolvido?"
                placeholderTextColor="#98A0AE"
                maxLength={160}
              />

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Detalhes importantes"
                placeholderTextColor="#98A0AE"
                multiline
              />

              <Text style={styles.label}>Local</Text>
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, environmentId === null && styles.chipActive]}
                  onPress={() => setEnvironmentId(null)}
                >
                  <Text style={[styles.chipText, environmentId === null && styles.chipTextActive]}>
                    Geral da obra
                  </Text>
                </Pressable>
                {environments.map((environment) => (
                  <Pressable
                    key={environment.id}
                    style={[styles.chip, environmentId === environment.id && styles.chipActive]}
                    onPress={() => setEnvironmentId(environment.id)}
                  >
                    <Text style={[styles.chipText, environmentId === environment.id && styles.chipTextActive]}>
                      {environment.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Prioridade</Text>
              <View style={styles.chips}>
                {PRIORITIES.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, priority === option.value && styles.chipActive]}
                    onPress={() => setPriority(option.value)}
                  >
                    <Text style={[styles.chipText, priority === option.value && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.priorityInfo}>
                <Ionicons
                  name="information-circle-outline"
                  size={15}
                  color={FioColors.green}
                />
                <Text style={styles.priorityInfoText}>
                  Importante e Urgente ficam abertos no Meu FIO de quem tiver
                  permissão para ver esta pendência.
                </Text>
              </View>

              <Text style={styles.label}>Responsável</Text>
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, responsibleId === null && styles.chipActive]}
                  onPress={() => setResponsibleId(null)}
                >
                  <Text style={[styles.chipText, responsibleId === null && styles.chipTextActive]}>
                    Não definido
                  </Text>
                </Pressable>
                {operationalParticipants.map((participant) => (
                  <Pressable
                    key={participant.user_id}
                    style={[styles.chip, responsibleId === participant.user_id && styles.chipActive]}
                    onPress={() => setResponsibleId(participant.user_id)}
                  >
                    <Text style={[styles.chipText, responsibleId === participant.user_id && styles.chipTextActive]}>
                      {participant.full_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Prazo</Text>
              <View style={styles.dateRow}>
                <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color={FioColors.green} />
                  <Text style={styles.dateText}>{formatDate(dueDate)}</Text>
                </Pressable>
                {!!dueDate && (
                  <Pressable style={styles.clearDateButton} onPress={() => setDueDate(null)}>
                    <Text style={styles.clearDateText}>Limpar</Text>
                  </Pressable>
                )}
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={toDateValue(dueDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_event, value) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (value) setDueDate(toIsoDate(value));
                  }}
                />
              )}

              <View style={styles.switchRow}>
                <View style={styles.switchIdentity}>
                  <Text style={styles.switchTitle}>Impede a entrega</Text>
                  <Text style={styles.switchHelp}>
                    Destaca esta pendência como bloqueio da obra.
                  </Text>
                </View>
                <Switch
                  value={blocksDelivery}
                  onValueChange={setBlocksDelivery}
                  trackColor={{ false: '#D6DAE2', true: '#BEB7F4' }}
                  thumbColor={blocksDelivery ? FioColors.green : FioColors.textSoft}
                />
              </View>

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveItem}
                disabled={saving}
              >
                <Text style={styles.saveText}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar pendência'}
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
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  summaryNumber: { fontSize: 22, fontWeight: '900', color: FioColors.green },
  summaryLabel: { marginTop: 2, fontSize: 10, color: FioColors.textMuted },
  newButton: { minHeight: 46, marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: FioColors.green },
  newButtonText: { fontSize: 12, fontWeight: '800', color: FioColors.textOnAccent },
  tabs: { marginTop: 13, flexDirection: 'row', gap: 8 },
  tab: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  tabActive: { backgroundColor: FioColors.greenSoft },
  tabText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  tabTextActive: { color: FioColors.green },
  trackingFilter: { minHeight: 39, marginTop: 9, alignSelf: 'flex-start', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.gold, borderRadius: 999, backgroundColor: FioColors.goldSoft },
  trackingFilterActive: { backgroundColor: FioColors.gold },
  trackingFilterText: { fontSize: 10, fontWeight: '900', color: FioColors.gold },
  trackingFilterTextActive: { color: FioColors.textOnAccent },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, lineHeight: 16, color: FioColors.danger },
  emptyCard: { marginTop: 10, padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  emptyTitle: { fontSize: 12, fontWeight: '700', color: FioColors.textMuted },
  itemCard: { marginTop: 8, overflow: 'hidden', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.surface },
  itemHeader: { minHeight: 64, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemIdentity: { flex: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  priority_low: { backgroundColor: FioColors.surfaceMuted },
  priority_normal: { backgroundColor: FioColors.greenSoft },
  priority_high: { backgroundColor: FioColors.goldSoft },
  priority_urgent: { backgroundColor: FioColors.orangeSoft },
  priorityText: { fontSize: 8, fontWeight: '800', color: FioColors.textMuted },
  blockBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: FioColors.dangerSoft },
  blockText: { fontSize: 8, fontWeight: '900', color: FioColors.danger },
  itemTitle: { marginTop: 5, fontSize: 12, fontWeight: '800', color: FioColors.text },
  itemMeta: { marginTop: 3, fontSize: 10, color: FioColors.textMuted },
  photoCountRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  photoCountText: { fontSize: 9, fontWeight: '700', color: FioColors.gold },
  trackingBadge: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  trackingBadgeText: { fontSize: 9, fontWeight: '900', color: FioColors.gold },
  itemBody: { padding: 10, paddingTop: 2, borderTopWidth: 1, borderTopColor: FioColors.line },
  description: { marginTop: 9, fontSize: 12, lineHeight: 17, color: FioColors.textMuted },
  detail: { marginTop: 8, fontSize: 10, color: FioColors.textMuted },
  evidenceFolder: { marginTop: 10, padding: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  evidenceHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  evidenceIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FioColors.goldSoft },
  evidenceIdentity: { flex: 1, minWidth: 0 },
  evidenceTitle: { fontSize: 10, fontWeight: '900', color: FioColors.text },
  evidenceHelp: { marginTop: 2, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  evidenceCount: { minWidth: 26, height: 26, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.green },
  evidenceCountText: { fontSize: 10, fontWeight: '900', color: FioColors.textOnAccent },
  evidenceGallery: { paddingTop: 10, gap: 8 },
  evidencePhotoCard: { width: 76, height: 76, overflow: 'hidden', borderRadius: 9, backgroundColor: FioColors.surfaceMuted },
  evidencePhoto: { width: '100%', height: '100%' },
  evidencePhotoFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  deletePhotoButton: { position: 'absolute', top: 5, right: 5, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(150, 28, 20, 0.9)' },
  evidenceActions: { marginTop: 9, flexDirection: 'row', gap: 7 },
  evidencePrimaryButton: { minHeight: 42, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, backgroundColor: FioColors.green },
  evidencePrimaryText: { fontSize: 10, fontWeight: '800', color: FioColors.textOnAccent },
  evidenceSecondaryButton: { minHeight: 42, flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  evidenceSecondaryText: { fontSize: 10, fontWeight: '800', color: FioColors.green },
  uploadingRow: { minHeight: 44, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  uploadingText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  photoErrorCard: { marginTop: 8, padding: 10, borderRadius: 10, backgroundColor: FioColors.dangerSoft },
  itemActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  trackButton: { minHeight: 42, flex: 1.25, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.gold, borderRadius: 11, backgroundColor: FioColors.goldSoft },
  trackButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.gold },
  editButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 },
  editText: { fontSize: 11, fontWeight: '800', color: FioColors.green },
  finishButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  finishText: { fontSize: 11, fontWeight: '800', color: FioColors.textOnAccent },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 15, 12, 0.68)' },
  modalCard: { maxHeight: '92%', padding: 18, paddingBottom: 26, borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  modalHeader: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 21, fontWeight: '900', color: FioColors.text },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surfaceRaised },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, fontSize: 13, color: FioColors.text, backgroundColor: FioColors.surfaceRaised },
  textarea: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999, backgroundColor: FioColors.surface },
  chipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  chipText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  chipTextActive: { color: FioColors.green },
  priorityInfo: { marginTop: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 5 },
  priorityInfoText: { flex: 1, fontSize: 8, lineHeight: 12, color: FioColors.green },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateButton: { minHeight: 44, flex: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 },
  dateText: { fontSize: 11, fontWeight: '700', color: FioColors.textMuted },
  clearDateButton: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  clearDateText: { fontSize: 10, fontWeight: '800', color: '#B42318' },
  switchRow: { marginTop: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, backgroundColor: '#30483A' },
  switchIdentity: { flex: 1 },
  switchTitle: { fontSize: 12, fontWeight: '800', color: FioColors.text },
  switchHelp: { marginTop: 3, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  saveButton: { minHeight: 50, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: FioColors.green },
  disabledButton: { opacity: 0.55 },
  saveText: { fontSize: 13, fontWeight: '800', color: FioColors.textOnAccent },
});
