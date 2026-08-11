import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

type WorkStatus =
  | 'agendada'
  | 'em_andamento'
  | 'aguardando_peca'
  | 'aguardando_cliente'
  | 'finalizada';

type Work = {
  id: string;
  code: string;
  client_name: string;
  client_phone: string;
  address: string;
  project_order: string | null;
  status: WorkStatus;
  progress: number;
  next_visit_at: string | null;
  notes: string | null;
  updated_at: string;
};

type FilterType =
  | 'total'
  | 'em_andamento'
  | 'aguardando'
  | 'finalizada';

const STATUS_LABELS: Record<WorkStatus, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

function formatDate(value: string | null) {
  if (!value) {
    return 'Não definida';
  }

  return new Date(value).toLocaleDateString('pt-BR');
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const now = new Date();

  const diffMilliseconds =
    now.getTime() - date.getTime();

  const diffMinutes = Math.floor(
    diffMilliseconds / 60000
  );

  if (diffMinutes < 1) {
    return 'Atualizada agora';
  }

  if (diffMinutes < 60) {
    return `Atualizada há ${diffMinutes} min`;
  }

  const diffHours = Math.floor(
    diffMinutes / 60
  );

  if (diffHours < 24) {
    return `Atualizada há ${diffHours} ${
      diffHours === 1 ? 'hora' : 'horas'
    }`;
  }

  const diffDays = Math.floor(
    diffHours / 24
  );

  if (diffDays <= 7) {
    return `Atualizada há ${diffDays} ${
      diffDays === 1 ? 'dia' : 'dias'
    }`;
  }

  return `Atualizada em ${date.toLocaleDateString(
    'pt-BR'
  )}`;
}

export default function WorksScreen() {
  const router = useRouter();

  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);
  const [message, setMessage] = useState('');

  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] =
    useState<FilterType>('total');

  async function loadWorks(
    isRefresh = false
  ) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setMessage('');

    const { data, error } = await supabase
      .from('works')
      .select(`
        id,
        code,
        client_name,
        client_phone,
        address,
        project_order,
        status,
        progress,
        next_visit_at,
        notes,
        updated_at
      `)
      .is('archived_at', null)
      .order('updated_at', {
        ascending: false,
      });

    if (error) {
      setMessage(error.message);

      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }

      return;
    }

    setWorks((data ?? []) as Work[]);

    if (isRefresh) {
      setRefreshing(false);
    } else {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadWorks();
    }, [])
  );

  const counts = useMemo(() => {
    return {
      total: works.length,

      em_andamento: works.filter(
        (work) =>
          work.status === 'em_andamento'
      ).length,

      aguardando: works.filter(
        (work) =>
          work.status ===
            'aguardando_peca' ||
          work.status ===
            'aguardando_cliente'
      ).length,

      finalizada: works.filter(
        (work) =>
          work.status === 'finalizada'
      ).length,
    };
  }, [works]);

  const filteredWorks = useMemo(() => {
    const normalizedSearch =
      search.trim().toLowerCase();

    return works.filter((work) => {
      let matchesFilter = true;

      if (
        activeFilter ===
        'em_andamento'
      ) {
        matchesFilter =
          work.status ===
          'em_andamento';
      }

      if (
        activeFilter === 'aguardando'
      ) {
        matchesFilter =
          work.status ===
            'aguardando_peca' ||
          work.status ===
            'aguardando_cliente';
      }

      if (
        activeFilter === 'finalizada'
      ) {
        matchesFilter =
          work.status === 'finalizada';
      }

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableValues = [
        work.code,
        work.client_name,
        work.address,
        work.project_order ?? '',
        STATUS_LABELS[work.status],
      ];

      return searchableValues.some(
        (value) =>
          value
            .toLowerCase()
            .includes(
              normalizedSearch
            )
      );
    });
  }, [
    works,
    search,
    activeFilter,
  ]);

  function openWork(workId: string) {
    router.push({
      pathname: '/works/[id]',
      params: {
        id: workId,
      },
    });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text
          style={styles.loadingText}
        >
          Carregando obras...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.container
      }
      showsVerticalScrollIndicator={
        false
      }
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() =>
            loadWorks(true)
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
          style={styles.profileButton}
          onPress={() =>
            router.replace('/profile')
          }
        >
          <Text
            style={
              styles.profileButtonText
            }
          >
            Meu FIO
          </Text>
        </Pressable>
      </View>

      {/* TITULO + NOVA OBRA */}
      <View style={styles.titleRow}>
        <View
          style={styles.titleContent}
        >
          <Text style={styles.eyebrow}>
            OBRAS
          </Text>

          <Text style={styles.title}>
            Minhas Obras
          </Text>
        </View>

        <Pressable
          style={
            styles.newWorkButton
          }
          onPress={() =>
            router.push('/new-work')
          }
        >
          <Text
            style={
              styles.newWorkButtonText
            }
          >
            + Nova obra
          </Text>
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        Acompanhe o andamento das
        obras em que você participa.
      </Text>

      {/* BUSCA */}
      <TextInput
        style={styles.searchInput}
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar obra, cliente, código ou endereço"
        placeholderTextColor="#92989B"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {/* FILTROS */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={
          false
        }
        style={
          styles.filtersScroll
        }
        contentContainerStyle={
          styles.filtersContainer
        }
      >
        <FilterButton
          label="Total"
          count={counts.total}
          active={
            activeFilter === 'total'
          }
          onPress={() =>
            setActiveFilter('total')
          }
        />

        <FilterButton
          label="Em andamento"
          count={
            counts.em_andamento
          }
          active={
            activeFilter ===
            'em_andamento'
          }
          onPress={() =>
            setActiveFilter(
              'em_andamento'
            )
          }
        />

        <FilterButton
          label="Aguardando"
          count={counts.aguardando}
          active={
            activeFilter ===
            'aguardando'
          }
          onPress={() =>
            setActiveFilter(
              'aguardando'
            )
          }
        />

        <FilterButton
          label="Finalizadas"
          count={counts.finalizada}
          active={
            activeFilter ===
            'finalizada'
          }
          onPress={() =>
            setActiveFilter(
              'finalizada'
            )
          }
        />
      </ScrollView>

      {/* RESULTADO */}
      <View
        style={
          styles.resultsHeader
        }
      >
        <Text
          style={
            styles.resultsTitle
          }
        >
          {filteredWorks.length}{' '}
          {filteredWorks.length === 1
            ? 'obra'
            : 'obras'}
        </Text>
      </View>

      {!!message && (
        <View style={styles.errorCard}>
          <Text
            style={styles.errorText}
          >
            {message}
          </Text>
        </View>
      )}

      {!message &&
        filteredWorks.length === 0 && (
          <View
            style={styles.emptyCard}
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              {works.length === 0
                ? 'Nenhuma obra cadastrada'
                : 'Nenhuma obra encontrada'}
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              {works.length === 0
                ? 'Quando uma obra for criada, ela aparecerá aqui.'
                : 'Tente alterar a busca ou os filtros.'}
            </Text>
          </View>
        )}

      {/* CARDS */}
      {filteredWorks.map((work) => {
        const progress = Math.max(
          0,
          Math.min(
            work.progress ?? 0,
            100
          )
        );

        return (
          <Pressable
            key={work.id}
            style={styles.workCard}
            onPress={() =>
              openWork(work.id)
            }
          >
            <View
              style={
                styles.workCardTop
              }
            >
              {/* CAPA PROVISORIA */}
              <View
                style={
                  styles.coverPlaceholder
                }
              >
                <Text
                  style={
                    styles.coverInitial
                  }
                >
                  {work.client_name
                    .trim()
                    .charAt(0)
                    .toUpperCase() || 'F'}
                </Text>
              </View>

              <View
                style={
                  styles.workIdentity
                }
              >
                <Text
                  style={
                    styles.workCode
                  }
                >
                  {work.code}
                </Text>

                <Text
                  style={
                    styles.clientName
                  }
                  numberOfLines={2}
                >
                  {work.client_name}
                </Text>

                {!!work.project_order && (
                  <Text
                    style={
                      styles.projectOrder
                    }
                    numberOfLines={1}
                  >
                    {
                      work.project_order
                    }
                  </Text>
                )}
              </View>
            </View>

            <View
              style={
                styles.statusRow
              }
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
                      work.status
                    ]
                  }
                </Text>
              </View>

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
                styles.progressBackground
              }
            >
              <View
                style={[
                  styles.progressValue,
                  {
                    width:
                      `${progress}%` as `${number}%`,
                  },
                ]}
              />
            </View>

            <View
              style={
                styles.infoSection
              }
            >
              <Text
                style={
                  styles.infoLabel
                }
              >
                ENDEREÇO
              </Text>

              <Text
                style={
                  styles.infoValue
                }
                numberOfLines={2}
              >
                {work.address}
              </Text>
            </View>

            <View
              style={styles.cardDivider}
            />

            <View
              style={
                styles.cardFooter
              }
            >
              <View
                style={
                  styles.footerInfo
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  PRÓXIMA VISITA
                </Text>

                <Text
                  style={
                    styles.nextVisit
                  }
                >
                  {formatDate(
                    work.next_visit_at
                  )}
                </Text>
              </View>

              <Text
                style={
                  styles.openWorkText
                }
              >
                Abrir obra ›
              </Text>
            </View>

            <Text
              style={
                styles.updatedText
              }
            >
              {formatUpdatedAt(
                work.updated_at
              )}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type FilterButtonProps = {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
};

function FilterButton({
  label,
  count,
  active,
  onPress,
}: FilterButtonProps) {
  return (
    <Pressable
      style={[
        styles.filterButton,
        active &&
          styles.filterButtonActive,
      ]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterLabel,
          active &&
            styles.filterLabelActive,
        ]}
      >
        {label}
      </Text>

      <View
        style={[
          styles.filterCount,
          active &&
            styles.filterCountActive,
        ]}
      >
        <Text
          style={[
            styles.filterCountText,
            active &&
              styles.filterCountTextActive,
          ]}
        >
          {count}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },

  container: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 70,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F5',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#777D80',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
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

  profileButton: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  profileButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },

  titleContent: {
    flex: 1,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#E07A3A',
  },

  title: {
    marginTop: 5,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#2C343A',
  },

  newWorkButton: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#E07A3A',
  },

  newWorkButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 22,
    fontSize: 14,
    lineHeight: 20,
    color: '#737A7E',
  },

  searchInput: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DEE2DF',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 14,
    color: '#2C343A',
  },

  filtersScroll: {
    marginHorizontal: -20,
    marginTop: 14,
  },

  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 8,
  },

  filterButton: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },

  filterButtonActive: {
    borderColor: '#5F7567',
    backgroundColor: '#EEF1ED',
  },

  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#747B80',
  },

  filterLabelActive: {
    color: '#435649',
  },

  filterCount: {
    minWidth: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#F0F1EF',
  },

  filterCountActive: {
    backgroundColor: '#5F7567',
  },

  filterCountText: {
    paddingHorizontal: 5,
    fontSize: 10,
    fontWeight: '800',
    color: '#666D71',
  },

  filterCountTextActive: {
    color: '#FFFFFF',
  },

  resultsHeader: {
    marginTop: 22,
    marginBottom: 10,
  },

  resultsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#858B8F',
  },

  workCard: {
    marginBottom: 14,
    padding: 17,
    borderWidth: 1,
    borderColor: '#E4E7E4',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  workCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  coverPlaceholder: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#EEF1ED',
  },

  coverInitial: {
    fontSize: 20,
    fontWeight: '800',
    color: '#5F7567',
  },

  workIdentity: {
    flex: 1,
    marginLeft: 13,
  },

  workCode: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#5F7567',
  },

  clientName: {
    marginTop: 3,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: '#2C343A',
  },

  projectOrder: {
    marginTop: 3,
    fontSize: 12,
    color: '#7B8286',
  },

  statusRow: {
    marginTop: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF1ED',
  },

  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#506455',
  },

  progressText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#596269',
  },

  progressBackground: {
    height: 7,
    marginTop: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#E7E9E7',
  },

  progressValue: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#5F7567',
  },

  infoSection: {
    marginTop: 17,
  },

  infoLabel: {
    marginBottom: 3,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#979C9F',
  },

  infoValue: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#50595E',
  },

  cardDivider: {
    height: 1,
    marginVertical: 15,
    backgroundColor: '#ECEEEC',
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },

  footerInfo: {
    flex: 1,
  },

  nextVisit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  openWorkText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E07A3A',
  },

  updatedText: {
    marginTop: 13,
    fontSize: 10,
    color: '#9A9FA2',
  },

  emptyCard: {
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E7E4',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    color: '#2C343A',
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    color: '#7A8185',
  },

  errorCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFF2F0',
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },
});