import {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';

import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type EnvironmentStatus =
  | 'nao_iniciado'
  | 'em_andamento'
  | 'aguardando'
  | 'concluido'
  | 'cancelado';

type Environment = {
  id: string;
  work_id: string;
  name: string;
  status: EnvironmentStatus;
  progress: number;
  responsible_user_id: string | null;
  services_notes: string | null;
  missing_items_notes: string | null;
  notes: string | null;
  preparation_min_photos: number;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

type WorkEvent = {
  id: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<
  EnvironmentStatus,
  string
> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function getEventTitle(
  event: WorkEvent
) {
  if (event.title) {
    return event.title;
  }

  switch (event.event_type) {
    case 'AMBIENTE_CRIADO':
      return 'Ambiente criado';

    case 'AMBIENTE_ATUALIZADO':
      return 'Ambiente atualizado';

    case 'AVANCO_AMBIENTE':
      return 'Avanço registrado';

    case 'AMBIENTE_ARQUIVADO':
      return 'Ambiente arquivado';

    case 'AMBIENTE_RESTAURADO':
      return 'Ambiente restaurado';

    case 'FOTO_ADICIONADA':
      return 'Foto adicionada';

    case 'FOTO_REMOVIDA':
      return 'Foto removida';

    default:
      return 'Atualização do ambiente';
  }
}

function getEventDescription(
  event: WorkEvent
) {
  return (
    event.description ||
    null
  );
}

function formatDate(
  value: string
) {
  return new Date(
    value
  ).toLocaleString(
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

export default function EnvironmentScreen() {
  const router = useRouter();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    environment,
    setEnvironment,
  ] =
    useState<Environment | null>(
      null
    );

  const [work, setWork] =
    useState<Work | null>(null);

  const [
    responsibleName,
    setResponsibleName,
  ] = useState(
    'Sem responsável'
  );

  const [events, setEvents] =
    useState<WorkEvent[]>([]);

  const [
    photoCount,
    setPhotoCount,
  ] = useState(0);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState('');

  const {
    userId,
    canManage,
    canWrite,
    isViewer,
    loadingAccess,
  } = useWorkAccess(
    environment?.work_id
  );

  async function loadData() {
    if (!id) {
      setMessage(
        'Ambiente não encontrado.'
      );

      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

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
          status,
          progress,
          responsible_user_id,
          services_notes,
          missing_items_notes,
          notes,
          preparation_min_photos
        `)
        .eq('id', id)
        .maybeSingle();

      if (environmentError) {
        setMessage(
          environmentError.message
        );
        return;
      }

      if (!environmentData) {
        setMessage(
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
        eventsResult,
        photoResult,
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

        supabase.rpc(
          'get_environment_history',
          {
            p_environment_id:
              loadedEnvironment.id,
          }
        ),

        supabase
          .from('work_photos')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq(
            'environment_id',
            loadedEnvironment.id
          ),
      ]);

      if (workResult.error) {
        setMessage(
          workResult.error.message
        );
      } else if (
        workResult.data
      ) {
        setWork(
          workResult.data as Work
        );
      }

      if (eventsResult.error) {
        setMessage(
          eventsResult.error.message
        );

        setEvents([]);
      } else {
        setEvents(
          (eventsResult.data ??
            []) as WorkEvent[]
        );
      }

      if (photoResult.error) {
        setMessage(
          photoResult.error.message
        );
      } else {
        setPhotoCount(
          photoResult.count ?? 0
        );
      }

      if (
        loadedEnvironment.responsible_user_id
      ) {
        const {
          data: profileData,
        } = await supabase
          .from('profiles')
          .select('full_name')
          .eq(
            'id',
            loadedEnvironment
              .responsible_user_id
          )
          .maybeSingle();

        if (
          profileData?.full_name
        ) {
          setResponsibleName(
            profileData.full_name
          );
        } else {
          setResponsibleName(
            'Responsável'
          );
        }
      } else {
        setResponsibleName(
          'Sem responsável'
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o ambiente.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const isResponsible =
    !!environment &&
    !!userId &&
    environment.responsible_user_id ===
      userId;

  const canRegisterProgress =
    canManage ||
    (
      canWrite &&
      isResponsible
    );

  function handleBack() {
    if (!environment) {
      router.back();
      return;
    }

    router.push({
      pathname:
        '/environments',
      params: {
        workId:
          environment.work_id,
      },
    });
  }

  function handleOpenProgress() {
    if (
      !environment ||
      !canRegisterProgress
    ) {
      return;
    }

    router.push({
      pathname:
        '/environment-progress',
      params: {
        id: environment.id,
      },
    });
  }

  function handleOpenPhotos() {
    if (!environment) {
      return;
    }

    router.push({
      pathname:
        '/environment-photos',
      params: {
        id: environment.id,
      },
    });
  }

  if (loading) {
    return (
      <View
        style={styles.loading}
      >
        <ActivityIndicator />

        <Text
          style={
            styles.loadingText
          }
        >
          Carregando ambiente...
        </Text>
      </View>
    );
  }

  if (!environment) {
    return (
      <View
        style={styles.loading}
      >
        <Text
          style={styles.errorText}
        >
          {message ||
            'Ambiente não encontrado.'}
        </Text>

        <Pressable
          style={
            styles.errorBackButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.errorBackButtonText
            }
          >
            Voltar
          </Text>
        </Pressable>
      </View>
    );
  }

  const progress = Math.max(
    0,
    Math.min(
      environment.progress,
      100
    )
  );

  const minimumPhotos =
    environment.preparation_min_photos ??
    0;

  const missingPhotos =
    Math.max(
      minimumPhotos -
        photoCount,
      0
    );

  const photosReady =
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
    >
      <View
        style={styles.topBar}
      >
        <View>
          <Text
            style={styles.brand}
          >
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

      <Pressable
        style={styles.backButton}
        onPress={handleBack}
      >
        <Text
          style={
            styles.backButtonText
          }
        >
          ‹ Ambientes
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

      <View
        style={styles.header}
      >
        <Text
          style={styles.eyebrow}
        >
          AMBIENTE
        </Text>

        <Text
          style={styles.title}
        >
          {environment.name}
        </Text>

        <Text
          style={
            styles.responsible
          }
        >
          Responsável:{' '}
          {responsibleName}
        </Text>
      </View>

      {!loadingAccess &&
        isViewer && (
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
              Você pode consultar este
              ambiente e suas fotos,
              mas não pode alterar o
              andamento ou a ficha.
            </Text>
          </View>
        )}

      <View
        style={styles.statusRow}
      >
        <View
          style={
            styles.statusBadge
          }
        >
          <Text
            style={
              styles.statusText
            }
          >
            {
              STATUS_LABELS[
                environment.status
              ]
            }
          </Text>
        </View>

        <Text
          style={
            styles.progressNumber
          }
        >
          {progress}%
        </Text>
      </View>

      <View
        style={
          styles.progressTrack
        }
      >
        <View
          style={[
            styles.progressFill,
            {
              width:
                `${progress}%` as `${number}%`,
            },
          ]}
        />
      </View>

      <Pressable
        style={({
          pressed,
        }) => [
          styles.photoReadinessCard,
          pressed &&
            styles.photoReadinessPressed,
        ]}
        onPress={
          handleOpenPhotos
        }
      >
        <View>
          <Text
            style={
              styles.photoReadinessLabel
            }
          >
            FOTOS DO AMBIENTE
          </Text>

          <Text
            style={
              styles.photoReadinessValue
            }
          >
            {minimumPhotos > 0
              ? `${photoCount}/${minimumPhotos}`
              : `${photoCount} ${
                  photoCount === 1
                    ? 'foto'
                    : 'fotos'
                }`}
          </Text>
        </View>

        <View
          style={
            styles.photoReadinessAction
          }
        >
          <View
            style={[
              styles.photoReadinessBadge,
              photosReady &&
                styles.photoReadinessBadgeReady,
            ]}
          >
            <Text
              style={[
                styles.photoReadinessBadgeText,
                photosReady &&
                  styles.photoReadinessBadgeTextReady,
              ]}
            >
              {minimumPhotos === 0
                ? 'Sem mínimo'
                : photosReady
                ? 'Completo'
                : `Faltam ${missingPhotos}`}
            </Text>
          </View>

          <Text
            style={
              styles.photoReadinessOpen
            }
          >
            Abrir fotos ›
          </Text>
        </View>
      </Pressable>

      <View
        style={
          styles.environmentActions
        }
      >
        {canRegisterProgress && (
          <Pressable
            style={({ pressed }) => [
              styles.progressButton,
              styles.actionButton,
              pressed &&
                styles.progressButtonPressed,
            ]}
            onPress={
              handleOpenProgress
            }
          >
            <Text
              style={
                styles.progressButtonText
              }
            >
              Registrar avanço
            </Text>
          </Pressable>
        )}

        {canManage && (
          <Pressable
            style={({ pressed }) => [
              styles.editButton,
              styles.actionButton,
              pressed &&
                styles.progressButtonPressed,
            ]}
            onPress={() =>
              router.push({
                pathname:
                  '/edit-environment',
                params: {
                  id: environment.id,
                },
              })
            }
          >
            <Text
              style={
                styles.editButtonText
              }
            >
              Editar ambiente
            </Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.editButton,
            styles.actionButton,
            pressed &&
              styles.progressButtonPressed,
          ]}
          onPress={
            handleOpenPhotos
          }
        >
          <Text
            style={
              styles.editButtonText
            }
          >
            Fotos
          </Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text
          style={styles.sectionTitle}
        >
          ANDAMENTO DO AMBIENTE
        </Text>

        {environment.services_notes ? (
          <View
            style={styles.infoBlock}
          >
            <Text
              style={styles.infoLabel}
            >
              Serviços realizados
            </Text>

            <Text
              style={styles.infoText}
            >
              {
                environment.services_notes
              }
            </Text>
          </View>
        ) : null}

        {environment.missing_items_notes ? (
          <View
            style={styles.infoBlock}
          >
            <Text
              style={styles.infoLabel}
            >
              Itens faltantes
            </Text>

            <Text
              style={styles.infoText}
            >
              {
                environment.missing_items_notes
              }
            </Text>
          </View>
        ) : null}

        {environment.notes ? (
          <View
            style={styles.infoBlock}
          >
            <Text
              style={styles.infoLabel}
            >
              Observações
            </Text>

            <Text
              style={styles.infoText}
            >
              {environment.notes}
            </Text>
          </View>
        ) : null}

        {!environment.services_notes &&
          !environment.missing_items_notes &&
          !environment.notes && (
            <Text
              style={styles.emptyText}
            >
              Nenhuma informação
              adicional registrada
              neste ambiente.
            </Text>
          )}
      </View>

      <View style={styles.card}>
        <Text
          style={styles.sectionTitle}
        >
          HISTÓRICO DO AMBIENTE
        </Text>

        {events.length === 0 ? (
          <Text
            style={styles.emptyText}
          >
            Nenhuma atualização
            registrada.
          </Text>
        ) : (
          events.map(
            (event, index) => {
              const description =
                getEventDescription(
                  event
                );

              return (
                <View
                  key={event.id}
                  style={[
                    styles.eventItem,
                    index ===
                      events.length -
                        1 &&
                      styles.eventItemLast,
                  ]}
                >
                  <View
                    style={
                      styles.eventDot
                    }
                  />

                  <View
                    style={
                      styles.eventContent
                    }
                  >
                    <Text
                      style={
                        styles.eventTitle
                      }
                    >
                      {getEventTitle(
                        event
                      )}
                    </Text>

                    {!!description && (
                      <Text
                        style={
                          styles.eventDescription
                        }
                      >
                        {description}
                      </Text>
                    )}

                    <Text
                      style={
                        styles.eventActor
                      }
                    >
                      Por: {' '}
                      {event.actor_full_name ||
                        'Usuário não identificado'}
                    </Text>

                    <Text
                      style={
                        styles.eventDate
                      }
                    >
                      {formatDate(
                        event.created_at
                      )}
                    </Text>
                  </View>
                </View>
              );
            }
          )
        )}
      </View>

      {!!message && (
        <View
          style={
            styles.messageCard
          }
        >
          <Text
            style={
              styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor:
        '#F7F7F5',
    },

    content: {
      width: '100%',
      maxWidth: 620,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 70,
    },

    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 30,
      backgroundColor:
        '#F7F7F5',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#777D80',
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
      color: '#2C343A',
    },

    brandSubtitle: {
      marginTop: 2,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 1.6,
      color: '#5F7567',
    },

    topButton: {
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor:
        '#FFFFFF',
    },

    topButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 22,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor:
        '#FFFFFF',
    },

    backButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
    },

    workCode: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: '#5F7567',
    },

    workName: {
      marginTop: 4,
      fontSize: 14,
      fontWeight: '700',
      color: '#70787D',
    },

    header: {
      marginTop: 22,
      marginBottom: 20,
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#E07A3A',
    },

    title: {
      marginTop: 5,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#2C343A',
    },

    responsible: {
      marginTop: 7,
      fontSize: 13,
      color: '#747B80',
    },

    readOnlyCard: {
      marginBottom: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: '#DADFDA',
      borderRadius: 14,
      backgroundColor:
        '#EEF1ED',
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

    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
    },

    statusBadge: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor:
        '#EEF1ED',
    },

    statusText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#506455',
    },

    progressNumber: {
      fontSize: 18,
      fontWeight: '800',
      color: '#2C343A',
    },

    progressTrack: {
      height: 9,
      marginTop: 12,
      marginBottom: 18,
      overflow: 'hidden',
      borderRadius: 999,
      backgroundColor:
        '#E7E9E7',
    },

    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor:
        '#5F7567',
    },

    photoReadinessCard: {
      marginBottom: 18,
      padding: 15,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    photoReadinessPressed: {
      opacity: 0.6,
    },

    photoReadinessLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: '#5F7567',
    },

    photoReadinessValue: {
      marginTop: 3,
      fontSize: 17,
      fontWeight: '800',
      color: '#2C343A',
    },

    photoReadinessAction: {
      alignItems: 'flex-end',
      gap: 5,
    },

    photoReadinessBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        '#FFF4EC',
    },

    photoReadinessBadgeReady: {
      backgroundColor:
        '#EEF1ED',
    },

    photoReadinessBadgeText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#A65B32',
    },

    photoReadinessBadgeTextReady: {
      color: '#506455',
    },

    photoReadinessOpen: {
      fontSize: 10,
      fontWeight: '800',
      color: '#E07A3A',
    },

    environmentActions: {
      marginBottom: 18,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },

    actionButton: {
      flexGrow: 1,
      flexBasis: '47%',
      marginBottom: 0,
    },

    progressButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor:
        '#E07A3A',
    },

    progressButtonPressed: {
      opacity: 0.7,
    },

    progressButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    editButton: {
      minHeight: 54,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    editButtonText: {
      fontSize: 14,
      fontWeight: '800',
      color: '#2C343A',
    },

    card: {
      marginBottom: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    sectionTitle: {
      marginBottom: 12,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#5F7567',
    },

    infoBlock: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        '#ECEEEC',
    },

    infoLabel: {
      marginBottom: 4,
      fontSize: 11,
      fontWeight: '700',
      color: '#898F93',
    },

    infoText: {
      fontSize: 14,
      lineHeight: 20,
      color: '#2C343A',
    },

    emptyText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#858B8F',
    },

    eventItem: {
      flexDirection: 'row',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor:
        '#ECEEEC',
    },

    eventItemLast: {
      borderBottomWidth: 0,
    },

    eventDot: {
      width: 9,
      height: 9,
      marginTop: 5,
      marginRight: 12,
      borderRadius: 999,
      backgroundColor:
        '#E07A3A',
    },

    eventContent: {
      flex: 1,
    },

    eventTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#2C343A',
    },

    eventDescription: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 19,
      color: '#687177',
    },

    eventActor: {
      marginTop: 6,
      fontSize: 11,
      fontWeight: '700',
      color: '#5F7567',
    },

    eventDate: {
      marginTop: 3,
      fontSize: 10,
      color: '#969B9E',
    },

    messageCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#FFF2F0',
    },

    messageText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#B42318',
    },

    errorText: {
      fontSize: 13,
      textAlign: 'center',
      color: '#B42318',
    },

    errorBackButton: {
      marginTop: 18,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor:
        '#2C343A',
    },

    errorBackButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },
  });