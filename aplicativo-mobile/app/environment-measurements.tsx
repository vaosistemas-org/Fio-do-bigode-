import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type Environment = {
  id: string;
  work_id: string;
  name: string;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

type MeasurementPhoto = {
  id: string;
  work_id: string;
  environment_id: string;
  photo_id: string;
  created_by: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
  work_photos?: { storage_path: string; file_name: string | null } | null;
  annotations?: { count: number }[];
  signed_url?: string | null;
};

type RawMeasurementPhoto = Omit<MeasurementPhoto, 'profiles' | 'work_photos'> & {
  profiles?: { full_name: string | null }[] | { full_name: string | null } | null;
  work_photos?: { storage_path: string; file_name: string | null }[] | { storage_path: string; file_name: string | null } | null;
};

type PhotoSource = 'camera' | 'gallery';

function formatMoment(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function firstName(value?: string | null) {
  return value?.trim().split(/\s+/)[0] || 'FIO';
}

function makeFileName() {
  return `fio-medicao-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

export default function EnvironmentMeasurementsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [photos, setPhotos] = useState<MeasurementPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const { canWrite, isViewer, loadingAccess } = useWorkAccess(environment?.work_id);

  const loadData = useCallback(
    async (refresh = false) => {
      if (!id) {
        setMessage('Ambiente não encontrado.');
        setLoading(false);
        return;
      }

      if (refresh) setRefreshing(true);
      else setLoading(true);

      setMessage('');

      try {
        const environmentResult = await supabase
          .from('environments')
          .select('id, work_id, name')
          .eq('id', id)
          .maybeSingle();

        if (environmentResult.error) throw environmentResult.error;
        if (!environmentResult.data) throw new Error('Ambiente não encontrado.');

        const loadedEnvironment = environmentResult.data as Environment;
        setEnvironment(loadedEnvironment);

        const [workResult, photosResult] = await Promise.all([
          supabase
            .from('works')
            .select('id, code, client_name')
            .eq('id', loadedEnvironment.work_id)
            .maybeSingle(),
          supabase
            .from('work_measurement_photos')
            .select('id, work_id, environment_id, photo_id, created_by, created_at')
            .eq('environment_id', loadedEnvironment.id)
            .order('created_at', { ascending: false }),
        ]);

        if (workResult.error) throw workResult.error;
        setWork((workResult.data as Work | null) ?? null);

        if (photosResult.error) throw photosResult.error;

        const basePhotos = (photosResult.data ?? []) as RawMeasurementPhoto[];
        const measurementIds = basePhotos.map((photo) => photo.id);
        const photoIds = basePhotos.map((photo) => photo.photo_id);
        const creatorIds = basePhotos.map((photo) => photo.created_by).filter((value): value is string => !!value);

        const [workPhotosResult, profilesResult, annotationsResult] = await Promise.all([
          photoIds.length
            ? supabase.from('work_photos').select('id, storage_path, file_name').in('id', photoIds)
            : Promise.resolve({ data: [], error: null }),
          creatorIds.length
            ? supabase.from('profiles').select('id, full_name').in('id', creatorIds)
            : Promise.resolve({ data: [], error: null }),
          measurementIds.length
            ? supabase.from('work_measurement_annotations').select('measurement_photo_id').in('measurement_photo_id', measurementIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (workPhotosResult.error) throw workPhotosResult.error;
        if (profilesResult.error) throw profilesResult.error;
        if (annotationsResult.error) throw annotationsResult.error;

        const workPhotosById = new Map((workPhotosResult.data ?? []).map((photo) => [photo.id, photo]));
        const profilesById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
        const annotationsByPhotoId = new Map<string, number>();
        for (const annotation of annotationsResult.data ?? []) {
          annotationsByPhotoId.set(annotation.measurement_photo_id, (annotationsByPhotoId.get(annotation.measurement_photo_id) ?? 0) + 1);
        }

        const signedPhotos = await Promise.all(
          basePhotos.map(async (rawPhoto) => {
            const workPhoto = workPhotosById.get(rawPhoto.photo_id) ?? null;
            const photo: MeasurementPhoto = {
              ...rawPhoto,
              profiles: rawPhoto.created_by ? profilesById.get(rawPhoto.created_by) ?? null : null,
              work_photos: workPhoto,
              annotations: [{ count: annotationsByPhotoId.get(rawPhoto.id) ?? 0 }],
            };
            const storagePath = workPhoto?.storage_path;
            if (!storagePath) return { ...photo, signed_url: null };
            const { data, error } = await supabase.storage
              .from('work-photos')
              .createSignedUrl(storagePath, 60 * 60);
            if (error) throw error;
            return { ...photo, signed_url: data?.signedUrl ?? null };
          })
        );

        setPhotos(signedPhotos);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar medições.');
      } finally {
        if (refresh) setRefreshing(false);
        else setLoading(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  async function uploadAsset(asset: ImagePicker.ImagePickerAsset, source: PhotoSource) {
    if (!environment || !canWrite) return;
    if (!asset.base64) throw new Error('Não foi possível ler a imagem selecionada.');

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new Error('Usuário não autenticado.');

    const fileName = makeFileName();
    const storagePath = `${environment.work_id}/${environment.id}/measurements/${fileName}`;

    const { error: uploadError } = await supabase.storage.from('work-photos').upload(
      storagePath,
      decode(asset.base64),
      {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      }
    );
    if (uploadError) throw uploadError;

    const { data: photoData, error: photoError } = await supabase
      .from('work_photos')
      .insert({
        work_id: environment.work_id,
        environment_id: environment.id,
        collection: 'measurement',
        storage_path: storagePath,
        file_name: asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: asset.fileSize ?? null,
        caption: 'Foto de medição',
        taken_at: source === 'camera' ? new Date().toISOString() : null,
        created_by: userData.user.id,
      })
      .select('id')
      .single();

    if (photoError) {
      await supabase.storage.from('work-photos').remove([storagePath]);
      throw photoError;
    }

    const { data: measurementData, error: measurementError } = await supabase
      .from('work_measurement_photos')
      .insert({
        work_id: environment.work_id,
        environment_id: environment.id,
        photo_id: photoData.id,
        created_by: userData.user.id,
      })
      .select('id')
      .single();

    if (measurementError) throw measurementError;

    router.push({
      pathname: '/measurement-editor',
      params: { id: measurementData.id, mode: 'view' },
    });
  }

  async function addPhoto(source: PhotoSource) {
    if (!canWrite || uploading) return;
    setUploading(true);
    setMessage('');

    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Câmera não autorizada', 'Permita o acesso à câmera para registrar a medição.');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.75,
          base64: true,
          allowsEditing: false,
        });
        if (!result.canceled) await uploadAsset(result.assets[0], 'camera');
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Fotos não autorizadas', 'Permita o acesso às fotos para adicionar uma medição.');
          return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.75,
          base64: true,
          allowsEditing: false,
          allowsMultipleSelection: false,
        });
        if (!result.canceled) await uploadAsset(result.assets[0], 'gallery');
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível adicionar a foto.');
    } finally {
      setUploading(false);
    }
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.muted}>Carregando medições...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow={work?.code}
        title="Medições"
        subtitle={environment?.name}
        actionIcon="refresh-outline"
        actionLabel="Atualizar medições"
        onAction={() => loadData(true)}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={FioColors.gold} />
        }
      >
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back-outline" size={19} color={FioColors.green} />
          <Text style={styles.backText}>Voltar ao ambiente</Text>
        </Pressable>

        {isViewer && (
          <View style={styles.readOnlyCard}>
            <Ionicons name="eye-outline" size={18} color={FioColors.textMuted} />
            <Text style={styles.readOnlyText}>Você pode visualizar as medições, mas não editar.</Text>
          </View>
        )}

        {canWrite && (
          <View style={styles.actions}>
            <Pressable style={styles.primaryButton} onPress={() => addPhoto('camera')} disabled={uploading}>
              <Ionicons name="camera-outline" size={18} color={FioColors.textOnAccent} />
              <Text style={styles.primaryButtonText}>{uploading ? 'Enviando...' : 'Tirar foto'}</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => addPhoto('gallery')} disabled={uploading}>
              <Ionicons name="images-outline" size={18} color={FioColors.green} />
              <Text style={styles.secondaryButtonText}>Galeria</Text>
            </Pressable>
          </View>
        )}

        {photos.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="resize-outline" size={24} color={FioColors.gold} />
            <Text style={styles.emptyTitle}>Nenhuma medição cadastrada.</Text>
            <Text style={styles.emptyText}>Adicione uma foto do ambiente para marcar medidas, pontos técnicos e observações.</Text>
          </View>
        ) : (
          photos.map((photo) => (
            <Pressable
              key={photo.id}
              style={({ pressed }) => [styles.photoCard, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: '/measurement-editor', params: { id: photo.id, mode: 'view' } })}
            >
              {photo.signed_url ? (
                <Image source={{ uri: photo.signed_url }} style={styles.thumbnail} contentFit="cover" />
              ) : (
                <View style={styles.thumbnailFallback}>
                  <Ionicons name="image-outline" size={24} color={FioColors.textMuted} />
                </View>
              )}
              <View style={styles.photoIdentity}>
                <Text style={styles.photoTitle}>{photo.work_photos?.file_name || 'Foto de medição'}</Text>
                <Text style={styles.photoMeta}>{formatMoment(photo.created_at)} · {firstName(photo.profiles?.full_name)}</Text>
                <Text style={styles.photoCount}>{photo.annotations?.[0]?.count ?? 0} marcações</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={18} color={FioColors.textSoft} />
            </Pressable>
          ))
        )}

        {!!message && <Text style={styles.errorText}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: FioColors.canvas },
  muted: { fontSize: 12, color: FioColors.textMuted },
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 12, paddingBottom: 80 },
  backButton: { minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 12, fontWeight: '900', color: FioColors.green },
  readOnlyCard: { marginBottom: 10, minHeight: 48, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceMuted },
  readOnlyText: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  actions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  primaryButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: FioColors.green },
  primaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  secondaryButton: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  secondaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.green },
  emptyCard: { minHeight: 180, alignItems: 'center', justifyContent: 'center', padding: 20, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text },
  emptyText: { marginTop: 6, textAlign: 'center', fontSize: 11, lineHeight: 17, color: FioColors.textMuted },
  photoCard: { minHeight: 92, marginBottom: 10, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  thumbnail: { width: 74, height: 74, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  thumbnailFallback: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  photoIdentity: { flex: 1, minWidth: 0 },
  photoTitle: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  photoMeta: { marginTop: 4, fontSize: 9, color: FioColors.textMuted },
  photoCount: { marginTop: 6, fontSize: 10, fontWeight: '900', color: FioColors.gold },
  errorText: { marginTop: 10, fontSize: 11, lineHeight: 17, color: FioColors.danger },
  pressed: { opacity: 0.72 },
});
