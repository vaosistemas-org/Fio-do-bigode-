import { Ionicons } from '@expo/vector-icons';
import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExpandableWorkSection } from '@/components/work-central/ExpandableWorkSection';
import { WorkDocumentsPanel } from '@/components/work-central/WorkDocumentsPanel';
import { WorkPendingPanel } from '@/components/work-central/WorkPendingPanel';
import { WorkPhotosPanel } from '@/components/work-central/WorkPhotosPanel';
import { WorkTimelinePanel } from '@/components/work-central/WorkTimelinePanel';
import {
  Work,
  WorkEnvironment,
  WorkParticipant,
  WorkSectionKey,
} from '@/components/work-central/types';
import { FioColors } from '@/constants/fio-theme';
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

function Placeholder({ text }: { text: string }) {
  return (
    <View style={styles.placeholder}>
      <Ionicons
        name="construct-outline"
        size={20}
        color={FioColors.green}
      />
      <Text style={styles.placeholderText}>{text}</Text>
    </View>
  );
}

export default function WorkDetailsScreen() {
  const router = useRouter();
  const { id, section } = useLocalSearchParams<{
    id: string;
    section?: string;
  }>();
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
  const [galleryCount, setGalleryCount] = useState(0);
  const [cameraRequest, setCameraRequest] = useState(0);
  const [pendingCreateRequest, setPendingCreateRequest] = useState(0);
  const [timelineCreateRequest, setTimelineCreateRequest] = useState(0);
  const [documentCreateRequest, setDocumentCreateRequest] = useState(0);
  const [documentCount, setDocumentCount] = useState(0);
  const [measurementCount, setMeasurementCount] = useState(0);
  const [actionMenuVisible, setActionMenuVisible] = useState(false);

  const {
    canManage,
    canWrite,
    isViewer,
    userId,
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
              .eq('collection', 'work')
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
          setGalleryCount(0);
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
          setGalleryCount(photos.length);

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

  useEffect(() => {
    if (
      section === 'environments' ||
      section === 'pending' ||
      section === 'fio' ||
      section === 'photos' ||
      section === 'measurements' ||
      section === 'documents'
    ) {
      setOpenSection(section);
    }
  }, [section]);

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
  const totalPhotos = galleryCount;

  function toggle(section: WorkSectionKey) {
    setOpenSection((current) =>
      current === section ? null : section
    );
  }

  function runAction(action: () => void) {
    setActionMenuVisible(false);
    action();
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.loadingText}>
          Carregando central da obra...
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.page}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadCentral(true)}
              tintColor={FioColors.gold}
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
              color={FioColors.green}
            />
            <Text style={styles.backText}>Central de obras</Text>
          </Pressable>

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
                    <Text numberOfLines={1} style={styles.workCode}>{work.code}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Abrir perfil do cliente"
                      style={styles.clientProfileLink}
                      onPress={() =>
                        router.push({
                          pathname: '/client-profile',
                          params: { workId: work.id },
                        })
                      }
                    >
                      <Text numberOfLines={2} style={styles.workTitle}>
                        {work.client_name}
                      </Text>
                      <Ionicons
                        name="person-circle-outline"
                        size={17}
                        color={FioColors.gold}
                      />
                    </Pressable>
                    <View style={styles.infoLine}>
                      <Ionicons
                        name="person-outline"
                        size={16}
                        color="#5A6680"
                      />
                      <Text numberOfLines={2} style={styles.infoText}>
                        Responsável: {responsible?.full_name ?? 'Não definido'}
                      </Text>
                    </View>
                    <View style={styles.infoLine}>
                      <Ionicons
                        name="location-outline"
                        size={17}
                        color="#5A6680"
                      />
                      <Text numberOfLines={2} style={styles.infoText}>{work.address}</Text>
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
                  <View style={styles.teamIdentity}>
                    <View style={styles.teamHeading}>
                      <Text style={styles.teamTitle}>Equipe</Text>
                      <Text style={styles.teamCount}>
                        {participants.length} pessoas
                      </Text>
                    </View>
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
                          color={FioColors.green}
                        />
                      </Pressable>
                    </View>
                  </View>
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
                              <Text style={styles.environmentCentralNote}>
                                Fotos e pendências deste ambiente ficam nos
                                blocos da própria Central da obra.
                              </Text>
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
                    canManage={canManage}
                    userId={userId}
                    newRequest={pendingCreateRequest}
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
                  <WorkTimelinePanel
                    workId={work.id}
                    environments={environments}
                    canWrite={canWrite}
                    canManage={canManage}
                    newEntryRequest={timelineCreateRequest}
                    onChanged={() => loadCentral(true)}
                  />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Galeria"
                  subtitle="Galeria geral e separada por ambientes"
                  icon="images-outline"
                  badge={String(totalPhotos)}
                  open={openSection === 'photos'}
                  onPress={() => toggle('photos')}
                >
                  <WorkPhotosPanel
                    workId={work.id}
                    environments={environments}
                    canWrite={canWrite}
                    canManage={canManage}
                    userId={userId}
                    cameraRequest={cameraRequest}
                    onCameraRequestHandled={() =>
                      setCameraRequest(0)
                    }
                    onCountChange={setGalleryCount}
                    onChanged={() => loadCentral(true)}
                  />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Medições"
                  subtitle="Documentos e registros de medidas"
                  icon="resize-outline"
                  badge={measurementCount ? String(measurementCount) : undefined}
                  open={openSection === 'measurements'}
                  onPress={() => toggle('measurements')}
                >
                  <WorkDocumentsPanel
                    workId={work.id}
                    environments={environments}
                    canWrite={canWrite}
                    categoryFilter="measurement"
                    onCountChange={setMeasurementCount}
                    onChanged={() => loadCentral(true)}
                  />
                </ExpandableWorkSection>

                <ExpandableWorkSection
                  title="Documentos"
                  subtitle="Arquivos da obra e dos ambientes"
                  icon="document-text-outline"
                  badge={documentCount ? String(documentCount) : undefined}
                  open={openSection === 'documents'}
                  onPress={() => toggle('documents')}
                >
                  <WorkDocumentsPanel
                    workId={work.id}
                    environments={environments}
                    canWrite={canWrite}
                    newRequest={documentCreateRequest}
                    excludeCategory="measurement"
                    onCountChange={setDocumentCount}
                    onChanged={() => loadCentral(true)}
                  />
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

        {work && canWrite && (
          <Pressable
            accessibilityLabel="Abrir ações da obra"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.floatingAction,
              pressed && styles.pressed,
            ]}
            onPress={() => setActionMenuVisible(true)}
          >
            <Ionicons name="add-outline" size={30} color="#FFFFFF" />
          </Pressable>
        )}

        {work && (
          <Modal
            visible={actionMenuVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setActionMenuVisible(false)}
          >
            <Pressable
              style={styles.actionBackdrop}
              onPress={() => setActionMenuVisible(false)}
            >
              <Pressable style={styles.actionSheet} onPress={() => undefined}>
                <View style={styles.actionHandle} />
                <View style={styles.actionHeader}>
                  <View style={styles.actionHeaderIdentity}>
                    <Text style={styles.actionTitle}>Ações da obra</Text>
                    <Text numberOfLines={1} style={styles.actionSubtitle}>
                      {work.client_name}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.actionClose}
                    onPress={() => setActionMenuVisible(false)}
                  >
                    <Ionicons name="close-outline" size={23} color="#34405A" />
                  </Pressable>
                </View>

                <View style={styles.actionGrid}>
                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() => {
                        setOpenSection('pending');
                        setPendingCreateRequest((current) => current + 1);
                      })
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="alert-circle-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Nova pendência</Text>
                  </Pressable>

                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() => {
                        setOpenSection('fio');
                        setTimelineCreateRequest((current) => current + 1);
                      })
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="create-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Atualizar FIO</Text>
                  </Pressable>

                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() => {
                        setOpenSection('photos');
                        setCameraRequest((current) => current + 1);
                      })
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="camera-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Câmera</Text>
                  </Pressable>

                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() =>
                        router.push({
                          pathname: '/new-environment',
                          params: { workId: work.id },
                        })
                      )
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="grid-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Novo ambiente</Text>
                  </Pressable>

                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() =>
                        router.push({
                          pathname: '/work-participants',
                          params: { workId: work.id },
                        })
                      )
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="people-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Equipe</Text>
                  </Pressable>

                  <Pressable
                    style={styles.actionItem}
                    onPress={() =>
                      runAction(() => {
                        setOpenSection('documents');
                        setDocumentCreateRequest((value) => value + 1);
                      })
                    }
                  >
                    <View style={styles.actionIcon}>
                      <Ionicons name="document-text-outline" size={21} color={FioColors.green} />
                    </View>
                    <Text style={styles.actionText}>Documentos</Text>
                  </Pressable>
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: FioColors.canvas },
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 100,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: FioColors.canvas,
  },
  loadingText: { fontSize: 13, color: '#697386' },
  backButton: {
    minHeight: 40,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: { fontSize: 13, fontWeight: '800', color: FioColors.green },
  workCard: {
    padding: 13,
    borderWidth: 1,
    borderColor: '#DCE1EA',
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
  },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cover: { width: 72, height: 72, borderRadius: 15 },
  coverPlaceholder: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: FioColors.goldSoft,
  },
  coverInitials: { fontSize: 22, fontWeight: '900', color: FioColors.ink },
  workIdentity: { flex: 1, minWidth: 0 },
  clientProfileLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  workCode: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.1,
    color: FioColors.green,
  },
  workTitle: {
    flex: 1,
    marginTop: 2,
    marginBottom: 4,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
    color: '#10192B',
  },
  infoLine: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 5,
  },
  infoText: { flex: 1, minWidth: 0, fontSize: 10, lineHeight: 14, color: '#5A6680' },
  statusRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statusBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    backgroundColor: '#EEF8F1',
  },
  statusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#2EA35E' },
  statusText: { fontSize: 10, fontWeight: '800', color: '#267A48' },
  progressText: { fontSize: 11, fontWeight: '800', color: '#47536A' },
  progressTrack: {
    height: 6,
    marginTop: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E6E8EE',
  },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: FioColors.green },
  teamRow: {
    marginTop: 13,
  },
  teamIdentity: { flex: 1 },
  teamHeading: { marginBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  teamTitle: { fontSize: 11, fontWeight: '800', color: '#34405A' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 34,
    height: 34,
    marginRight: -5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    borderRadius: 999,
    backgroundColor: FioColors.greenSoft,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  addTeam: {
    width: 34,
    height: 34,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFD0C3',
    borderRadius: 999,
  },
  teamCount: { fontSize: 9, color: '#768096' },
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
  sections: { marginTop: 10 },
  placeholder: {
    minHeight: 64,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 13,
    backgroundColor: FioColors.greenSoft,
  },
  placeholderText: { flex: 1, fontSize: 12, lineHeight: 18, color: FioColors.green },
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
  environmentFill: { height: '100%', borderRadius: 999, backgroundColor: FioColors.green },
  environmentBody: { padding: 13, paddingTop: 3, borderTopWidth: 1, borderTopColor: '#E8EAEE' },
  environmentDetail: { marginTop: 8, fontSize: 12, lineHeight: 17, color: '#5D687C' },
  environmentCentralNote: { marginTop: 10, fontSize: 10, lineHeight: 15, color: FioColors.green },
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
    borderColor: '#BFD0C3',
    borderRadius: 12,
  },
  secondaryWide: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFD0C3',
    borderRadius: 12,
  },
  secondaryText: { fontSize: 11, fontWeight: '800', color: FioColors.green },
  primaryButton: {
    minHeight: 48,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 13,
    backgroundColor: FioColors.ink,
  },
  primaryText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  floatingAction: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: FioColors.orange,
    shadowColor: FioColors.ink,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 9,
    elevation: 8,
  },
  actionBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 25, 43, 0.42)',
  },
  actionSheet: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#FFFFFF',
  },
  actionHandle: {
    width: 38,
    height: 4,
    alignSelf: 'center',
    borderRadius: 999,
    backgroundColor: '#D9DCE3',
  },
  actionHeader: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionHeaderIdentity: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 18, fontWeight: '900', color: '#172033' },
  actionSubtitle: { marginTop: 2, fontSize: 10, color: '#727C8E' },
  actionClose: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: '#F1F2F5',
  },
  actionGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionItem: {
    minHeight: 62,
    flexGrow: 1,
    flexBasis: '46%',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#E0E2E8',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },
  actionIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: FioColors.greenSoft,
  },
  actionText: { flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#34405A' },
  errorCard: { marginTop: 12, padding: 14, borderRadius: 13, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 12, lineHeight: 18, color: '#B42318' },
  permissionNote: { marginTop: 5, textAlign: 'center', fontSize: 10, color: '#8991A0' },
  pressed: { opacity: 0.65 },
});
