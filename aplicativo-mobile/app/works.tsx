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

type Work = {
  id: string;
  code: string;
  client_name: string;
  address: string;
  project_order: string | null;
  status: string;
  progress: number;
  next_visit_at: string | null;
  updated_at: string;
};

type WorkFilter =
  | 'total'
  | 'em_andamento'
  | 'aguardando'
  | 'finalizadas';

const STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

function formatDate(date: string | null) {
  if (!date) {
    return null;
  }

  return new Date(date).toLocaleDateString('pt-BR');
}

function formatUpdatedAt(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();

  const differenceMs = now.getTime() - date.getTime();
  const differenceMinutes = Math.floor(
    differenceMs / (1000 * 60)
  );

  if (differenceMinutes < 1) {
    return 'Atualizada agora';
  }

  if (differenceMinutes < 60) {
    return `Atualizada há ${differenceMinutes} min`;
  }

  const differenceHours = Math.floor(
    differenceMinutes / 60
  );

  if (differenceHours < 24) {
    return differenceHours === 1
      ? 'Atualizada há 1 hora'
      : `Atualizada há ${differenceHours} horas`;
  }

  const differenceDays = Math.floor(
    differenceHours / 24
  );

  if (differenceDays === 1) {
    return 'Atualizada ontem';
  }

  if (differenceDays <= 7) {
    return `Atualizada há ${differenceDays} dias`;
  }

  return `Atualizada em ${date.toLocaleDateString(
    'pt-BR'
  )}`;
}

export default function WorksScreen() {
  const router = useRouter();

  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const [query, setQuery] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<WorkFilter>('total');

  async function loadWorks(showLoading = true) {
    if (showLoading) {
      setLoading(true);
    }

    setMessage('');

    const { data, error } = await supabase
      .from('works')
      .select(`
        id,
        code,
        client_name,
        address,
        project_order,
        status,
        progress,
        next_visit_at,
        updated_at
      `)
      .is('archived_at', null)
      .order('updated_at', {
        ascending: false,
      });

    if (error) {
      setWorks([]);
      setMessage(error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setWorks(data ?? []);
    setLoading(false);
    setRefreshing(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadWorks();
    }, [])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadWorks(false);
  }

  const totalWorks = works.length;

  const inProgressWorks = works.filter(
    (work) => work.status === 'em_andamento'
  ).length;

  const waitingWorks = works.filter(
    (work) =>
      work.status === 'aguardando_peca' ||
      work.status === 'aguardando_cliente'
  ).length;

  const finishedWorks = works.filter(
    (work) => work.status === 'finalizada'
  ).length;

  const filteredWorks = useMemo(() => {
    const normalizedQuery = query
      .trim()
      .toLowerCase();

    return works.filter((work) => {
      const matchesFilter =
        selectedFilter === 'total' ||
        (selectedFilter === 'em_andamento' &&
          work.status === 'em_andamento') ||
        (selectedFilter === 'aguardando' &&
          (work.status === 'aguardando_peca' ||
            work.status ===
              'aguardando_cliente')) ||
        (selectedFilter === 'finalizadas' &&
          work.status === 'finalizada');

      if (!matchesFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        work.code,
        work.client_name,
        work.address,
        work.project_order ?? '',
        STATUS_LABELS[work.status] ??
          work.status,
      ]
        .join(' ')
        .toLowerCase();

      return searchableText.includes(
        normalizedQuery
      );
    });
  }, [works, query, selectedFilter]);

  function openWork(workId: string) {
    router.push({
      pathname: '/works/[id]',
      params: {
        id: workId,
      },
    });
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      }
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>FIO</Text>

          <Text style={styles.brandSubtitle}>
            GESTÃO DE OBRAS
          </Text>
        </View>

        <Pressable
          style={styles.profileButton}
          onPress={() =>
            router.replace('/profile')
          }
        >
          <Text style={styles.profileButtonText}>
            Meu FIO
          </Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>
          Minhas obras
        </Text>

        <Text style={styles.subtitle}>
          Acompanhe o andamento das obras às
          quais você possui acesso.
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingArea}>
          <ActivityIndicator />

          <Text style={styles.loadingText}>
            Carregando obras...
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.searchArea}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar cliente, código, projeto ou endereço"
              placeholderTextColor="#8A9094"
              autoCorrect={false}
              returnKeyType="search"
            />
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={
              false
            }
            contentContainerStyle={
              styles.filters
            }
          >
            <FilterButton
              label="Total"
              count={totalWorks}
              selected={
                selectedFilter === 'total'
              }
              onPress={() =>
                setSelectedFilter('total')
              }
            />

            <FilterButton
              label="Em andamento"
              count={inProgressWorks}
              selected={
                selectedFilter ===
                'em_andamento'
              }
              onPress={() =>
                setSelectedFilter(
                  'em_andamento'
                )
              }
            />

            <FilterButton
              label="Aguardando"
              count={waitingWorks}
              selected={
                selectedFilter ===
                'aguardando'
              }
              onPress={() =>
                setSelectedFilter(
                  'aguardando'
                )
              }
            />

            <FilterButton
              label="Finalizadas"
              count={finishedWorks}
              selected={
                selectedFilter ===
                'finalizadas'
              }
              onPress={() =>
                setSelectedFilter(
                  'finalizadas'
                )
              }
            />
          </ScrollView>

          {!!message && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {message}
              </Text>
            </View>
          )}

          {works.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                Nenhuma obra por enquanto
              </Text>

              <Text style={styles.emptyText}>
                Quando uma obra for criada ou
                compartilhada com você, ela
                aparecerá aqui.
              </Text>
            </View>
          ) : filteredWorks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                Nenhuma obra encontrada
              </Text>

              <Text style={styles.emptyText}>
                Tente alterar a busca ou selecionar
                outro filtro.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.listHeader}>
                <Text style={styles.sectionTitle}>
                  Obras
                </Text>

                <Text style={styles.resultCount}>
                  {filteredWorks.length}{' '}
                  {filteredWorks.length === 1
                    ? 'obra'
                    : 'obras'}
                </Text>
              </View>

              <View style={styles.list}>
                {filteredWorks.map((work) => {
                  const safeProgress = Math.max(
                    0,
                    Math.min(
                      work.progress,
                      100
                    )
                  );

                  return (
                    <Pressable
                      key={work.id}
                      onPress={() =>
                        openWork(work.id)
                      }
                      style={({ pressed }) => [
                        styles.card,
                        pressed &&
                          styles.cardPressed,
                      ]}
                    >
                      <View style={styles.cardTop}>
                        <View
                          style={
                            styles.cardIdentity
                          }
                        >
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
                                .toUpperCase() ||
                                'F'}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.cardMain
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
                            styles.statusBadge
                          }
                        >
                          <Text
                            style={
                              styles.statusText
                            }
                          >
                            {STATUS_LABELS[
                              work.status
                            ] ?? work.status}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={styles.address}
                        numberOfLines={2}
                      >
                        {work.address}
                      </Text>

                      <View
                        style={
                          styles.progressHeader
                        }
                      >
                        <Text
                          style={
                            styles.progressLabel
                          }
                        >
                          Progresso
                        </Text>

                        <Text
                          style={
                            styles.progressPercent
                          }
                        >
                          {safeProgress}%
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
                                `${safeProgress}%` as `${number}%`,
                            },
                          ]}
                        />
                      </View>

                      <View
                        style={
                          styles.cardDetails
                        }
                      >
                        <View
                          style={
                            styles.detailItem
                          }
                        >
                          <Text
                            style={
                              styles.detailLabel
                            }
                          >
                            PRÓXIMA VISITA
                          </Text>

                          <Text
                            style={
                              styles.detailValue
                            }
                          >
                            {formatDate(
                              work.next_visit_at
                            ) ??
                              'Não definida'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.detailItem,
                            styles.detailItemRight,
                          ]}
                        >
                          <Text
                            style={
                              styles.detailLabel
                            }
                          >
                            MOVIMENTAÇÃO
                          </Text>

                          <Text
                            style={
                              styles.detailValue
                            }
                          >
                            {formatUpdatedAt(
                              work.updated_at
                            )}
                          </Text>
                        </View>
                      </View>

                      <View
                        style={
                          styles.openHint
                        }
                      >
                        <Text
                          style={
                            styles.openHintText
                          }
                        >
                          Abrir obra
                        </Text>

                        <Text
                          style={
                            styles.openArrow
                          }
                        >
                          ›
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

type FilterButtonProps = {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
};

function FilterButton({
  label,
  count,
  selected,
  onPress,
}: FilterButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterButton,
        selected &&
          styles.filterButtonSelected,
      ]}
    >
      <Text
        style={[
          styles.filterCount,
          selected &&
            styles.filterTextSelected,
        ]}
      >
        {count}
      </Text>

      <Text
        style={[
          styles.filterLabel,
          selected &&
            styles.filterTextSelected,
        ]}
      >
        {label}
      </Text>
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
    paddingBottom: 60,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
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

  header: {
    marginBottom: 22,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2C343A',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#687177',
  },

  loadingArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#777D80',
  },

  searchArea: {
    marginBottom: 16,
  },

  searchInput: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#2C343A',
  },

  filters: {
    gap: 9,
    paddingBottom: 26,
  },

  filterButton: {
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E1E4E1',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  filterButtonSelected: {
    borderColor: '#2C343A',
    backgroundColor: '#2C343A',
  },

  filterCount: {
    fontSize: 19,
    fontWeight: '800',
    color: '#2C343A',
  },

  filterLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
    color: '#687177',
  },

  filterTextSelected: {
    color: '#FFFFFF',
  },

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C343A',
  },

  resultCount: {
    fontSize: 12,
    color: '#8A9094',
  },

  list: {
    gap: 14,
  },

  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  cardPressed: {
    opacity: 0.82,
  },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  cardIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 10,
  },

  coverPlaceholder: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderRadius: 14,
    backgroundColor: '#EEF1ED',
  },

  coverInitial: {
    fontSize: 22,
    fontWeight: '800',
    color: '#5F7567',
  },

  cardMain: {
    flex: 1,
  },

  workCode: {
    marginBottom: 3,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#5F7567',
  },

  clientName: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: '#2C343A',
  },

  projectOrder: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
    color: '#777D80',
  },

  statusBadge: {
    maxWidth: 108,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF1ED',
  },

  statusText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center',
    color: '#5F7567',
  },

  address: {
    marginTop: 17,
    fontSize: 13,
    lineHeight: 18,
    color: '#777D80',
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    marginBottom: 8,
  },

  progressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#596269',
  },

  progressPercent: {
    fontSize: 12,
    fontWeight: '800',
    color: '#596269',
  },

  progressBackground: {
    height: 8,
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#E5E7E4',
  },

  progressValue: {
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#5F7567',
  },

  cardDetails: {
    flexDirection: 'row',
    marginTop: 18,
  },

  detailItem: {
    flex: 1,
    paddingRight: 8,
  },

  detailItemRight: {
    paddingLeft: 8,
    paddingRight: 0,
  },

  detailLabel: {
    marginBottom: 4,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    color: '#8A9094',
  },

  detailValue: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    color: '#2C343A',
  },

  openHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 18,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#ECEEEC',
  },

  openHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F7567',
  },

  openArrow: {
    marginLeft: 6,
    fontSize: 20,
    lineHeight: 20,
    color: '#5F7567',
  },

  emptyCard: {
    padding: 24,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#2C343A',
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: '#777D80',
  },

  errorCard: {
    marginBottom: 20,
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