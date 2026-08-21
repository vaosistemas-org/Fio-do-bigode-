import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

type Work = { id: string; code: string; client_name: string };

type WorkEvent = {
  id: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_full_name: string | null;
  created_at: string;
};

type Counts = {
  pending: number;
  photos: number;
  measurements: number;
  documents: number;
  fio: number;
};

const EMPTY_COUNTS: Counts = {
  pending: 0,
  photos: 0,
  measurements: 0,
  documents: 0,
  fio: 0,
};

const STATUS_LABELS: Record<EnvironmentStatus, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  aguardando: 'Aguardando',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const SHORTCUTS: {
  section: 'pending' | 'photos' | 'measurements' | 'documents' | 'fio';
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  count: keyof Counts;
}[] = [
  { section: 'pending', label: 'Pendências', icon: 'alert-circle-outline', count: 'pending' },
  { section: 'photos', label: 'Fotos', icon: 'images-outline', count: 'photos' },
  { section: 'measurements', label: 'Medições', icon: 'resize-outline', count: 'measurements' },
  { section: 'documents', label: 'Documentos', icon: 'document-text-outline', count: 'documents' },
  { section: 'fio', label: 'Diário', icon: 'pulse-outline', count: 'fio' },
];

function formatMoment(value: string) {
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function EnvironmentScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [work, setWork] = useState<Work | null>(null);
  const [responsibleName, setResponsibleName] = useState('Sem responsável');
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [counts, setCounts] = useState<Counts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const { canManage, canWrite, isViewer, loadingAccess } = useWorkAccess(
    environment?.work_id
  );

  const loadData = useCallback(
    async (refresh = false) => {
      if (!id) {
        setMessage('Ambiente não encontrado.');
        setLoading(false);
        return;
      }

      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setMessage('');

      try {
        const environmentResult = await supabase
          .from('environments')
          .select(`
            id, work_id, name, status, progress, responsible_user_id,
            services_notes, missing_items_notes, notes, preparation_min_photos
          `)
          .eq('id', id)
          .maybeSingle();

        if (environmentResult.error) throw environmentResult.error;
        if (!environmentResult.data) throw new Error('Ambiente não encontrado.');

        const loadedEnvironment = environmentResult.data as Environment;
        setEnvironment(loadedEnvironment);

        const [workResult, eventsResult, photosResult, pendingResult, documentsResult] =
          await Promise.all([
            supabase
              .from('works')
              .select('id, code, client_name')
              .eq('id', loadedEnvironment.work_id)
              .maybeSingle(),
            supabase.rpc('get_environment_history', { p_environment_id: id }),
            supabase
              .from('work_photos')
              .select('id', { count: 'exact', head: true })
              .eq('collection', 'work')
              .eq('environment_id', id),
            supabase
              .from('work_pending_items')
              .select('id', { count: 'exact', head: true })
              .eq('environment_id', id)
              .eq('status', 'open'),
            supabase.rpc('get_work_documents', { p_work_id: loadedEnvironment.work_id }),
          ]);

        if (workResult.error) throw workResult.error;
        setWork((workResult.data as Work | null) ?? null);
        setEvents(eventsResult.error ? [] : ((eventsResult.data ?? []) as WorkEvent[]));

        const documents = documentsResult.error
          ? []
          : ((documentsResult.data ?? []) as {
              environment_id: string | null;
              category: string;
            }[]).filter((item) => item.environment_id === id);

        setCounts({
          photos: photosResult.count ?? 0,
          pending: pendingResult.count ?? 0,
          measurements: documents.filter((item) => item.category === 'measurement').length,
          documents: documents.filter(
            (item) => item.category !== 'measurement' && item.category !== 'project'
          ).length,
          fio: eventsResult.error ? 0 : (eventsResult.data ?? []).length,
        });

        if (loadedEnvironment.responsible_user_id) {
          const profileResult = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', loadedEnvironment.responsible_user_id)
            .maybeSingle();
          setResponsibleName(profileResult.data?.full_name || 'Responsável');
        } else {
          setResponsibleName('Sem responsável');
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : 'Não foi possível carregar o ambiente.'
        );
      } finally {
        if (refresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [id]
  );

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const progress = useMemo(
    () => Math.max(0, Math.min(environment?.progress ?? 0, 100)),
    [environment?.progress]
  );

  function backToWork() {
    if (!environment) return router.back();
    router.replace({
      pathname: '/works/[id]',
      params: { id: environment.work_id, section: 'environments' },
    });
  }

  function openSection(section: (typeof SHORTCUTS)[number]['section']) {
    if (!environment) return;
    router.push({
      pathname: '/works/[id]',
      params: {
        id: environment.work_id,
        section,
        environmentId: environment.id,
      },
    });
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.muted}>Carregando ambiente...</Text>
      </View>
    );
  }

  if (!environment) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>{message || 'Ambiente não encontrado.'}</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Voltar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow={work?.code}
        title={environment.name}
        subtitle={work?.client_name}
        actionIcon="refresh-outline"
        actionLabel="Atualizar ambiente"
        onAction={() => loadData(true)}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadData(true)}
            tintColor={FioColors.gold}
          />
        }
      >
        <Pressable style={styles.backButton} onPress={backToWork}>
          <Ionicons name="chevron-back-outline" size={19} color={FioColors.green} />
          <Text style={styles.backText}>Voltar à obra</Text>
        </Pressable>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroIdentity}>
              <Text style={styles.eyebrow}>AMBIENTE</Text>
              <Text style={styles.title}>{environment.name}</Text>
              <Text style={styles.responsible}>Responsável: {responsibleName}</Text>
            </View>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{STATUS_LABELS[environment.status]}</Text>
            </View>
          </View>

          <View style={styles.progressHeading}>
            <Text style={styles.progressLabel}>ANDAMENTO</Text>
            <Text style={styles.progressNumber}>{progress}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` as `${number}%` }]} />
          </View>

          <View style={styles.heroActions}>
            {canWrite && (
              <Pressable
                style={styles.primaryButton}
                onPress={() =>
                  router.push({ pathname: '/environment-progress', params: { id: environment.id } })
                }
              >
                <Ionicons name="trending-up-outline" size={18} color={FioColors.textOnAccent} />
                <Text style={styles.primaryButtonText}>Registrar avanço</Text>
              </Pressable>
            )}
            {canManage && (
              <Pressable
                style={styles.secondaryButton}
                onPress={() =>
                  router.push({ pathname: '/edit-environment', params: { id: environment.id } })
                }
              >
                <Ionicons name="create-outline" size={18} color={FioColors.green} />
                <Text style={styles.secondaryButtonText}>Editar</Text>
              </Pressable>
            )}
          </View>
        </View>

        {isViewer && (
          <View style={styles.readOnlyCard}>
            <Ionicons name="eye-outline" size={18} color={FioColors.textMuted} />
            <Text style={styles.readOnlyText}>Acesso somente para visualização.</Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>Central do ambiente</Text>
        <View style={styles.shortcuts}>
          {SHORTCUTS.map((item) => (
            <Pressable
              key={item.section}
              style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
              onPress={() => openSection(item.section)}
            >
              <View style={styles.shortcutIcon}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={item.section === 'pending' ? FioColors.orange : FioColors.green}
                />
              </View>
              <View style={styles.shortcutIdentity}>
                <Text style={styles.shortcutLabel}>{item.label}</Text>
                <Text style={styles.shortcutCount}>{counts[item.count]}</Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={17} color={FioColors.textSoft} />
            </Pressable>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Registro do ambiente</Text>
            <View style={styles.photoMinimumBadge}>
              <Ionicons name="camera-outline" size={13} color={FioColors.gold} />
              <Text style={styles.photoMinimumText}>
                Mínimo final: {environment.preparation_min_photos}
              </Text>
            </View>
          </View>
          <InfoBlock label="Serviços realizados" value={environment.services_notes} />
          <InfoBlock label="Itens faltantes" value={environment.missing_items_notes} />
          <InfoBlock label="Observações" value={environment.notes} />
          {!environment.services_notes &&
            !environment.missing_items_notes &&
            !environment.notes && (
              <Text style={styles.emptyText}>Nenhuma observação registrada.</Text>
            )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Histórico do ambiente</Text>
          {events.length === 0 ? (
            <Text style={styles.emptyText}>Nenhuma atualização registrada.</Text>
          ) : (
            events.slice(0, 30).map((event, index) => (
              <View key={event.id} style={[styles.event, index > 0 && styles.eventBorder]}>
                <View style={styles.eventIcon}>
                  <Ionicons name="pulse-outline" size={15} color={FioColors.textOnAccent} />
                </View>
                <View style={styles.eventIdentity}>
                  <Text style={styles.eventTitle}>{event.title || 'Atualização do ambiente'}</Text>
                  {!!event.description && (
                    <Text style={styles.eventDescription}>{event.description}</Text>
                  )}
                  <Text style={styles.eventMeta}>
                    {event.actor_full_name || 'Usuário do FIO'} · {formatMoment(event.created_at)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        {!!message && <Text style={styles.errorText}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

function InfoBlock({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, backgroundColor: FioColors.canvas },
  muted: { fontSize: 12, color: FioColors.textMuted },
  content: { width: '100%', maxWidth: 880, alignSelf: 'center', padding: 12, paddingBottom: 80 },
  backButton: { minHeight: 42, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 12, fontWeight: '900', color: FioColors.green },
  heroCard: { padding: 16, borderWidth: 2, borderColor: FioColors.lineStrong, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heroIdentity: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1.2, color: FioColors.gold },
  title: { marginTop: 4, fontSize: 24, fontWeight: '900', color: FioColors.text },
  responsible: { marginTop: 5, fontSize: 11, color: FioColors.textMuted },
  statusBadge: { minHeight: 30, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.green, borderRadius: 999, backgroundColor: FioColors.greenSoft },
  statusDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: FioColors.green },
  statusText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  progressHeading: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { fontSize: 8, fontWeight: '900', letterSpacing: 1, color: FioColors.textMuted },
  progressNumber: { fontSize: 15, fontWeight: '900', color: FioColors.text },
  progressTrack: { height: 8, marginTop: 7, overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.surfaceRaised },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: FioColors.green },
  heroActions: { marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { minHeight: 48, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderRadius: 13, backgroundColor: FioColors.green },
  primaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  secondaryButton: { minHeight: 48, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  secondaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.green },
  readOnlyCard: { marginTop: 10, minHeight: 48, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceMuted },
  readOnlyText: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  sectionHeading: { marginTop: 21, marginBottom: 9, fontSize: 15, fontWeight: '900', color: FioColors.text },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { minHeight: 68, flexGrow: 1, flexBasis: '46%', flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  shortcutIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  shortcutIdentity: { flex: 1, minWidth: 0 },
  shortcutLabel: { fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  shortcutCount: { marginTop: 2, fontSize: 16, fontWeight: '900', color: FioColors.text },
  card: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  photoMinimumBadge: { minHeight: 28, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: FioColors.goldSoft },
  photoMinimumText: { fontSize: 8, fontWeight: '900', color: FioColors.gold },
  infoBlock: { marginTop: 11, paddingTop: 11, borderTopWidth: 1, borderTopColor: FioColors.line },
  infoLabel: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  infoText: { marginTop: 4, fontSize: 11, lineHeight: 17, color: FioColors.textMuted },
  emptyText: { marginTop: 12, fontSize: 10, lineHeight: 16, color: FioColors.textSoft },
  event: { paddingVertical: 11, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  eventBorder: { borderTopWidth: 1, borderTopColor: FioColors.line },
  eventIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FioColors.green },
  eventIdentity: { flex: 1, minWidth: 0 },
  eventTitle: { fontSize: 11, fontWeight: '900', color: FioColors.text },
  eventDescription: { marginTop: 3, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  eventMeta: { marginTop: 5, fontSize: 8, color: FioColors.textSoft },
  errorText: { marginTop: 10, fontSize: 11, lineHeight: 17, color: FioColors.danger },
  pressed: { opacity: 0.7 },
});
