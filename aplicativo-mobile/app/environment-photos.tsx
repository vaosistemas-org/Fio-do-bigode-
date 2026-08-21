import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type Environment = {
  id: string;
  work_id: string;
  name: string;
  preparation_min_photos: number;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

type WorkPhoto = {
  id: string;
  work_id: string;
  environment_id: string | null;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  caption: string | null;
  taken_at: string | null;
  created_by: string | null;
  created_at: string;
  signed_url?: string | null;
};

type PhotoSource =
  | 'camera'
  | 'gallery';

function formatDate(value: string) {
  return new Date(value).toLocaleString(
    'pt-BR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

function makeFileName() {
  return `fio-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.jpg`;
}

export default function EnvironmentPhotosScreen() {
  const router = useRouter();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    environment,
    setEnvironment,
  ] = useState<Environment | null>(
    null
  );

  const [work, setWork] =
    useState<Work | null>(null);

  const [photos, setPhotos] =
    useState<WorkPhoto[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [uploading, setUploading] =
    useState(false);

  const [
    uploadProgress,
    setUploadProgress,
  ] = useState('');

  const [
    deletingId,
    setDeletingId,
  ] = useState<string | null>(
    null
  );

  const [
    errorMessage,
    setErrorMessage,
  ] = useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  const {
    userId,
    canManage,
    canWrite,
    isViewer,
  } = useWorkAccess(
    environment?.work_id
  );

  async function loadData(
    isRefresh = false
  ) {
    if (!id) {
      setErrorMessage(
        'Ambiente não encontrado.'
      );

      setLoading(false);

      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setErrorMessage('');

    try {
      const {
        data: environmentData,
        error: environmentError,
      } = await supabase
        .from('environments')
        .select(`
          id,
          work_id,
          name,
          preparation_min_photos
        `)
        .eq('id', id)
        .maybeSingle();

      if (environmentError) {
        setErrorMessage(
          environmentError.message
        );

        return;
      }

      if (!environmentData) {
        setErrorMessage(
          'Ambiente não encontrado.'
        );

        return;
      }

      const loadedEnvironment =
        environmentData as Environment;

      setEnvironment(
        loadedEnvironment
      );

      const [
        workResult,
        photosResult,
      ] = await Promise.all([
        supabase
          .from('works')
          .select(`
            id,
            code,
            client_name
          `)
          .eq(
            'id',
            loadedEnvironment.work_id
          )
          .maybeSingle(),

        supabase
          .from('work_photos')
          .select(`
            id,
            work_id,
            environment_id,
            storage_path,
            file_name,
            mime_type,
            size_bytes,
            caption,
            taken_at,
            created_by,
            created_at
          `)
          .eq(
            'environment_id',
            loadedEnvironment.id
          )
          .eq('collection', 'work')
          .order('created_at', {
            ascending: false,
          }),
      ]);

      if (workResult.error) {
        setErrorMessage(
          workResult.error.message
        );
      } else if (workResult.data) {
        setWork(
          workResult.data as Work
        );
      }

      if (photosResult.error) {
        setErrorMessage(
          photosResult.error.message
        );

        return;
      }

      const loadedPhotos =
        (photosResult.data ??
          []) as WorkPhoto[];

      const withUrls =
        await Promise.all(
          loadedPhotos.map(
            async (photo) => {
              const {
                data: signedData,
              } =
                await supabase.storage
                  .from(
                    'work-photos'
                  )
                  .createSignedUrl(
                    photo.storage_path,
                    60 * 60
                  );

              return {
                ...photo,
                signed_url:
                  signedData?.signedUrl ??
                  null,
              };
            }
          )
        );

      setPhotos(withUrls);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar as fotos.'
      );
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  async function uploadAsset(
    asset: ImagePicker.ImagePickerAsset,
    source: PhotoSource
  ) {
    if (!environment) {
      throw new Error(
        'Ambiente não encontrado.'
      );
    }

    if (!canWrite) {
      throw new Error(
        'Você possui acesso somente para visualização.'
      );
    }

    if (!asset.base64) {
      throw new Error(
        'Não foi possível ler a imagem selecionada.'
      );
    }

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      throw new Error(
        'Usuário não autenticado.'
      );
    }

    const fileName =
      makeFileName();

    const storagePath =
      `${environment.work_id}/` +
      `${environment.id}/` +
      fileName;

    const {
      error: uploadError,
    } =
      await supabase.storage
        .from('work-photos')
        .upload(
          storagePath,
          decode(asset.base64),
          {
            contentType:
              'image/jpeg',
            cacheControl:
              '3600',
            upsert: false,
          }
        );

    if (uploadError) {
      throw uploadError;
    }

    const {
      error: insertError,
    } = await supabase
      .from('work_photos')
      .insert({
        work_id:
          environment.work_id,

        environment_id:
          environment.id,

        collection:
          'work',

        storage_path:
          storagePath,

        file_name:
          asset.fileName ||
          fileName,

        mime_type:
          'image/jpeg',

        size_bytes:
          asset.fileSize ??
          null,

        caption:
          null,

        taken_at:
          source === 'camera'
            ? new Date().toISOString()
            : null,

        created_by:
          user.id,
      });

    if (insertError) {
      await supabase.storage
        .from('work-photos')
        .remove([storagePath]);

      throw insertError;
    }
  }

  async function uploadAssets(
    assets:
      ImagePicker.ImagePickerAsset[],
    source: PhotoSource
  ) {
    if (
      !canWrite ||
      uploading ||
      assets.length === 0
    ) {
      return;
    }

    setUploading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      for (
        let index = 0;
        index < assets.length;
        index += 1
      ) {
        setUploadProgress(
          `Enviando ${
            index + 1
          } de ${assets.length}...`
        );

        await uploadAsset(
          assets[index],
          source
        );
      }

      setSuccessMessage(
        assets.length === 1
          ? 'Foto adicionada.'
          : `${assets.length} fotos adicionadas.`
      );

      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar as fotos.'
      );
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }

  async function takePhoto() {
    if (
      !canWrite ||
      uploading
    ) {
      return;
    }

    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Câmera não autorizada',
        'Permita o acesso à câmera para registrar fotos da obra.'
      );

      return;
    }

    const result =
      await ImagePicker.launchCameraAsync(
        {
          mediaTypes: [
            'images',
          ],
          quality: 0.75,
          base64: true,
          allowsEditing: false,
        }
      );

    if (result.canceled) {
      return;
    }

    await uploadAssets(
      result.assets,
      'camera'
    );
  }

  async function pickPhotos() {
    if (
      !canWrite ||
      uploading
    ) {
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

    const result =
      await ImagePicker.launchImageLibraryAsync(
        {
          mediaTypes: [
            'images',
          ],

          allowsMultipleSelection:
            true,

          selectionLimit: 20,

          orderedSelection:
            true,

          allowsEditing:
            false,

          quality: 0.75,

          base64: true,
        }
      );

    if (result.canceled) {
      return;
    }

    await uploadAssets(
      result.assets,
      'gallery'
    );
  }

  function canDeletePhoto(
    photo: WorkPhoto
  ) {
    if (canManage) {
      return true;
    }

    return (
      canWrite &&
      !!userId &&
      photo.created_by === userId
    );
  }

  function confirmDelete(
    photo: WorkPhoto
  ) {
    if (
      deletingId ||
      !canDeletePhoto(photo)
    ) {
      return;
    }

    Alert.alert(
      'Excluir foto?',
      'A foto será removida deste ambiente.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () =>
            deletePhoto(photo),
        },
      ]
    );
  }

  async function deletePhoto(
    photo: WorkPhoto
  ) {
    if (
      !canDeletePhoto(photo)
    ) {
      setErrorMessage(
        'Você não possui permissão para excluir esta foto.'
      );

      return;
    }

    setDeletingId(photo.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      /*
       * Para colaborador, o Storage verifica se a foto
       * ainda pertence a ele por meio de public.work_photos.
       * Por isso removemos primeiro o arquivo e depois
       * o registro da galeria.
       */
      const {
        error: storageError,
      } =
        await supabase.storage
          .from('work-photos')
          .remove([
            photo.storage_path,
          ]);

      if (storageError) {
        setErrorMessage(
          storageError.message
        );

        return;
      }

      const {
        error: databaseError,
      } = await supabase
        .from('work_photos')
        .delete()
        .eq('id', photo.id);

      if (databaseError) {
        setErrorMessage(
          'O arquivo foi removido, mas houve um problema ao atualizar a galeria.'
        );

        await loadData();

        return;
      }

      setPhotos(
        (current) =>
          current.filter(
            (item) =>
              item.id !== photo.id
          )
      );

      setSuccessMessage(
        'Foto removida.'
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível excluir a foto.'
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text
          style={styles.loadingText}
        >
          Carregando fotos...
        </Text>
      </View>
    );
  }

  if (!environment) {
    return (
      <View style={styles.loading}>
        <Text
          style={styles.errorText}
        >
          {errorMessage ||
            'Ambiente não encontrado.'}
        </Text>
      </View>
    );
  }

  const minimumPhotos =
    environment.preparation_min_photos;

  const missingPhotos =
    Math.max(
      minimumPhotos -
        photos.length,
      0
    );

  const photoGoalComplete =
    minimumPhotos > 0 &&
    missingPhotos === 0;

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
      refreshControl={
        <RefreshControl
          refreshing={
            refreshing
          }
          onRefresh={() =>
            loadData(true)
          }
        />
      }
    >
      {/* TOPO */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>
            FIO
          </Text>

          <Text
            style={
              styles.brandSubtitle
            }
          >
            GESTÃO DE OBRAS
          </Text>
        </View>

        <Pressable
          style={styles.topButton}
          onPress={() =>
            router.push('/profile')
          }
        >
          <Text
            style={
              styles.topButtonText
            }
          >
            Meu FIO
          </Text>
        </Pressable>
      </View>

      {/* VOLTAR */}
      <Pressable
        style={styles.backButton}
        onPress={() =>
          router.replace({
            pathname:
              '/environment/[id]',
            params: {
              id: environment.id,
            },
          })
        }
      >
        <Text
          style={
            styles.backButtonText
          }
        >
          ‹ {environment.name}
        </Text>
      </Pressable>

      {work && (
        <>
          <Text
            style={styles.workCode}
          >
            {work.code}
          </Text>

          <Text
            style={styles.workName}
          >
            {work.client_name}
          </Text>
        </>
      )}

      {/* CABEÇALHO */}
      <View style={styles.header}>
        <Text
          style={styles.eyebrow}
        >
          FOTOS DO AMBIENTE
        </Text>

        <Text style={styles.title}>
          {environment.name}
        </Text>

        <Text style={styles.subtitle}>
          {isViewer
            ? 'Visualize os registros fotográficos deste ambiente.'
            : 'Registre a evolução do ambiente sem precisar selecionar a obra ou o ambiente novamente.'}
        </Text>
      </View>

      {isViewer && (
        <View
          style={
            styles.readOnlyCard
          }
        >
          <Text
            style={
              styles.readOnlyTitle
            }
          >
            SOMENTE VISUALIZAÇÃO
          </Text>

          <Text
            style={
              styles.readOnlyText
            }
          >
            Seu acesso permite consultar
            as fotos, mas não adicionar
            ou excluir registros.
          </Text>
        </View>
      )}

      {/* CONTADOR */}
      <View style={styles.counterCard}>
        <View>
          <Text
            style={styles.counterValue}
          >
            {minimumPhotos > 0
              ? `${photos.length}/${minimumPhotos}`
              : photos.length}
          </Text>

          <Text
            style={styles.counterLabel}
          >
            {minimumPhotos > 0
              ? 'fotos / mínimo'
              : 'fotos registradas'}
          </Text>
        </View>

        <View
          style={[
            styles.readinessBadge,
            photoGoalComplete &&
              styles.readinessBadgeComplete,
          ]}
        >
          <Text
            style={[
              styles.readinessText,
              photoGoalComplete &&
                styles.readinessTextComplete,
            ]}
          >
            {minimumPhotos === 0
              ? 'Sem mínimo definido'
              : photoGoalComplete
              ? 'Fotos completas'
              : `Faltam ${missingPhotos}`}
          </Text>
        </View>
      </View>

      {/* AÇÕES */}
      {canWrite && (
        <View style={styles.actions}>
          <Pressable
            style={[
              styles.cameraButton,
              uploading &&
                styles.disabledButton,
            ]}
            onPress={takePhoto}
            disabled={uploading}
          >
            <Text
              style={
                styles.cameraButtonText
              }
            >
              Câmera
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.galleryButton,
              uploading &&
                styles.disabledButton,
            ]}
            onPress={pickPhotos}
            disabled={uploading}
          >
            <Text
              style={
                styles.galleryButtonText
              }
            >
              Selecionar fotos
            </Text>
          </Pressable>
        </View>
      )}

      {uploading && (
        <View
          style={styles.uploadCard}
        >
          <ActivityIndicator />

          <Text
            style={styles.uploadText}
          >
            {uploadProgress ||
              'Enviando...'}
          </Text>
        </View>
      )}

      {!!errorMessage && (
        <View
          style={styles.errorCard}
        >
          <Text
            style={styles.errorText}
          >
            {errorMessage}
          </Text>
        </View>
      )}

      {!!successMessage && (
        <View
          style={styles.successCard}
        >
          <Text
            style={styles.successText}
          >
            {successMessage}
          </Text>
        </View>
      )}

      {/* GALERIA */}
      <View style={styles.galleryHeader}>
        <Text
          style={styles.sectionTitle}
        >
          GALERIA
        </Text>

        <Text
          style={styles.photoCount}
        >
          {photos.length}{' '}
          {photos.length === 1
            ? 'foto'
            : 'fotos'}
        </Text>
      </View>

      {photos.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text
            style={styles.emptyTitle}
          >
            Nenhuma foto ainda
          </Text>

          <Text
            style={styles.emptyText}
          >
            {canWrite
              ? 'Tire uma foto agora ou selecione várias imagens da galeria.'
              : 'Nenhuma foto foi registrada neste ambiente.'}
          </Text>
        </View>
      ) : (
        <View style={styles.photoGrid}>
          {photos.map((photo) => (
            <View
              key={photo.id}
              style={styles.photoCard}
            >
              {photo.signed_url ? (
                <Image
                  source={{
                    uri:
                      photo.signed_url,
                  }}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={
                    styles.photoUnavailable
                  }
                >
                  <Text
                    style={
                      styles.photoUnavailableText
                    }
                  >
                    Imagem indisponível
                  </Text>
                </View>
              )}

              <Text
                style={
                  styles.photoDate
                }
              >
                {formatDate(
                  photo.created_at
                )}
              </Text>

              {canDeletePhoto(
                photo
              ) && (
                <Pressable
                  style={
                    styles.deleteButton
                  }
                  onPress={() =>
                    confirmDelete(
                      photo
                    )
                  }
                  disabled={
                    deletingId !==
                    null
                  }
                >
                  <Text
                    style={
                      styles.deleteButtonText
                    }
                  >
                    {deletingId ===
                    photo.id
                      ? 'Excluindo...'
                      : 'Excluir'}
                  </Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#242824',
  },

  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 80,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#242824',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#C0C7C1',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    marginBottom: 18,
  },

  brand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#F2F3EF',
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: '#74B892',
  },

  topButton: {
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  topButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  workCode: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#74B892',
  },

  workName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#C0C7C1',
  },

  header: {
    marginTop: 22,
    marginBottom: 20,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#FFB04A',
  },

  title: {
    marginTop: 5,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  subtitle: {
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: '#C0C7C1',
  },

  readOnlyCard: {
    marginBottom: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#DADFDA',
    borderRadius: 14,
    backgroundColor: '#30483A',
  },

  readOnlyTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#506455',
  },

  readOnlyText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 17,
    color: '#66736B',
  },

  counterCard: {
    marginBottom: 14,
    padding: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 18,
    backgroundColor: '#2E332F',
  },

  counterValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  counterLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#8A9094',
  },

  readinessBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#4B3B25',
  },

  readinessBadgeComplete: {
    backgroundColor: '#30483A',
  },

  readinessText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A65B32',
  },

  readinessTextComplete: {
    color: '#506455',
  },

  actions: {
    marginBottom: 16,
    flexDirection: 'row',
    gap: 10,
  },

  cameraButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#E07A3A',
  },

  cameraButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  galleryButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 14,
    backgroundColor: '#2E332F',
  },

  galleryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  disabledButton: {
    opacity: 0.55,
  },

  uploadCard: {
    marginBottom: 14,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: '#2E332F',
  },

  uploadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#687177',
  },

  errorCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4A2F2D',
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#FF8D83',
  },

  successCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#294536',
  },

  successText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8AD4A8',
  },

  galleryHeader: {
    marginTop: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#74B892',
  },

  photoCount: {
    fontSize: 11,
    fontWeight: '700',
    color: '#858B8F',
  },

  emptyCard: {
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 18,
    backgroundColor: '#2E332F',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: '#7A8185',
  },

  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  photoCard: {
    width: '48%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 14,
    backgroundColor: '#2E332F',
  },

  photo: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#383E39',
  },

  photoUnavailable: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#383E39',
  },

  photoUnavailableText: {
    fontSize: 11,
    textAlign: 'center',
    color: '#858B8F',
  },

  photoDate: {
    paddingHorizontal: 10,
    paddingTop: 9,
    fontSize: 9,
    color: '#92979A',
  },

  deleteButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },

  deleteButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF8D83',
  },
});
