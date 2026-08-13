import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpandableWorkSection } from '@/components/work-central/ExpandableWorkSection';
import { WorkPendingPanel } from '@/components/work-central/WorkPendingPanel';
import {
  Work,
  WorkEnvironment,
  WorkParticipant,
  WorkSectionKey,
} from '@/components/work-central/types';
import { WorkSidebar } from '@/components/work-central/WorkSidebar';
import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

const STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

const ENVIRONMENT_STATUS_LABELS: Record<
  WorkEnvironment['status'],
  string
> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

type PhotoReference = {
  environment_id: string | null;
  storage_path: string;
};

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function QuickAction({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.quickAction,
        active && styles.quickActionActive,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
    >
      <Ionicons
        name={icon}
        size={21}
        color={active ? '#FFFFFF' : '#4937D8'}
      />
      <Text
        style={[
          styles.quickActionText,
          active && styles.quickActionTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <View style={styles.placeholder}>
      <Ionicons
        name="construct-outline"
        size={20}
        color="#6C61CC"
      />
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

export default function WorkDetailsScreen() {
  const router = useRouter();
  const { id } =
    useLocalSearchParams<{ id: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [environments, setEnvironments] =
    useState<WorkEnvironment[]>([]);
  const [participants, setParticipants] =
    useState<WorkParticipant[]>([]);
  const [photoCounts, setPhotoCounts] =
    useState<Record<string, number>>({});
  const [coverUrl, setCoverUrl] =
    useState<string | null>(null);
  const [openSection, setOpenSection] =
    useState<WorkSectionKey | null>(null);
  const [openEnvironmentId, setOpenEnvironmentId] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingCount, setPendingCount] = useState(0);

  const {
    canManage,
    canWrite,
    isViewer,
    loadingAccess,
  } = useWorkAccess(id);

  const loadCentral = useCallback(
    async (isRefresh = false) => {
      if (!id) {
        setMessage('Obra não encontrada.');
        setLoading(false);
        return;
      }

      isRefresh ? setRefreshing(true) : setLoading(true);
      setMessage('');

      try {
        const [workResult, environmentResult, peopleResult, photoResult] =
          await Promise.all([
            supabase
              .from('works')
              .select(`
                id, code, client_name, client_phone, address,
                project_order, status, progress, next_visit_at,
                notes, updated_at
              `)
              .eq('id', id)
              .maybeSingle(),
            supabase
              .from('environments')
              .select(`
                id, work_id, name, status, progress,
                responsible_user_id, installation_priority,
                preparation_min_photos, active, created_at
              `)
              .eq('work_id', id)
              .eq('active', true)
              .order('installation_priority', { ascending: false })
              .order('created_at', { ascending: true }),
            supabase.rpc('get_work_participants', {
              p_work_id: id,
            }),
            supabase
              .from('work_photos')
              .select('environment_id, storage_path')
              .eq('work_id', id)
              .order('created_at', { ascending: false }),
          ]);

        if (workResult.error) throw workResult.error;
        if (!workResult.data) {
          throw new Error(
            'Você não possui acesso a esta obra.'
          );
        }
        if (environmentResult.error) throw environmentResult.error;
        if (peopleResult.error) throw peopleResult.error;

        setWork(workResult.data as Work);
        setEnvironments(
          (environmentResult.data ?? []) as WorkEnvironment[]
        );
        setParticipants(
          (peopleResult.data ?? []) as WorkParticipant[]
        );

        if (photoResult.error) {
          setPhotoCounts({});
          setCoverUrl(null);
        } else {
          const photos =
            (photoResult.data ?? []) as PhotoReference[];
          const counts: Record<string, number> = {};

          for (const photo of photos) {
            const key = photo.environment_id ?? 'general';
            counts[key] = (counts[key] ?? 0) + 1;
          }
          setPhotoCounts(counts);

          const cover = photos.find(
            (photo) => !photo.environment_id
          );
          if (!cover) {
            setCoverUrl(null);
          } else {
            const { data } = await supabase.storage
              .from('work-photos')
              .createSignedUrl(cover.storage_path, 60 * 60);
            setCoverUrl(data?.signedUrl ?? null);
          }
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar a central da obra.'
        );
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      loadCentral();
    }, [loadCentral])
  );

  const names = useMemo(
    () =>
      Object.fromEntries(
        participants.map((participant) => [
          participant.user_id,
          participant.full_name,
        ])
      ),
    [participants]
  );
  const responsible =
    participants.find((person) => person.access_level === 'owner') ??
    participants.find((person) => person.access_level === 'manager');
  const totalPhotos = Object.values(photoCounts).reduce(
    (total, count) => total + count,
    0
  );

  function toggle(section: WorkSectionKey) {
    setOpenSection((current) =>
      current === section ? null : section
    );
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#4937D8" />
        <Text style={styles.loadingText}>
          Carregando central da obra...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <WorkSidebar />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadCentral(true)}
              tintColor="#4937D8"
            />
          }
        >
          <Pressable
            style={styles.backButton}
            onPress={() => router.replace('/works')}
          >
            <Ionicons
              name="chevron-back-outline"
              size={20}
              color="#4937D8"
            />
            <Text style={styles.backText}>Minhas obras</Text>
          </Pressable>

          <Text style={styles.pageTitle}>Obra</Text>
          <Text style={styles.pageSubtitle}>
            Central operacional da obra
          </Text>

          {!!message && !work && (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{message}</Text>
            </View>
          )}

          {work && (
            <>
              <View style={styles.workCard}>
                <View style={styles.identityRow}>
                  {coverUrl ? (
                    <Image
                      source={{ uri: coverUrl }}
                      style={styles.cover}
                    />
                  ) : (
                    <View style={styles.coverPlaceholder}>
                      <Text style={styles.coverInitials}>
                        {initials(work.client_name)}
                      </Text>
                    </View>
                  )}

                  <View style={styles.workIdentity}>
                    <Text style={styles.workCode}>{work.code}</Text>
                    <Text style={styles.workTitle}>
                      {work.client_name}
                    </Text>
                    <View style={styles.infoLine}>
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color="#5A6680"
                      />
                      <Text style={styles.infoText}>
                        Responsável: {responsible?.full_name ?? 'Não definido'}
                      </Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color="#5A6680"
                      />
                      <Text style={styles.infoText}>{work.address}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.statusRow}>
                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>
                      {STATUS_LABELS[work.status] ?? work.status}
                    </Text>
                  </View>
                  <Text style={styles.progressText}>
                    {work.progress}% concluída
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(
                          0,
                          Math.min(work.progress, 100)
                        )}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>

                <View style={styles.teamRow}>
                  <View>
                    <Text style={styles.teamTitle}>Equipe da obra</Text>
                    <View style={styles.avatars}>
                      {participants.slice(0, 5).map((person) => (
                        <View
                          key={person.participant_id}
                          style={styles.avatar}
                        >
                          {person.avatar_url ? (
                            <Image
                              source={{ uri: person.avatar_url }}
                              style={styles.avatarImage}
                            />
                          ) : (
                            <Text style={styles.avatarText}>
                              {initials(person.full_name)}
                            </Text>
                          )}
                        </View>
                      ))}
                      <Pressable
                        style={styles.addTeam}
                        onPress={() =>
                          router.push({
                            pathname: '/work-participants',
                            params: { workId: work.id },
                          })
                        }
                      >
                        <Ionicons
                          name="add-outline"
                          size={21}
                          color="#4937D8"
                        />
                      </Pressable>
                    </View>
                  </View>
                  <Text style={styles.teamCount}>
                    {participants.length} pessoas
                  </Text>
                </View>

                {isViewer && (
                  <View style={styles.readOnly}>
                    <Ionicons
                      name="eye-outline"
                      size={18}
                      color="#5B657B"
                    />
                    <Text style={styles.readOnlyText}>
                      Acesso somente para visualização
                    </Text>
                  </View>
                )}

                <View style={styles.quickActions}>
                  <QuickAction
                    icon="chatbubble-ellipses-outline"
                    label="FIO"
                    active={openSection === 'fio'}
                    onPress={() => toggle('fio')}
                  />
                  <QuickAction
                    icon="images-outline"
                    label="Galeria"
                    active={openSection === 'photos'}
                    onPress={() => toggle('photos')}
                  />
                  <QuickAction
                    icon="add-outline"
                    label="Mais"
                    active={openSection === 'more'}
                    onPress={() => toggle('more')}
                  />
                </View>
              </View>

              <View style={styles.sections}>
                <ExpandableWorkSection
                  title="Ambientes"
                  subtitle="Andamento e preparação por ambiente"
                  icon="grid-outline"
                  badge={String(environments.length)}
                  open={openSection === 'environments'}
                  onPress={() => toggle('environments')}
                >
                  {environments.length === 0 ? (
                    <Placeholder text="Nenhum ambiente cadastrado." />
                  ) : (
                    environments.map((environment) => {
                      const count = photoCounts[environment.id] ?? 0;
                      const minimum =
                        environment.preparation_min_photos ?? 0;
                      const missing = Math.max(minimum - count, 0);
                      const expanded =
                        openEnvironmentId === environment.id;

                      return (
                        <View
                          key={environment.id}
                          style={styles.environmentCard}
                        >
                          <Pressable
                            style={styles.environmentHeader}
                            onPress={() =>
                              setOpenEnvironmentId(
                                expanded ? null : environment.id
                              )
                            }
                          >
                            <View style={styles.environmentIdentity}>
                              <Text style={styles.environmentName}>
                                {environment.name}
                              </Text>
                              <Text style={styles.environmentMeta}>
                                {ENVIRONMENT_STATUS_LABELS[environment.status]}
                                {' · '}
                                {environment.progress}%
                              </Text>
                            </View>
                            {environment.installation_priority && (
                              <View style={styles.priorityBadge}>
                                <Text style={styles.priorityText}>
                                  Primeiro
                                </Text>
                              </View>
                            )}
                            <Ionicons
                              name={
                                expanded
                                  ? 'chevron-up-outline'
                                  : 'chevron-down-outline'
                              }
                              size={20}
                              color="#34405A"
                            />
                          </Pressable>
                          <View style={styles.environmentTrack}>
                            <View
                              style={[
                                styles.environmentFill,
                                {
                                  width: `${Math.max(
                                    0,
                                    Math.min(environment.progress, 100)
                                  )}%` as `${number}%`,
                                },
                              ]}
                            />
                          </View>

                          {expanded && (
                            <View style={styles.environmentBody}>
                              <Text style={styles.environmentDetail}>
                                Responsável:{' '}
                                {environment.responsible_user_id
                                  ? names[environment.responsible_user_id] ??
                                    'Responsável'
                                  : 'Não definido'}
                              </Text>
                              <Text style={styles.environmentDetail}>
                                Preparação:{' '}
                                {minimum === 0
                                  ? `${count} fotos · mínimo não definido`
                                  : missing === 0
                                  ? `${count}/${minimum} fotos · completa`
                                  : `${count}/${minimum} fotos · faltam ${missing}`}
                              </Text>
                              <View style={styles.environmentActions}>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() =>
                                    router.push({
                                      pathname: '/environment/[id]',
                                      params: { id: environment.id },
                                    })
                                  }
                                >
                                  <Text style={styles.secondaryText}>
                                    Abrir ambiente
                                  </Text>
                                </Pressable>
                                <Pressable
                                  style={styles.secondaryButton}
                                  onPress={() =>
                                    router.push({
                                      pathname: '/environment-photos',
                                      params: { id: environment.id },
                                    })
                                  }
                                >
                                  <Ionicons
                                    name="camera-outline"
                                    size={17}
                                    color="#4937D8"
                                  />
                                  <Text style={styles.secondaryText}>
                                    Fotos
                                  </Text>
                                </Pressable>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })
                  )}
                  {canWrite && (
                    <Pressable
                      style={styles.primaryButton}
                      onPress={() =>
                        router.push({
                          pathname: '/new-environment',
                          params: { workId: work.id },
                        })
                      }
                    >
                      <Ionicons
                        name="add-outline"
                        size={20}
                        color="#FFFFFF"
                      />
                      <Text style={styles.primaryText}>Novo ambiente</Text>
                    </Pressable>
                  )}
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Pendências"
                  subtitle="Itens gerais ou vinculados a ambientes"
                  icon="alert-circle-outline"
                  badge={pendingCount ? String(pendingCount) : undefined}
                  open={openSection === 'pending'}
                  onPress={() => toggle('pending')}
                >
                  <WorkPendingPanel
                    workId={work.id}
                    environments={environments}
                    participants={participants}
                    canWrite={canWrite}
                    onOpenCountChange={setPendingCount}
                  />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="FIO / Diário"
                  subtitle="Atualizações e histórico cronológico"
                  icon="chatbubble-ellipses-outline"
                  open={openSection === 'fio'}
                  onPress={() => toggle('fio')}
                >
                  <Placeholder text="Espaço preparado para o checkpoint do Diário/FIO." />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Fotos da obra"
                  subtitle="Galeria geral e separada por ambientes"
                  icon="images-outline"
                  badge={String(totalPhotos)}
                  open={openSection === 'photos'}
                  onPress={() => toggle('photos')}
                >
                  <Placeholder text="Espaço preparado para galeria completa e câmera direta." />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Peças / Avanço"
                  subtitle="Acompanhamento operacional por ambiente"
                  icon="stats-chart-outline"
                  open={openSection === 'progress'}
                  onPress={() => toggle('progress')}
                >
                  <Pressable
                    style={styles.secondaryWide}
                    onPress={() =>
                      router.push({
                        pathname: '/environments',
                        params: { workId: work.id },
                      })
                    }
                  >
                    <Text style={styles.secondaryText}>
                      Abrir gestão completa dos ambientes
                    </Text>
                  </Pressable>
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Medição"
                  subtitle="Medições vinculadas à obra"
                  icon="resize-outline"
                  open={openSection === 'measurements'}
                  onPress={() => toggle('measurements')}
                >
                  <Placeholder text="Área reservada para o fluxo de medição." />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Documentos"
                  subtitle="Arquivos da obra e dos ambientes"
                  icon="document-text-outline"
                  open={openSection === 'documents'}
                  onPress={() => toggle('documents')}
                >
                  <Placeholder text="Área reservada para a implementação de amanhã." />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Mais ações"
                  subtitle="Ações complementares da obra"
                  icon="add-outline"
                  open={openSection === 'more'}
                  onPress={() => toggle('more')}
                >
                  <View style={styles.moreGrid}>
                    <Pressable
                      style={styles.moreButton}
                      onPress={() =>
                        router.push({
                          pathname: '/work-participants',
                          params: { workId: work.id },
                        })
                      }
                    >
                      <Ionicons
                        name="people-outline"
                        size={22}
                        color="#4937D8"
                      />
                      <Text style={styles.moreText}>Equipe</Text>
                    </Pressable>
                    <Pressable
                      style={styles.moreButton}
                      onPress={() =>
                        router.push({
                          pathname: '/new-environment',
                          params: { workId: work.id },
                        })
                      }
                      disabled={!canWrite}
                    >
                      <Ionicons
                        name="grid-outline"
                        size={22}
                        color="#4937D8"
                      />
                      <Text style={styles.moreText}>Novo ambiente</Text>
                    </Pressable>
                    <View style={styles.moreDisabled}>
                      <Ionicons
                        name="calendar-outline"
                        size={22}
                        color="#9198A7"
                      />
                      <Text style={styles.moreDisabledText}>
                        Visita em breve
                      </Text>
                    </View>
                    <View style={styles.moreDisabled}>
                      <Ionicons
                        name="document-outline"
                        size={22}
                        color="#9198A7"
                      />
                      <Text style={styles.moreDisabledText}>
                        Documentos amanhã
                      </Text>
                    </View>
                  </View>
                </ExpandableWorkSection>

                {!!message && (
                  <View style={styles.errorCard}>
                    <Text style={styles.errorText}>{message}</Text>
                  </View>
                )}
                <Text style={styles.permissionNote}>
                  {canManage
                    ? 'Você administra esta obra.'
                    : canWrite
                    ? 'Você pode registrar informações nesta obra.'
                    : 'Você pode consultar esta obra.'}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7FA' },
  page: { flex: 1, flexDirection: 'row', backgroundColor: '#F6F7FA' },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 70,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F6F7FA',
  },
  loadingText: { fontSize: 13, color: '#697386' },
  backButton: {
    minHeight: 44,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: { fontSize: 14, fontWeight: '700', color: '#4937D8' },
  pageTitle: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '900',
    color: '#10192B',
  },
  pageSubtitle: {
    marginTop: 2,
    marginBottom: 18,
    fontSize: 14,
    color: '#64708A',
  },
  workCard: {
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE1EA',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  cover: { width: 92, height: 92, borderRadius: 20 },
  coverPlaceholder: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#EFEDFF',
  },
  coverInitials: { fontSize: 27, fontWeight: '900', color: '#4937D8' },
  workIdentity: { flex: 1, minWidth: 0 },
  workCode: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: '#4937D8',
  },
  workTitle: {
    marginTop: 3,
    marginBottom: 7,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    color: '#10192B',
  },
  infoLine: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, color: '#5A6680' },
  statusRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#EEF8F1',
  },
  statusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#2EA35E' },
  statusText: { fontSize: 11, fontWeight: '800', color: '#267A48' },
  progressText: { fontSize: 12, fontWeight: '800', color: '#47536A' },
  progressTrack: {
    height: 8,
    marginTop: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E6E8EE',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#4937D8' },
  teamRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  teamTitle: { marginBottom: 8, fontSize: 12, fontWeight: '800', color: '#34405A' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 38,
    height: 38,
    marginRight: -5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    backgroundColor: '#DCD9FA',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 10, fontWeight: '900', color: '#4937D8' },
  addTeam: {
    width: 38,
    height: 38,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBC5F3',
    borderRadius: 999,
  },
  teamCount: { fontSize: 10, color: '#768096' },
  readOnly: {
    marginTop: 16,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#F0F2F6',
  },
  readOnlyText: { flex: 1, fontSize: 11, color: '#5B657B' },
  quickActions: { marginTop: 20, flexDirection: 'row', gap: 8 },
  quickAction: {
    minHeight: 50,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D6D2F6',
    borderRadius: 14,
  },
  quickActionActive: { borderColor: '#4937D8', backgroundColor: '#4937D8' },
  quickActionText: { fontSize: 12, fontWeight: '800', color: '#4937D8' },
  quickActionTextActive: { color: '#FFFFFF' },
  sections: { marginTop: 16 },
  placeholder: {
    minHeight: 64,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    backgroundColor: '#F4F3FC',
  },
  placeholderText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#5F5A83' },
  environmentCard: {
    marginTop: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E1E4EA',
    borderRadius: 15,
    backgroundColor: '#FAFBFC',
  },
  environmentHeader: {
    minHeight: 58,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  environmentIdentity: { flex: 1 },
  environmentName: { fontSize: 14, fontWeight: '800', color: '#202B3D' },
  environmentMeta: { marginTop: 3, fontSize: 11, color: '#737D91' },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, backgroundColor: '#FFF0E6' },
  priorityText: { fontSize: 9, fontWeight: '800', color: '#B85C24' },
  environmentTrack: {
    height: 5,
    marginHorizontal: 13,
    marginBottom: 10,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E4E7EC',
  },
  environmentFill: { height: '100%', borderRadius: 999, backgroundColor: '#6151E0' },
  environmentBody: { padding: 13, paddingTop: 3, borderTopWidth: 1, borderTopColor: '#E8EAEE' },
  environmentDetail: { marginTop: 8, fontSize: 12, lineHeight: 17, color: '#5D687C' },
  environmentActions: { marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 13,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CDC8F2',
    borderRadius: 12,
  },
  secondaryWide: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CDC8F2',
    borderRadius: 12,
  },
  secondaryText: { fontSize: 11, fontWeight: '800', color: '#4937D8' },
  primaryButton: {
    minHeight: 48,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 13,
    backgroundColor: '#4937D8',
  },
  primaryText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  moreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  moreButton: {
    minHeight: 76,
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#D9D5F5',
    borderRadius: 13,
  },
  moreDisabled: {
    minHeight: 76,
    flexGrow: 1,
    flexBasis: '46%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 13,
    backgroundColor: '#F1F2F5',
  },
  moreText: { fontSize: 11, fontWeight: '800', color: '#4937D8' },
  moreDisabledText: { fontSize: 11, fontWeight: '700', color: '#9198A7' },
  errorCard: { marginTop: 12, padding: 14, borderRadius: 13, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 12, lineHeight: 18, color: '#B42318' },
  permissionNote: { marginTop: 5, textAlign: 'center', fontSize: 10, color: '#8991A0' },
  pressed: { opacity: 0.65 },
});
