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
  View,
} from 'react-native';

import { WorkEnvironment } from '@/components/work-central/types';
import { supabase } from '@/lib/supabase';

type PhotoSource = 'camera' | 'gallery';
type GroupKey = 'general' | string;
type PhotoVisibility = 'internal' | 'shared';

type WorkPhoto = {
  id: string;
  environment_id: string | null;
  storage_path: string;
  file_name: string | null;
  caption: string | null;
  visibility: PhotoVisibility;
  photo_type: 'general' | 'delivery_final';
  created_by: string | null;
  created_at: string;
  signed_url: string | null;
};

const PHOTO_VISIBILITY_OPTIONS: {
  value: PhotoVisibility;
  label: string;
  detail: string;
}[] = [
  {
    value: 'shared',
    label: 'Compartilhada',
    detail: 'Participantes autorizados e modo de visualização.',
  },
  {
    value: 'internal',
    label: 'Interna',
    detail: 'Somente quem pode escrever na operação da obra.',
  },
];

function makeFileName() {
  return `fio-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.jpg`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WorkPhotosPanel({
  workId,
  environments,
  canWrite,
  canManage,
  userId,
  cameraRequest,
  compareRequest,
  onCompareRequestHandled,
  environmentFilterId,
  onCameraRequestHandled,
  onCountChange,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  canWrite: boolean;
  canManage: boolean;
  userId: string | null;
  cameraRequest: number;
  compareRequest: number;
  onCompareRequestHandled?: () => void;
  environmentFilterId?: string;
  onCameraRequestHandled?: () => void;
  onCountChange?: (count: number) => void;
  onChanged?: () => void;
}) {
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [openGroup, setOpenGroup] = useState<GroupKey | null>(null);
  const [targetVisible, setTargetVisible] = useState(false);
  const [pendingSource, setPendingSource] =
    useState<PhotoSource>('camera');
  const [photoVisibility, setPhotoVisibility] =
    useState<PhotoVisibility>('shared');
  const [compareVisible, setCompareVisible] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  async function loadPhotos() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('work_photos')
      .select(`
        id, environment_id, storage_path, file_name,
        caption, visibility, photo_type, created_by, created_at
      `)
      .eq('work_id', workId)
      .eq('collection', 'work')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      setPhotos([]);
      setLoading(false);
      return;
    }

    const withUrls = await Promise.all(
      (data ?? []).map(async (photo) => {
        const { data: signedData } = await supabase.storage
          .from('work-photos')
          .createSignedUrl(photo.storage_path, 60 * 60);
        return {
          ...photo,
          signed_url: signedData?.signedUrl ?? null,
        } as WorkPhoto;
      })
    );

    setPhotos(withUrls);
    onCountChange?.(withUrls.length);
    setLoading(false);
  }

  useEffect(() => {
    loadPhotos();
  }, [workId]);

  useEffect(() => {
    if (cameraRequest > 0 && canWrite) {
      if (environmentFilterId) {
        void chooseTarget(environmentFilterId, 'camera');
      } else {
        setPendingSource('camera');
        setTargetVisible(true);
      }
      onCameraRequestHandled?.();
    }
  }, [cameraRequest, canWrite, environmentFilterId, onCameraRequestHandled]);

  useEffect(() => {
    setOpenGroup(environmentFilterId ?? null);
  }, [environmentFilterId]);

  const groups = useMemo(() => {
    const allGroups = [
      {
        key: 'general' as GroupKey,
        title: 'Geral da obra',
        photos: photos.filter((photo) => !photo.environment_id),
      },
      ...environments.map((environment) => ({
        key: environment.id as GroupKey,
        title: environment.name,
        photos: photos.filter(
          (photo) => photo.environment_id === environment.id
        ),
      })),
    ];
    if (!environmentFilterId) return allGroups;
    return allGroups.filter((group) => group.key === environmentFilterId);
  }, [environmentFilterId, environments, photos]);

  const scopedPhotos = useMemo(
    () =>
      environmentFilterId
        ? photos.filter((photo) => photo.environment_id === environmentFilterId)
        : photos,
    [environmentFilterId, photos]
  );

  useEffect(() => {
    if (compareRequest <= 0) return;
    if (scopedPhotos.length < 2) {
      setMessage('Adicione pelo menos duas fotos para comparar.');
    } else {
      setCompareSelection([]);
      setCompareVisible(true);
    }
    onCompareRequestHandled?.();
  }, [compareRequest, onCompareRequestHandled, scopedPhotos.length]);

  function beginUpload(source: PhotoSource) {
    if (!canWrite || uploading) return;
    if (environmentFilterId) {
      void chooseTarget(environmentFilterId, source);
      return;
    }
    setPendingSource(source);
    setTargetVisible(true);
  }

  async function uploadAsset(
    asset: ImagePicker.ImagePickerAsset,
    source: PhotoSource,
    environmentId: string | null
  ) {
    if (!asset.base64) {
      throw new Error('Não foi possível ler a imagem selecionada.');
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Usuário não autenticado.');
    }

    const fileName = makeFileName();
    const targetFolder = environmentId ?? 'general';
    const storagePath = `${workId}/${targetFolder}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('work-photos')
      .upload(storagePath, decode(asset.base64), {
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
        collection: 'work',
        photo_type: 'general',
        storage_path: storagePath,
        file_name: asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: asset.fileSize ?? null,
        caption: null,
        visibility: photoVisibility,
        taken_at:
          source === 'camera' ? new Date().toISOString() : null,
        created_by: authData.user.id,
      });

    if (insertError) {
      await supabase.storage.from('work-photos').remove([storagePath]);
      throw insertError;
    }
  }

  async function uploadAssets(
    assets: ImagePicker.ImagePickerAsset[],
    source: PhotoSource,
    environmentId: string | null
  ) {
    if (!canWrite || uploading || assets.length === 0) return;
    setUploading(true);
    setMessage('');
    setSuccessMessage('');

    try {
      for (let index = 0; index < assets.length; index += 1) {
        setUploadProgress(`Enviando ${index + 1} de ${assets.length}...`);
        await uploadAsset(assets[index], source, environmentId);
      }
      setSuccessMessage(
        assets.length === 1
          ? 'Foto adicionada.'
          : `${assets.length} fotos adicionadas.`
      );
      setOpenGroup(environmentId ?? 'general');
      await loadPhotos();
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar as fotos.'
      );
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }

  async function chooseTarget(
    environmentId: string | null,
    source: PhotoSource = pendingSource
  ) {
    setTargetVisible(false);

    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Câmera não autorizada',
          'Permita o acesso à câmera para registrar fotos da obra.'
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
        await uploadAssets(result.assets, 'camera', environmentId);
      }
      return;
    }

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Fotos não autorizadas',
        'Permita o acesso às fotos para adicionar imagens da obra.'
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
      await uploadAssets(result.assets, 'gallery', environmentId);
    }
  }

  function canDelete(photo: WorkPhoto) {
    return canManage ||
      (canWrite && !!userId && photo.created_by === userId);
  }

  function toggleCompareSelection(photoId: string) {
    setCompareSelection((current) => {
      if (current.includes(photoId)) {
        return current.filter((id) => id !== photoId);
      }
      if (current.length >= 2) return current;
      return [...current, photoId];
    });
  }

  const comparePhotos = compareSelection
    .map((id) => photos.find((photo) => photo.id === id))
    .filter((photo): photo is WorkPhoto => Boolean(photo));

  function confirmDelete(photo: WorkPhoto) {
    if (!canDelete(photo) || deletingId) return;
    Alert.alert(
      'Excluir foto?',
      'A foto será removida da galeria da obra.',
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

  async function deletePhoto(photo: WorkPhoto) {
    setDeletingId(photo.id);
    setMessage('');
    const { error: storageError } = await supabase.storage
      .from('work-photos')
      .remove([photo.storage_path]);

    if (storageError) {
      setMessage(storageError.message);
      setDeletingId(null);
      return;
    }
    const { error } = await supabase
      .from('work_photos')
      .delete()
      .eq('id', photo.id);
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Foto removida.');
      await loadPhotos();
      onChanged?.();
    }
    setDeletingId(null);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#24583E" />
        <Text style={styles.muted}>Carregando galeria...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{scopedPhotos.length}</Text>
          <Text style={styles.summaryLabel}>
            {environmentFilterId ? 'Fotos do ambiente' : 'Fotos da obra'}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {environmentFilterId
              ? scopedPhotos.length
              : photos.filter((photo) => !photo.environment_id).length}
          </Text>
          <Text style={styles.summaryLabel}>
            {environmentFilterId ? 'Nesta pasta' : 'Fotos gerais'}
          </Text>
        </View>
      </View>

      {canWrite && (
        <View style={styles.actions}>
          <Pressable
            style={styles.cameraButton}
            onPress={() => beginUpload('camera')}
            disabled={uploading}
          >
            <Ionicons name="camera-outline" size={21} color="#FFFFFF" />
            <Text style={styles.cameraText}>Câmera</Text>
          </Pressable>
          <Pressable
            style={styles.galleryButton}
            onPress={() => beginUpload('gallery')}
            disabled={uploading}
          >
            <Ionicons name="images-outline" size={20} color="#24583E" />
            <Text style={styles.galleryText}>Selecionar várias</Text>
          </Pressable>
        </View>
      )}

      {uploading && (
        <View style={styles.uploadCard}>
          <ActivityIndicator color="#24583E" />
          <Text style={styles.uploadText}>{uploadProgress}</Text>
        </View>
      )}
      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}
      {!!successMessage && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {groups.map((group) => {
        const open = openGroup === group.key;
        return (
          <View key={group.key} style={styles.groupCard}>
            <Pressable
              style={styles.groupHeader}
              onPress={() => setOpenGroup(open ? null : group.key)}
            >
              {group.photos[0]?.signed_url ? (
                <Image
                  source={{ uri: group.photos[0].signed_url ?? '' }}
                  style={styles.groupCover}
                />
              ) : (
                <View style={styles.groupPlaceholder}>
                  <Ionicons name="images-outline" size={22} color="#24583E" />
                </View>
              )}
              <View style={styles.groupIdentity}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                <Text style={styles.groupCount}>
                  {group.photos.length}{' '}
                  {group.photos.length === 1 ? 'foto' : 'fotos'}
                  {group.photos.some((photo) => photo.photo_type === 'delivery_final')
                    ? ` · ${
                        group.photos.filter(
                          (photo) => photo.photo_type === 'delivery_final'
                        ).length
                      } finais`
                    : ''}
                </Text>
              </View>
              <Ionicons
                name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
                size={21}
                color="#34405A"
              />
            </Pressable>

            {open && (
              <View style={styles.photoGrid}>
                {group.photos.length === 0 ? (
                  <Text style={styles.emptyText}>Nenhuma foto nesta pasta.</Text>
                ) : (
                  group.photos.map((photo) => (
                    <View key={photo.id} style={styles.photoCard}>
                      {photo.signed_url ? (
                        <Image
                          source={{ uri: photo.signed_url }}
                          style={styles.photo}
                        />
                      ) : (
                        <View style={styles.photoUnavailable}>
                          <Text style={styles.unavailableText}>Indisponível</Text>
                        </View>
                      )}
                      <Text style={styles.photoDate}>
                        {formatDate(photo.created_at)}
                      </Text>
                      {photo.photo_type === 'delivery_final' && (
                        <View style={styles.finalTag}>
                          <Ionicons
                            name="checkmark-done-outline"
                            size={11}
                            color="#8A5B08"
                          />
                          <Text style={styles.finalTagText}>Foto final</Text>
                        </View>
                      )}
                      <View style={styles.visibilityTag}>
                        <Ionicons
                          name={photo.visibility === 'shared' ? 'eye-outline' : 'lock-closed-outline'}
                          size={11}
                          color="#24583E"
                        />
                        <Text style={styles.visibilityText}>
                          {photo.visibility === 'shared' ? 'Compartilhada' : 'Interna'}
                        </Text>
                      </View>
                      {canDelete(photo) && (
                        <Pressable
                          style={styles.deleteButton}
                          onPress={() => confirmDelete(photo)}
                          disabled={deletingId !== null}
                        >
                          <Text style={styles.deleteText}>
                            {deletingId === photo.id ? 'Excluindo...' : 'Excluir'}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        );
      })}

      <Text style={styles.collectionNote}>
        Assistência e peças danificadas não aparecem nesta galeria.
      </Text>

      <Modal
        visible={targetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTargetVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  Onde salvar?
                </Text>
                <Text style={styles.modalSubtitle}>
                  Escolha Geral da obra ou um ambiente.
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setTargetVisible(false)}
              >
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <Text style={styles.visibilityHeading}>Quem poderá ver estas fotos?</Text>
            <View style={styles.visibilityOptions}>
              {PHOTO_VISIBILITY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.visibilityOption,
                    photoVisibility === option.value && styles.visibilityOptionActive,
                  ]}
                  onPress={() => setPhotoVisibility(option.value)}
                >
                  <Ionicons
                    name={option.value === 'shared' ? 'eye-outline' : 'lock-closed-outline'}
                    size={17}
                    color={photoVisibility === option.value ? '#24583E' : '#7B8496'}
                  />
                  <View style={styles.visibilityOptionText}>
                    <Text style={styles.visibilityOptionLabel}>{option.label}</Text>
                    <Text style={styles.visibilityOptionDetail}>{option.detail}</Text>
                  </View>
                  {photoVisibility === option.value && (
                    <Ionicons name="checkmark-circle" size={18} color="#24583E" />
                  )}
                </Pressable>
              ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Pressable style={styles.targetButton} onPress={() => chooseTarget(null)}>
                <Ionicons name="home-outline" size={21} color="#24583E" />
                <Text style={styles.targetText}>Geral da obra</Text>
                <Ionicons name="chevron-forward-outline" size={20} color="#7B8496" />
              </Pressable>
              {environments.map((environment) => (
                <Pressable
                  key={environment.id}
                  style={styles.targetButton}
                  onPress={() => chooseTarget(environment.id)}
                >
                  <Ionicons name="grid-outline" size={21} color="#24583E" />
                  <Text style={styles.targetText}>{environment.name}</Text>
                  <Ionicons name="chevron-forward-outline" size={20} color="#7B8496" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={compareVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCompareVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.compareModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Comparativo</Text>
                <Text style={styles.modalSubtitle}>
                  Escolha duas fotos para visualizar Antes e Depois.
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setCompareVisible(false)}
              >
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.comparePicker}
            >
              {scopedPhotos.map((photo) => {
                const selectedIndex = compareSelection.indexOf(photo.id);
                return (
                  <Pressable
                    key={photo.id}
                    style={[
                      styles.comparePickerItem,
                      selectedIndex >= 0 && styles.comparePickerItemActive,
                    ]}
                    onPress={() => toggleCompareSelection(photo.id)}
                  >
                    {photo.signed_url ? (
                      <Image source={{ uri: photo.signed_url }} style={styles.comparePickerImage} />
                    ) : (
                      <View style={styles.comparePickerUnavailable} />
                    )}
                    <Text style={styles.comparePickerDate}>{formatDate(photo.created_at)}</Text>
                    {selectedIndex >= 0 && (
                      <View style={styles.compareOrderBadge}>
                        <Text style={styles.compareOrderText}>{selectedIndex + 1}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>

            {comparePhotos.length === 2 ? (
              <View style={styles.comparePreviewRow}>
                {comparePhotos.map((photo, index) => (
                  <View key={photo.id} style={styles.comparePreviewCard}>
                    <Text style={styles.comparePreviewLabel}>{index === 0 ? 'ANTES' : 'DEPOIS'}</Text>
                    {photo.signed_url ? (
                      <Image source={{ uri: photo.signed_url }} style={styles.comparePreviewImage} />
                    ) : (
                      <View style={styles.comparePreviewUnavailable} />
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.compareHint}>Toque em duas fotos na faixa acima.</Text>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: '#7A8394' },
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F8F6F1' },
  summaryNumber: { fontSize: 22, fontWeight: '900', color: '#24583E' },
  summaryLabel: { marginTop: 2, fontSize: 10, color: '#6F736F' },
  actions: { marginTop: 11, flexDirection: 'row', gap: 8 },
  cameraButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: '#24583E' },
  cameraText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  galleryButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BFD0C3', borderRadius: 12 },
  galleryText: { fontSize: 11, fontWeight: '800', color: '#24583E' },
  uploadCard: { marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 11, backgroundColor: '#F8F6F1' },
  uploadText: { fontSize: 11, fontWeight: '700', color: '#24583E' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 11, color: '#B42318' },
  successCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#EEF8F1' },
  successText: { fontSize: 11, color: '#267A48' },
  groupCard: { marginTop: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E3E9', borderRadius: 13, backgroundColor: '#FFFFFF' },
  groupHeader: { minHeight: 68, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupCover: { width: 52, height: 52, borderRadius: 10 },
  groupPlaceholder: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#E7F1E8' },
  groupIdentity: { flex: 1 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: '#202B3D' },
  groupCount: { marginTop: 3, fontSize: 10, color: '#778194' },
  photoGrid: { padding: 10, paddingTop: 2, flexDirection: 'row', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: '#ECEEF2' },
  photoCard: { width: '48%', overflow: 'hidden', borderWidth: 1, borderColor: '#E4E6EB', borderRadius: 11, backgroundColor: '#FFFFFF' },
  photo: { width: '100%', aspectRatio: 1.25, backgroundColor: '#E7E9EE' },
  photoUnavailable: { width: '100%', aspectRatio: 1.25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ECEEF2' },
  unavailableText: { fontSize: 9, color: '#7D8697' },
  photoDate: { paddingHorizontal: 8, paddingTop: 7, fontSize: 8, color: '#7D8697' },
  finalTag: { marginTop: 5, marginHorizontal: 8, paddingHorizontal: 6, paddingVertical: 4, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, backgroundColor: '#FFF4D8' },
  finalTagText: { fontSize: 8, fontWeight: '900', color: '#8A5B08' },
  visibilityTag: { marginTop: 5, marginHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  visibilityText: { fontSize: 8, color: '#557064' },
  deleteButton: { minHeight: 34, margin: 7, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: '#FFF0EE' },
  deleteText: { fontSize: 9, fontWeight: '800', color: '#B42318' },
  emptyText: { width: '100%', padding: 12, textAlign: 'center', fontSize: 10, color: '#7D8697' },
  collectionNote: { marginTop: 12, textAlign: 'center', fontSize: 9, lineHeight: 14, color: '#8A91A0' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 25, 43, 0.38)' },
  modalCard: { maxHeight: '82%', padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: '#172033' },
  modalSubtitle: { marginTop: 3, fontSize: 11, color: '#727C8E' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F2F5' },
  visibilityHeading: { marginTop: 3, marginBottom: 7, fontSize: 11, fontWeight: '900', color: '#34405A' },
  visibilityOptions: { gap: 7, marginBottom: 8 },
  visibilityOption: { minHeight: 54, paddingHorizontal: 11, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 12, backgroundColor: '#FFFFFF' },
  visibilityOptionActive: { borderColor: '#BFD0C3', backgroundColor: '#F4FAF5' },
  visibilityOptionText: { flex: 1 },
  visibilityOptionLabel: { fontSize: 11, fontWeight: '900', color: '#34405A' },
  visibilityOptionDetail: { marginTop: 2, fontSize: 9, lineHeight: 13, color: '#727C8E' },
  compareModalCard: { maxHeight: '88%', padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  comparePicker: { gap: 8, paddingVertical: 10 },
  comparePickerItem: { width: 86, paddingBottom: 5, overflow: 'hidden', borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 10, backgroundColor: '#FFFFFF' },
  comparePickerItemActive: { borderWidth: 2, borderColor: '#24583E' },
  comparePickerImage: { width: '100%', height: 68, backgroundColor: '#ECEEF2' },
  comparePickerUnavailable: { width: '100%', height: 68, backgroundColor: '#ECEEF2' },
  comparePickerDate: { paddingHorizontal: 5, paddingTop: 4, fontSize: 7, color: '#7D8697' },
  compareOrderBadge: { position: 'absolute', top: 5, right: 5, width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#24583E' },
  compareOrderText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  comparePreviewRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  comparePreviewCard: { flex: 1, overflow: 'hidden', borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 12, backgroundColor: '#FFFFFF' },
  comparePreviewLabel: { paddingHorizontal: 8, paddingVertical: 6, fontSize: 9, fontWeight: '900', letterSpacing: 0.8, color: '#24583E' },
  comparePreviewImage: { width: '100%', aspectRatio: 1, backgroundColor: '#ECEEF2' },
  comparePreviewUnavailable: { width: '100%', aspectRatio: 1, backgroundColor: '#ECEEF2' },
  compareHint: { padding: 14, textAlign: 'center', fontSize: 10, color: '#727C8E' },
  targetButton: { minHeight: 54, marginTop: 8, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 12 },
  targetText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#34405A' },
});
