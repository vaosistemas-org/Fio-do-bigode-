import {
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
  category: string;
  identifier: string | null;
  responsible_user_id: string | null;
  status: EnvironmentStatus;
  progress: number;
  preparation_min_photos: number;
  active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

type TabMode = 'active' | 'archived';

const STATUS_LABELS: Record<
  EnvironmentStatus,
  string
> = {
  nao_iniciado: 'NÃ£o iniciado',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'ConcluÃ­do',
  cancelado: 'Cancelado',
};

function formatDate(value: string | null) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString(
    'pt-BR'
  );
}

export default function EnvironmentsScreen() {
  const router = useRouter();

  const { workId } =
    useLocalSearchParams<{
      workId: string;
    }>();

  const {
    canManage,
    canWrite,
    loadingAccess,
  } = useWorkAccess(workId);

  const [work, setWork] =
    useState<Work | null>(null);

  const [
    environments,
    setEnvironments,
  ] = useState<Environment[]>([]);

  const [
    responsibleNames,
    setResponsibleNames,
  ] = useState<
    Record<string, string>
  >({});

  const [
    photoCounts,
    setPhotoCounts,
  ] = useState<
    Record<string, number>
  >({});

  const [tab, setTab] =
    useState<TabMode>('active');

  const [loading, setLoading] =
    useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    restoringId,
    setRestoringId,
  ] = useState<string | null>(
    null
  );

  const [message, setMessage] =
    useState('');

  async function loadData(
    isRefresh = false
  ) {
    if (!workId) {
      setMessage(
        'Obra nÃ£o encontrada.'
      );

      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setMessage('');

    try {
      const [
        workResult,
        environmentsResult,
        photosResult,
      ] = await Promise.all([
        supabase
          .from('works')
          .select(`
            id,
            code,
            client_name
          `)
          .eq('id', workId)
          .maybeSingle(),

        supabase
          .from('environments')
          .select(`
            id,
            work_id,
            name,
            category,
            identifier,
            responsible_user_id,
            status,
            progress,
            preparation_min_photos,
            active,
            archived_at,
            created_at,
            updated_at
          `)
          .eq('work_id', workId)
          .order('created_at', {
            ascending: true,
          }),

        supabase
          .from('work_photos')
          .select('environment_id')
          .eq('work_id', workId),
      ]);

      if (workResult.error) {
        setMessage(
          workResult.error.message
        );
        return;
      }

      if (!workResult.data) {
        setMessage(
          'VocÃª nÃ£o possui acesso a esta obra.'
        );
        return;
      }

      if (
        environmentsResult.error
      ) {
        setMessage(
          environmentsResult.error
            .message
        );
        return;
      }

      const loadedEnvironments =
        (environmentsResult.data ??
          []) as Environment[];

      setWork(
        workResult.data as Work
      );

      setEnvironments(
        loadedEnvironments
      );

      if (photosResult.error) {
        setMessage(
          photosResult.error.message
        );
      } else {
        const counts: Record<
          string,
          number
        > = {};

        for (
          const photo of
          photosResult.data ?? []
        ) {
          if (
            !photo.environment_id
          ) {
            continue;
          }

          counts[
            photo.environment_id
          ] =
            (counts[
              photo.environment_id
            ] ?? 0) + 1;
        }

        setPhotoCounts(counts);
      }

      const responsibleIds = [
        ...new Set(
          loadedEnvironments
            .map(
              (environment) =>
                environment.responsible_user_id
            )
            .filter(
              (
                value
              ): value is string =>
                Boolean(value)
            )
        ),
      ];

      if (
        responsibleIds.length === 0
      ) {
        setResponsibleNames({});
        return;
      }

      const { data: profiles } =
        await supabase
          .from('profiles')
          .select(
            'id, full_name'
          )
          .in(
            'id',
            responsibleIds
          );

      const names: Record<
        string,
        string
      > = {};

      for (
        const profile of
        profiles ?? []
      ) {
        names[profile.id] =
          profile.full_name ||
          'ResponsÃ¡vel';
      }

      setResponsibleNames(
        names
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'NÃ£o foi possÃ­vel carregar os ambientes.'
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
    }, [workId])
  );

  const activeEnvironments =
    useMemo(
      () =>
        environments.filter(
          (environment) =>
            environment.active
        ),
      [environments]
    );

  const archivedEnvironments =
    useMemo(
      () =>
        environments.filter(
          (environment) =>
            !environment.active
        ),
      [environments]
    );

  const activeCounts =
    useMemo(() => {
      return {
        total:
          activeEnvironments.length,

        concluidos:
          activeEnvironments.filter(
            (environment) =>
              environment.status ===
              'concluido'
          ).length,

        aguardando:
          activeEnvironments.filter(
            (environment) =>
              environment.status ===
              'aguardando'
          ).length,
      };
    }, [activeEnvironments]);

  function openEnvironment(
    environmentId: string
  ) {
    router.push({
      pathname:
        '/environment/[id]',
      params: {
        id: environmentId,
      },
    });
  }

  function openPhotos(
    environmentId: string
  ) {
    router.push({
      pathname:
        '/environment-photos',
      params: {
        id: environmentId,
      },
    });
  }

  async function handleRestore(
    environment: Environment
  ) {
    if (
      restoringId ||
      !canManage
    ) {
      return;
    }

    setRestoringId(
      environment.id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'restore_environment',
          {
            p_environment_id:
              environment.id,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadData();
      setTab('active');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'NÃ£o foi possÃ­vel restaurar o ambiente.'
      );
    } finally {
      setRestoringId(null);
    }
  }

  if (loading || loadingAccess) {
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
          Carregando ambientes...
        </Text>
      </View>
    );
  }

  const showingArchived =
    tab === 'archived';

  const visibleEnvironments =
    showingArchived
      ? archivedEnvironments
      : activeEnvironments;

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
            GESTÃƒO DE OBRAS
          </Text>
        </View>

        <Pressable
          style={styles.topButton}
          onPress={() =>
            router.replace(
              '/profile'
            )
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
        onPress={() =>
          router.replace({
            pathname:
              '/works/[id]',
            params: {
              id: workId,
            },
          })
        }
      >
        <Text
          style={
            styles.backButtonText
          }
        >
          â€¹ Voltar para obra
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
        style={styles.titleRow}
      >
        <View
          style={
            styles.titleBlock
          }
        >
          <Text
            style={styles.eyebrow}
          >
            CENTRAL DA OBRA
          </Text>

          <Text
            style={styles.title}
          >
            Ambientes
          </Text>
        </View>

        {canWrite && (
          <Pressable
            style={styles.newButton}
            onPress={() =>
              router.push({
                pathname:
                  '/new-environment',
                params: {
                  workId,
                },
              })
            }
          >
            <Text
              style={
                styles.newButtonText
              }
            >
              + Novo
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[
            styles.tabButton,
            tab === 'active' &&
              styles.tabButtonSelected,
          ]}
          onPress={() =>
            setTab('active')
          }
        >
          <Text
            style={[
              styles.tabText,
              tab === 'active' &&
                styles.tabTextSelected,
            ]}
          >
            Ativos (
            {
              activeEnvironments.length
            }
            )
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.tabButton,
            tab === 'archived' &&
              styles.tabButtonSelected,
          ]}
          onPress={() =>
            setTab('archived')
          }
        >
          <Text
            style={[
              styles.tabText,
              tab === 'archived' &&
                styles.tabTextSelected,
            ]}
          >
            Arquivados (
            {
              archivedEnvironments.length
            }
            )
          </Text>
        </Pressable>
      </View>

      {!showingArchived && (
        <View
          style={
            styles.summaryRow
          }
        >
          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryValue
              }
            >
              {activeCounts.total}
            </Text>

            <Text
              style={
                styles.summaryLabel
              }
            >
              Ambientes
            </Text>
          </View>

          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryValue
              }
            >
              {
                activeCounts.concluidos
              }
            </Text>

            <Text
              style={
                styles.summaryLabel
              }
            >
              ConcluÃ­dos
            </Text>
          </View>

          <View
            style={
              styles.summaryCard
            }
          >
            <Text
              style={
                styles.summaryValue
              }
            >
              {
                activeCounts.aguardando
              }
            </Text>

            <Text
              style={
                styles.summaryLabel
              }
            >
              Aguardando
            </Text>
          </View>
        </View>
      )}

      {showingArchived && (
        <View
          style={
            styles.archiveInfo
          }
        >
          <Text
            style={
              styles.archiveInfoTitle
            }
          >
            Ambientes arquivados
          </Text>

          <Text
            style={
              styles.archiveInfoText
            }
          >
            Permanecem salvos e
            podem ser restaurados
            quando necessÃ¡rio.
          </Text>
        </View>
      )}

      {!!message && (
        <View
          style={styles.errorCard}
        >
          <Text
            style={
              styles.errorText
            }
          >
            {message}
          </Text>
        </View>
      )}

      {!message &&
        visibleEnvironments.length ===
          0 && (
          <View
            style={
              styles.emptyCard
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {showingArchived
                ? 'Nenhum ambiente arquivado'
                : 'Nenhum ambiente cadastrado'}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {showingArchived
                ? 'Os ambientes arquivados aparecerÃ£o aqui.'
                : 'Cadastre o primeiro ambiente da obra.'}
            </Text>

            {!showingArchived &&
              canWrite && (
              <Pressable
                style={
                  styles.emptyButton
                }
                onPress={() =>
                  router.push({
                    pathname:
                      '/new-environment',
                    params: {
                      workId,
                    },
                  })
                }
              >
                <Text
                  style={
                    styles.emptyButtonText
                  }
                >
                  + Novo ambiente
                </Text>
              </Pressable>
            )}
          </View>
        )}

      {visibleEnvironments.map(
        (environment) => {
          const progress =
            Math.max(
              0,
              Math.min(
                environment.progress,
                100
              )
            );

          const responsibleName =
            environment.responsible_user_id
              ? responsibleNames[
                  environment
                    .responsible_user_id
                ] ??
                'ResponsÃ¡vel'
              : 'Sem responsÃ¡vel';

          const photoCount =
            photoCounts[
              environment.id
            ] ?? 0;

          const minimumPhotos =
            environment.preparation_min_photos ??
            0;

          const missingPhotos =
            Math.max(
              minimumPhotos -
                photoCount,
              0
            );

          const photoReady =
            minimumPhotos > 0 &&
            missingPhotos === 0;

          if (showingArchived) {
            return (
              <View
                key={
                  environment.id
                }
                style={[
                  styles.environmentCard,
                  styles.archivedCard,
                ]}
              >
                <View
                  style={
                    styles.cardTop
                  }
                >
                  <View
                    style={
                      styles.cardIdentity
                    }
                  >
                    <Text
                      style={
                        styles.environmentName
                      }
                    >
                      {
                        environment.name
                      }
                    </Text>

                    <Text
                      style={
                        styles.responsible
                      }
                    >
                      {responsibleName}
                    </Text>
                  </View>

                  <View
                    style={
                      styles.archivedBadge
                    }
                  >
                    <Text
                      style={
                        styles.archivedBadgeText
                      }
                    >
                      Arquivado
                    </Text>
                  </View>
                </View>

                <View
                  style={
                    styles.progressRow
                  }
                >
                  <Text
                    style={
                      styles.progressLabel
                    }
                  >
                    Ãšltimo andamento
                  </Text>

                  <Text
                    style={
                      styles.progressText
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
                    styles.photoSummary,
                    pressed &&
                      styles.photoSummaryPressed,
                  ]}
                  onPress={() =>
                    openPhotos(
                      environment.id
                    )
                  }
                >
                  <View>
                    <Text
                      style={
                        styles.photoSummaryTitle
                      }
                    >
                      Fotos
                    </Text>

                    <Text
                      style={
                        styles.photoSummaryValue
                      }
                    >
                      {photoCount}{' '}
                      {photoCount === 1
                        ? 'foto'
                        : 'fotos'}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.photoSummaryArrow
                    }
                  >
                    Abrir fotos â€º
                  </Text>
                </Pressable>

                <Text
                  style={
                    styles.archivedDate
                  }
                >
                  Arquivado em{' '}
                  {formatDate(
                    environment.archived_at
                  )}
                </Text>

                {canManage && (
                  <Pressable
                    style={[
                      styles.restoreButton,
                      restoringId ===
                        environment.id &&
                        styles.restoreButtonDisabled,
                    ]}
                    onPress={() =>
                      handleRestore(
                        environment
                      )
                    }
                    disabled={
                      restoringId !==
                      null
                    }
                  >
                    <Text
                      style={
                        styles.restoreButtonText
                      }
                    >
                      {restoringId ===
                      environment.id
                        ? 'Restaurando...'
                        : 'Restaurar ambiente'}
                    </Text>
                  </Pressable>
                )}
              </View>
            );
          }

          return (
            <Pressable
              key={environment.id}
              style={({
                pressed,
              }) => [
                styles.environmentCard,
                pressed &&
                  styles.cardPressed,
              ]}
              onPress={() =>
                openEnvironment(
                  environment.id
                )
              }
            >
              <View
                style={styles.cardTop}
              >
                <View
                  style={
                    styles.cardIdentity
                  }
                >
                  <Text
                    style={
                      styles.environmentName
                    }
                  >
                    {environment.name}
                  </Text>

                  <Text
                    style={
                      styles.responsible
                    }
                  >
                    {responsibleName}
                  </Text>
                </View>

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
                        environment
                          .status
                      ]
                    }
                  </Text>
                </View>
              </View>

              <View
                style={
                  styles.progressRow
                }
              >
                <Text
                  style={
                    styles.progressLabel
                  }
                >
                  Andamento
                </Text>

                <Text
                  style={
                    styles.progressText
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
                  styles.photoSummary,
                  pressed &&
                    styles.photoSummaryPressed,
                ]}
                onPress={(event) => {
                  event.stopPropagation();

                  openPhotos(
                    environment.id
                  );
                }}
              >
                <View>
                  <Text
                    style={
                      styles.photoSummaryTitle
                    }
                  >
                    Fotos
                  </Text>

                  <Text
                    style={
                      styles.photoSummaryValue
                    }
                  >
                    {minimumPhotos > 0
                      ? `${photoCount}/${minimumPhotos}`
                      : `${photoCount} ${
                          photoCount ===
                          1
                            ? 'foto'
                            : 'fotos'
                        }`}
                  </Text>
                </View>

                <View
                  style={
                    styles.photoSummaryAction
                  }
                >
                  {minimumPhotos >
                    0 && (
                    <Text
                      style={[
                        styles.photoSummaryStatus,
                        photoReady &&
                          styles.photoSummaryStatusReady,
                      ]}
                    >
                      {photoReady
                        ? 'Completo'
                        : `Faltam ${missingPhotos}`}
                    </Text>
                  )}

                  <Text
                    style={
                      styles.photoSummaryArrow
                    }
                  >
                    Abrir fotos â€º
                  </Text>
                </View>
              </Pressable>

              <View
                style={
                  styles.cardFooter
                }
              >
                <Text
                  style={
                    styles.updatedText
                  }
                >
                  Atualizado em{' '}
                  {formatDate(
                    environment.updated_at
                  )}
                </Text>

                <Text
                  style={
                    styles.openText
                  }
                >
                  Abrir ambiente â€º
                </Text>
              </View>
            </Pressable>
          );
        }
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

    titleRow: {
      marginTop: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      gap: 12,
    },

    titleBlock: {
      flex: 1,
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#E07A3A',
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#2C343A',
    },

    newButton: {
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 15,
      borderRadius: 999,
      backgroundColor:
        '#E07A3A',
    },

    newButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    tabs: {
      marginTop: 20,
      flexDirection: 'row',
      padding: 4,
      borderRadius: 14,
      backgroundColor:
        '#ECEEEC',
    },

    tabButton: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
    },

    tabButtonSelected: {
      backgroundColor:
        '#FFFFFF',
    },

    tabText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#858B8F',
    },

    tabTextSelected: {
      color: '#2C343A',
    },

    summaryRow: {
      marginTop: 14,
      marginBottom: 18,
      flexDirection: 'row',
      gap: 8,
    },

    summaryCard: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    summaryValue: {
      fontSize: 20,
      fontWeight: '800',
      color: '#2C343A',
    },

    summaryLabel: {
      marginTop: 3,
      fontSize: 10,
      fontWeight: '700',
      color: '#858B8F',
    },

    archiveInfo: {
      marginTop: 14,
      marginBottom: 16,
      padding: 15,
      borderRadius: 14,
      backgroundColor:
        '#F0F1EF',
    },

    archiveInfoTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#2C343A',
    },

    archiveInfoText: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 16,
      color: '#7A8185',
    },

    environmentCard: {
      marginBottom: 12,
      padding: 17,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    cardPressed: {
      opacity: 0.78,
    },

    archivedCard: {
      borderColor: '#DDDAD6',
      backgroundColor:
        '#FBFAF8',
    },

    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent:
        'space-between',
      gap: 12,
    },

    cardIdentity: {
      flex: 1,
    },

    environmentName: {
      fontSize: 18,
      fontWeight: '800',
      color: '#2C343A',
    },

    responsible: {
      marginTop: 4,
      fontSize: 12,
      color: '#7D8488',
    },

    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        '#EEF1ED',
    },

    statusText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#506455',
    },

    archivedBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        '#EEEAE6',
    },

    archivedBadgeText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#786B62',
    },

    progressRow: {
      marginTop: 17,
      flexDirection: 'row',
      justifyContent:
        'space-between',
    },

    progressLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#7B8286',
    },

    progressText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#2C343A',
    },

    progressTrack: {
      height: 7,
      marginTop: 8,
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

    photoSummary: {
      marginTop: 14,
      paddingTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      borderTopWidth: 1,
      borderTopColor:
        '#ECEEEC',
    },

    photoSummaryPressed: {
      opacity: 0.5,
    },

    photoSummaryTitle: {
      fontSize: 9,
      fontWeight: '800',
      color: '#8A9094',
    },

    photoSummaryValue: {
      marginTop: 2,
      fontSize: 12,
      fontWeight: '800',
      color: '#2C343A',
    },

    photoSummaryAction: {
      alignItems: 'flex-end',
      gap: 5,
    },

    photoSummaryStatus: {
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        '#FFF4EC',
      fontSize: 9,
      fontWeight: '800',
      color: '#A65B32',
    },

    photoSummaryStatusReady: {
      backgroundColor:
        '#EEF1ED',
      color: '#506455',
    },

    photoSummaryArrow: {
      fontSize: 10,
      fontWeight: '800',
      color: '#E07A3A',
    },

    cardFooter: {
      marginTop: 16,
      flexDirection: 'row',
      justifyContent:
        'space-between',
      gap: 10,
    },

    updatedText: {
      flex: 1,
      fontSize: 10,
      color: '#9A9FA2',
    },

    openText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#E07A3A',
    },

    archivedDate: {
      marginTop: 13,
      fontSize: 10,
      color: '#908A86',
    },

    restoreButton: {
      minHeight: 44,
      marginTop: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#5F7567',
      borderRadius: 12,
      backgroundColor:
        '#FFFFFF',
    },

    restoreButtonDisabled: {
      opacity: 0.55,
    },

    restoreButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#506455',
    },

    emptyCard: {
      padding: 28,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    emptyTitle: {
      fontSize: 17,
      fontWeight: '800',
      textAlign: 'center',
      color: '#2C343A',
    },

    emptyText: {
      marginTop: 7,
      fontSize: 13,
      textAlign: 'center',
      color: '#7A8185',
    },

    emptyButton: {
      minHeight: 42,
      marginTop: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 17,
      borderRadius: 999,
      backgroundColor:
        '#E07A3A',
    },

    emptyButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    errorCard: {
      marginBottom: 14,
      padding: 16,
      borderRadius: 14,
      backgroundColor:
        '#FFF2F0',
    },

    errorText: {
      fontSize: 13,
      color: '#B42318',
    },
  });