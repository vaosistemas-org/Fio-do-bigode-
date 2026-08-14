import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  FioColors,
  FioRadius,
  FioShadow,
} from '@/constants/fio-theme';
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

type FilterType = 'total' | 'em_andamento' | 'aguardando' | 'finalizada';

type WorkAuxiliaryData = {
  pending: number;
  environments: number;
  photos: number;
};

type ProfileSummary = {
  fullName: string;
  avatarUrl: string | null;
};

type WorkRelatedRecord = {
  id: string;
  work_id: string;
};

type StatusStyle = {
  backgroundColor: string;
  color: string;
  progressColor: string;
};

const EMPTY_AUXILIARY_DATA: WorkAuxiliaryData = {
  pending: 0,
  environments: 0,
  photos: 0,
};

const STATUS_LABELS: Record<WorkStatus, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

const STATUS_STYLES: Record<WorkStatus, StatusStyle> = {
  agendada: {
    backgroundColor: '#ECEDE9',
    color: '#565C57',
    progressColor: '#717772',
  },
  em_andamento: {
    backgroundColor: FioColors.greenSoft,
    color: FioColors.green,
    progressColor: FioColors.green,
  },
  aguardando_peca: {
    backgroundColor: FioColors.orangeSoft,
    color: '#A35E00',
    progressColor: FioColors.orange,
  },
  aguardando_cliente: {
    backgroundColor: FioColors.orangeSoft,
    color: '#A35E00',
    progressColor: FioColors.orange,
  },
  finalizada: {
    backgroundColor: FioColors.goldSoft,
    color: '#76571F',
    progressColor: FioColors.gold,
  },
};

const FILTER_ICONS: Record<FilterType, keyof typeof Ionicons.glyphMap> = {
  total: 'business-outline',
  em_andamento: 'play-outline',
  aguardando: 'hourglass-outline',
  finalizada: 'checkmark-circle-outline',
};

function formatDate(value: string | null) {
  if (!value) return 'Não definida';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / 60000);

  if (diffMinutes < 1) return 'Agora';
  if (diffMinutes < 60) return `Há ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Há ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `Há ${diffDays} d`;

  return date.toLocaleDateString('pt-BR');
}

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'F';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function makeAuxiliaryMap(workIds: string[]) {
  return workIds.reduce<Record<string, WorkAuxiliaryData>>((result, id) => {
    result[id] = { ...EMPTY_AUXILIARY_DATA };
    return result;
  }, {});
}

export default function WorksScreen() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [auxiliaryData, setAuxiliaryData] = useState<
    Record<string, WorkAuxiliaryData>
  >({});
  const [profile, setProfile] = useState<ProfileSummary>({
    fullName: 'Meu FIO',
    avatarUrl: null,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('total');

  async function loadWorks(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setMessage('');

    const [worksResult, userResult] = await Promise.all([
      supabase
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
        .order('updated_at', { ascending: false }),
      supabase.auth.getUser(),
    ]);

    if (worksResult.error) {
      setMessage(worksResult.error.message);
      setRefreshing(false);
      setLoading(false);
      return;
    }

    const loadedWorks = (worksResult.data ?? []) as Work[];
    const workIds = loadedWorks.map((work) => work.id);
    setWorks(loadedWorks);

    if (userResult.data.user) {
      const profileResult = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', userResult.data.user.id)
        .maybeSingle();

      if (profileResult.data) {
        setProfile({
          fullName: profileResult.data.full_name || 'Meu FIO',
          avatarUrl: profileResult.data.avatar_url ?? null,
        });
      }
    }

    if (workIds.length > 0) {
      const [pendingResult, environmentsResult, photosResult] = await Promise.all([
        supabase
          .from('work_pending_items')
          .select('id, work_id')
          .in('work_id', workIds)
          .eq('status', 'open'),
        supabase
          .from('environments')
          .select('id, work_id')
          .in('work_id', workIds)
          .eq('active', true),
        supabase.from('work_photos').select('id, work_id').in('work_id', workIds),
      ]);

      const nextAuxiliaryData = makeAuxiliaryMap(workIds);

      ((pendingResult.data ?? []) as WorkRelatedRecord[]).forEach((item) => {
        nextAuxiliaryData[item.work_id].pending += 1;
      });
      ((environmentsResult.data ?? []) as WorkRelatedRecord[]).forEach((item) => {
        nextAuxiliaryData[item.work_id].environments += 1;
      });
      ((photosResult.data ?? []) as WorkRelatedRecord[]).forEach((item) => {
        nextAuxiliaryData[item.work_id].photos += 1;
      });

      setAuxiliaryData(nextAuxiliaryData);
    } else {
      setAuxiliaryData({});
    }

    setRefreshing(false);
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadWorks();
    }, [])
  );

  const counts = useMemo(
    () => ({
      total: works.length,
      em_andamento: works.filter((work) => work.status === 'em_andamento').length,
      aguardando: works.filter(
        (work) =>
          work.status === 'aguardando_peca' ||
          work.status === 'aguardando_cliente'
      ).length,
      finalizada: works.filter((work) => work.status === 'finalizada').length,
    }),
    [works]
  );

  const filteredWorks = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return works.filter((work) => {
      const matchesFilter =
        activeFilter === 'total' ||
        (activeFilter === 'em_andamento' && work.status === 'em_andamento') ||
        (activeFilter === 'aguardando' &&
          (work.status === 'aguardando_peca' ||
            work.status === 'aguardando_cliente')) ||
        (activeFilter === 'finalizada' && work.status === 'finalizada');

      if (!matchesFilter) return false;
      if (!normalizedSearch) return true;

      return [
        work.code,
        work.client_name,
        work.address,
        work.project_order ?? '',
        STATUS_LABELS[work.status],
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [works, search, activeFilter]);

  const recentWorks = works.slice(0, 4);
  const totalPending = Object.values(auxiliaryData).reduce(
    (total, item) => total + item.pending,
    0
  );

  function openWork(workId: string) {
    router.push({ pathname: '/works/[id]', params: { id: workId } });
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.loadingText}>Carregando suas obras...</Text>
      </View>
    );
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
          onRefresh={() => loadWorks(true)}
          tintColor={FioColors.gold}
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>Fio do Bigode</Text>
          <Text style={styles.brandSubtitle}>GESTÃO DE OBRAS</Text>
        </View>

        <View style={styles.heroActions}>
          <Pressable
            accessibilityLabel="Atualizar obras"
            style={styles.headerIconButton}
            onPress={() => loadWorks(true)}
          >
            <Ionicons name="refresh-outline" size={22} color={FioColors.white} />
          </Pressable>

          <Pressable
            accessibilityLabel="Abrir Meu FIO"
            style={styles.avatarButton}
            onPress={() => router.replace('/profile')}
          >
            {profile.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitials}>{getInitials(profile.fullName)}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <View style={styles.titleContent}>
            <Text style={styles.title}>Suas obras</Text>
            <Text style={styles.subtitle}>
              Acompanhe o andamento e abra o FIO de cada projeto.
            </Text>
          </View>

          <Pressable style={styles.newWorkButton} onPress={() => router.push('/new-work')}>
            <Ionicons name="add" size={18} color={FioColors.white} />
            <Text style={styles.newWorkButtonText}>Nova obra</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.metricsScroll}
          contentContainerStyle={styles.metricsContainer}
        >
          <MetricCard label="Total" count={counts.total} icon={FILTER_ICONS.total} tone="gold" active={activeFilter === 'total'} onPress={() => setActiveFilter('total')} />
          <MetricCard label="Em andamento" count={counts.em_andamento} icon={FILTER_ICONS.em_andamento} tone="green" active={activeFilter === 'em_andamento'} onPress={() => setActiveFilter('em_andamento')} />
          <MetricCard label="Aguardando" count={counts.aguardando} icon={FILTER_ICONS.aguardando} tone="orange" active={activeFilter === 'aguardando'} onPress={() => setActiveFilter('aguardando')} />
          <MetricCard label="Finalizadas" count={counts.finalizada} icon={FILTER_ICONS.finalizada} tone="green" active={activeFilter === 'finalizada'} onPress={() => setActiveFilter('finalizada')} />
        </ScrollView>

        {recentWorks.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Atualizações recentes</Text>
              <Text style={styles.sectionLink}>Mais recentes</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentScroll} contentContainerStyle={styles.recentContainer}>
              {recentWorks.map((work) => (
                <RecentWorkCard key={work.id} work={work} onPress={() => openWork(work.id)} />
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={21} color={FioColors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar cliente, código ou projeto"
            placeholderTextColor={FioColors.textSoft}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <Ionicons name="options-outline" size={21} color={FioColors.textMuted} />
        </View>

        <View style={styles.quickActions}>
          <Pressable style={styles.quickAction} onPress={() => loadWorks(true)}>
            <Ionicons name="refresh-outline" size={20} color={FioColors.green} />
            <Text style={styles.quickActionText}>Atualizar</Text>
          </Pressable>
          <View style={styles.quickAction}>
            <Ionicons name="clipboard-outline" size={20} color={FioColors.orange} />
            <Text style={styles.quickActionText}>Pendências</Text>
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{totalPending}</Text>
            </View>
          </View>
        </View>

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Minhas obras</Text>
            <Text style={styles.resultsCount}>
              {filteredWorks.length} {filteredWorks.length === 1 ? 'obra encontrada' : 'obras encontradas'}
            </Text>
          </View>
          <Text style={styles.orderText}>Mais recentes</Text>
        </View>

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {!message && filteredWorks.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="business-outline" size={30} color={FioColors.gold} />
            <Text style={styles.emptyTitle}>
              {works.length === 0 ? 'Nenhuma obra cadastrada' : 'Nenhuma obra encontrada'}
            </Text>
            <Text style={styles.emptyText}>
              {works.length === 0
                ? 'Crie a primeira obra para começar a organizar seu FIO.'
                : 'Tente alterar a busca ou selecionar outro indicador.'}
            </Text>
          </View>
        )}

        {filteredWorks.map((work) => (
          <WorkCard
            key={work.id}
            work={work}
            auxiliaryData={auxiliaryData[work.id] ?? EMPTY_AUXILIARY_DATA}
            onPress={() => openWork(work.id)}
          />
        ))}
      </View>
    </ScrollView>
  );
}

type MetricCardProps = {
  label: string;
  count: number;
  icon: keyof typeof Ionicons.glyphMap;
  tone: 'gold' | 'green' | 'orange';
  active: boolean;
  onPress: () => void;
};

function MetricCard({ label, count, icon, tone, active, onPress }: MetricCardProps) {
  const tones = {
    gold: { background: FioColors.goldSoft, color: '#806022' },
    green: { background: FioColors.greenSoft, color: FioColors.green },
    orange: { background: FioColors.orangeSoft, color: FioColors.orange },
  };
  const toneStyle = tones[tone];

  return (
    <Pressable style={[styles.metricCard, active && styles.metricCardActive]} onPress={onPress}>
      <View style={[styles.metricIcon, { backgroundColor: toneStyle.background }]}>
        <Ionicons name={icon} size={22} color={toneStyle.color} />
      </View>
      <View>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricCount}>{count}</Text>
      </View>
    </Pressable>
  );
}

type RecentWorkCardProps = {
  work: Work;
  onPress: () => void;
};

function RecentWorkCard({ work, onPress }: RecentWorkCardProps) {
  const progress = Math.max(0, Math.min(work.progress ?? 0, 100));
  const statusStyle = STATUS_STYLES[work.status];

  return (
    <Pressable style={styles.recentCard} onPress={onPress}>
      <View style={styles.recentCover}>
        <Text style={styles.recentCoverText}>{getInitials(work.client_name)}</Text>
      </View>
      <View style={styles.recentInfo}>
        <Text style={styles.recentName} numberOfLines={1}>{work.client_name}</Text>
        <Text style={styles.recentCode}>{work.code}</Text>
        <Text style={styles.recentUpdated}>{formatUpdatedAt(work.updated_at)}</Text>
        <View style={styles.recentProgressRow}>
          <View style={styles.recentProgressBackground}>
            <View style={[styles.recentProgressValue, { width: `${progress}%` as `${number}%`, backgroundColor: statusStyle.progressColor }]} />
          </View>
          <Text style={styles.recentProgressText}>{progress}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

type WorkCardProps = {
  work: Work;
  auxiliaryData: WorkAuxiliaryData;
  onPress: () => void;
};

function WorkCard({ work, auxiliaryData, onPress }: WorkCardProps) {
  const progress = Math.max(0, Math.min(work.progress ?? 0, 100));
  const statusStyle = STATUS_STYLES[work.status];

  return (
    <Pressable style={styles.workCard} onPress={onPress}>
      <View style={styles.workCardMain}>
        <View style={styles.workCover}>
          <Text style={styles.workCoverText}>{getInitials(work.client_name)}</Text>
        </View>

        <View style={styles.workContent}>
          <View style={styles.workHeadingRow}>
            <View style={styles.workIdentity}>
              <Text style={styles.workCode}>{work.code}</Text>
              <Text style={styles.clientName} numberOfLines={1}>{work.client_name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.backgroundColor }]}>
              <View style={[styles.statusDot, { backgroundColor: statusStyle.progressColor }]} />
              <Text style={[styles.statusText, { color: statusStyle.color }]}>{STATUS_LABELS[work.status]}</Text>
            </View>
          </View>

          <View style={styles.workMetadata}>
            <Ionicons name="calendar-outline" size={14} color={FioColors.textMuted} />
            <Text style={styles.metadataText}>Próxima visita {formatDate(work.next_visit_at)}</Text>
          </View>

          <View style={styles.progressRow}>
            <View style={styles.progressBackground}>
              <View style={[styles.progressValue, { width: `${progress}%` as `${number}%`, backgroundColor: statusStyle.progressColor }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </View>

          <View style={styles.workStats}>
            <MiniStat icon="clipboard-outline" label="Pend." value={auxiliaryData.pending} tone="orange" />
            <MiniStat icon="grid-outline" label="Amb." value={auxiliaryData.environments} tone="gold" />
            <MiniStat icon="camera-outline" label="Fotos" value={auxiliaryData.photos} tone="green" />
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={FioColors.textMuted} />
      </View>

      <Text style={styles.workAddress} numberOfLines={1}>{work.address}</Text>
    </Pressable>
  );
}

type MiniStatProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tone: 'gold' | 'green' | 'orange';
};

function MiniStat({ icon, label, value, tone }: MiniStatProps) {
  const color = tone === 'green' ? FioColors.green : tone === 'orange' ? FioColors.orange : FioColors.gold;

  return (
    <View style={styles.miniStat}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={styles.miniStatLabel}>{label}</Text>
      <Text style={styles.miniStatValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  container: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingBottom: 72 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas },
  loadingText: { marginTop: 10, fontSize: 13, color: FioColors.textMuted },
  hero: {
    minHeight: 112,
    paddingTop: 42,
    paddingBottom: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: FioColors.ink,
  },
  brandBlock: { flex: 1 },
  brand: { fontSize: 25, fontFamily: 'serif', fontWeight: '700', color: FioColors.white },
  brandSubtitle: { marginTop: 2, fontSize: 10, fontWeight: '800', letterSpacing: 1.3, color: FioColors.gold },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: FioRadius.pill, backgroundColor: FioColors.inkSoft },
  avatarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#4A4D49', borderRadius: FioRadius.pill, backgroundColor: FioColors.gold },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 14, fontWeight: '900', color: FioColors.ink },
  content: { paddingHorizontal: 16, paddingTop: 26 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  titleContent: { flex: 1 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '900', color: FioColors.text },
  subtitle: { marginTop: 4, fontSize: 13, lineHeight: 19, color: FioColors.textMuted },
  newWorkButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 15, borderRadius: FioRadius.medium, backgroundColor: FioColors.ink },
  newWorkButtonText: { fontSize: 13, fontWeight: '800', color: FioColors.white },
  metricsScroll: { marginHorizontal: -16, marginTop: 22 },
  metricsContainer: { paddingHorizontal: 16, paddingBottom: 5, gap: 10 },
  metricCard: { minWidth: 168, minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  metricCardActive: { borderColor: FioColors.gold, backgroundColor: '#FFF9EF' },
  metricIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: FioRadius.pill },
  metricLabel: { fontSize: 12, color: FioColors.textMuted },
  metricCount: { marginTop: 1, fontSize: 24, lineHeight: 27, fontWeight: '900', color: FioColors.text },
  section: { marginTop: 26 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: FioColors.text },
  sectionLink: { fontSize: 12, fontWeight: '800', color: FioColors.orange },
  recentScroll: { marginHorizontal: -16, marginTop: 12 },
  recentContainer: { paddingHorizontal: 16, paddingBottom: 4, gap: 10 },
  recentCard: { width: 250, minHeight: 112, flexDirection: 'row', overflow: 'hidden', borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  recentCover: { width: 82, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.ink },
  recentCoverText: { fontSize: 24, fontWeight: '800', color: FioColors.gold },
  recentInfo: { flex: 1, padding: 12 },
  recentName: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  recentCode: { marginTop: 2, fontSize: 11, color: FioColors.textMuted },
  recentUpdated: { marginTop: 4, fontSize: 10, color: FioColors.textSoft },
  recentProgressRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  recentProgressBackground: { flex: 1, height: 5, overflow: 'hidden', borderRadius: FioRadius.pill, backgroundColor: '#E7E5DF' },
  recentProgressValue: { height: '100%', borderRadius: FioRadius.pill },
  recentProgressText: { fontSize: 10, fontWeight: '900', color: FioColors.text },
  searchBox: { minHeight: 54, marginTop: 26, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  searchInput: { flex: 1, paddingVertical: 13, fontSize: 14, color: FioColors.text },
  quickActions: { marginTop: 10, flexDirection: 'row', gap: 10 },
  quickAction: { minHeight: 48, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  quickActionText: { fontSize: 12, fontWeight: '800', color: FioColors.text },
  notificationBadge: { minWidth: 21, height: 21, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: FioRadius.pill, backgroundColor: FioColors.orange },
  notificationBadgeText: { fontSize: 10, fontWeight: '900', color: FioColors.white },
  listHeader: { marginTop: 28, marginBottom: 12, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  resultsCount: { marginTop: 3, fontSize: 11, color: FioColors.textSoft },
  orderText: { fontSize: 11, color: FioColors.textMuted },
  workCard: { marginBottom: 12, padding: 13, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface, ...FioShadow },
  workCardMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  workCover: { width: 70, height: 92, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: FioColors.ink },
  workCoverText: { fontSize: 23, fontWeight: '800', color: FioColors.gold },
  workContent: { flex: 1, minWidth: 0 },
  workHeadingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  workIdentity: { flex: 1, minWidth: 0 },
  workCode: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  clientName: { marginTop: 2, fontSize: 16, fontWeight: '900', color: FioColors.text },
  statusBadge: { maxWidth: 126, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: FioRadius.pill },
  statusDot: { width: 7, height: 7, borderRadius: FioRadius.pill },
  statusText: { flexShrink: 1, fontSize: 10, fontWeight: '800' },
  workMetadata: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  metadataText: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  progressRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  progressBackground: { flex: 1, height: 6, overflow: 'hidden', borderRadius: FioRadius.pill, backgroundColor: '#E6E4DE' },
  progressValue: { height: '100%', borderRadius: FioRadius.pill },
  progressText: { width: 32, fontSize: 11, fontWeight: '900', color: FioColors.text },
  workStats: { marginTop: 10, paddingTop: 9, flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ECE9E2' },
  miniStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatLabel: { fontSize: 9, color: FioColors.textMuted },
  miniStatValue: { fontSize: 10, fontWeight: '900', color: FioColors.text },
  workAddress: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#ECE9E2', fontSize: 10, color: FioColors.textSoft },
  emptyCard: { padding: 28, alignItems: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  emptyTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', textAlign: 'center', color: FioColors.text },
  emptyText: { marginTop: 6, fontSize: 13, lineHeight: 19, textAlign: 'center', color: FioColors.textMuted },
  errorCard: { padding: 16, borderRadius: FioRadius.medium, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 13, lineHeight: 19, color: FioColors.danger },
});
