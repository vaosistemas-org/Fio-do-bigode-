import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
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

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type WorkStatus =
  | 'agendada'
  | 'em_andamento'
  | 'aguardando_peca'
  | 'aguardando_cliente'
  | 'finalizada';

type WorkSection =
  | 'environments'
  | 'pending'
  | 'fio'
  | 'photos'
  | 'measurements'
  | 'documents';

type Work = {
  id: string;
  code: string;
  client_name: string;
  address: string;
  project_order: string | null;
  status: WorkStatus;
  progress: number;
  next_visit_at: string | null;
  updated_at: string;
};

type WorkAuxiliaryData = {
  pending: number;
  environments: number;
  photos: number;
};

type RelatedRecord = { id: string; work_id: string };

type RecentUpdate = {
  id: string;
  work_id: string;
  work_code: string;
  work_name: string;
  event_type: string | null;
  title: string | null;
  priority: 'normal' | 'important' | 'urgent';
  target_section: WorkSection;
  created_at: string;
};

const EMPTY_AUXILIARY: WorkAuxiliaryData = {
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

function formatDate(value: string | null) {
  if (!value) return 'Não definida';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatMoment(value: string) {
  const date = new Date(value);
  const today = new Date();
  const time = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  if (date.toDateString() === today.toDateString()) return `Hoje, ${time}`;
  return `${date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })} · ${time}`;
}

function updateType(value: string | null) {
  if (value?.startsWith('PENDENCIA_')) return 'Pendência';
  if (value?.startsWith('FOTO_')) return 'Nova foto';
  if (value?.startsWith('DOCUMENTO_')) return 'Documento';
  if (value?.includes('AMBIENTE')) return 'Ambiente';
  return 'Atualização';
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'F';
}

function createAuxiliaryMap(ids: string[]) {
  return ids.reduce<Record<string, WorkAuxiliaryData>>((result, id) => {
    result[id] = { ...EMPTY_AUXILIARY };
    return result;
  }, {});
}

export default function WorksScreen() {
  const router = useRouter();
  const searchRef = useRef<TextInput>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [recent, setRecent] = useState<RecentUpdate[]>([]);
  const [auxiliary, setAuxiliary] = useState<Record<string, WorkAuxiliaryData>>({});
  const [expandedWork, setExpandedWork] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const loadWorks = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setMessage('');

    const [worksResult, feedResult] = await Promise.all([
      supabase
        .from('works')
        .select(
          'id, code, client_name, address, project_order, status, progress, next_visit_at, updated_at'
        )
        .is('archived_at', null)
        .order('updated_at', { ascending: false }),
      supabase.rpc('get_my_fio_feed', { p_limit: 12 }),
    ]);

    if (worksResult.error) {
      setMessage(worksResult.error.message);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const loaded = (worksResult.data ?? []) as Work[];
    setWorks(loaded);
    if (!feedResult.error) setRecent(((feedResult.data ?? []) as RecentUpdate[]).slice(0, 8));

    const ids = loaded.map((work) => work.id);
    if (ids.length > 0) {
      const [pendingResult, environmentsResult, photosResult] = await Promise.all([
        supabase
          .from('work_pending_items')
          .select('id, work_id')
          .in('work_id', ids)
          .eq('status', 'open'),
        supabase
          .from('environments')
          .select('id, work_id')
          .in('work_id', ids)
          .eq('active', true),
        supabase.from('work_photos').select('id, work_id').in('work_id', ids),
      ]);

      const counts = createAuxiliaryMap(ids);
      ((pendingResult.data ?? []) as RelatedRecord[]).forEach((item) => {
        counts[item.work_id].pending += 1;
      });
      ((environmentsResult.data ?? []) as RelatedRecord[]).forEach((item) => {
        counts[item.work_id].environments += 1;
      });
      ((photosResult.data ?? []) as RelatedRecord[]).forEach((item) => {
        counts[item.work_id].photos += 1;
      });
      setAuxiliary(counts);
    } else {
      setAuxiliary({});
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadWorks();
    }, [loadWorks])
  );

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return works;
    return works.filter((work) =>
      [work.client_name, work.code, work.project_order ?? '', work.address]
        .join(' ')
        .toLowerCase()
        .includes(normalized)
    );
  }, [search, works]);

  function openSection(workId: string, section?: WorkSection) {
    router.push({
      pathname: '/works/[id]',
      params: { id: workId, ...(section ? { section } : {}) },
    });
  }

  function showSearch() {
    setSearchVisible(true);
    setTimeout(() => searchRef.current?.focus(), 100);
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
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="CENTRAL"
        title="Minhas obras"
        subtitle="Acesse cada projeto sem caminhos duplicados."
        actionIcon="refresh-outline"
        actionLabel="Atualizar obras"
        onAction={() => loadWorks(true)}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
        <View style={styles.titleRow}>
          <View style={styles.titleIdentity}>
            <Text style={styles.title}>Obras</Text>
            <Text style={styles.subtitle}>Organizadas por atualização mais recente</Text>
          </View>
          <Pressable
            accessibilityLabel="Buscar obra"
            style={styles.searchIcon}
            onPress={searchVisible ? () => setSearchVisible(false) : showSearch}
          >
            <Ionicons
              name={searchVisible ? 'close-outline' : 'search-outline'}
              size={21}
              color={FioColors.ink}
            />
          </Pressable>
          <Pressable style={styles.newButton} onPress={() => router.push('/new-work')}>
            <Ionicons name="add-outline" size={18} color={FioColors.white} />
            <Text style={styles.newButtonText}>Nova obra</Text>
          </Pressable>
        </View>

        {searchVisible && (
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={20} color={FioColors.textMuted} />
            <TextInput
              ref={searchRef}
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Cliente ou código do projeto"
              placeholderTextColor={FioColors.textSoft}
              returnKeyType="search"
            />
          </View>
        )}

        {recent.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.sectionTitle}>Atualizações recentes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentList}
            >
              {recent.map((item) => (
                <Pressable
                  key={item.id}
                  style={[
                    styles.recentCard,
                    item.priority === 'important' && styles.recentImportant,
                    item.priority === 'urgent' && styles.recentUrgent,
                  ]}
                  onPress={() => openSection(item.work_id, item.target_section)}
                >
                  <View style={styles.recentIcon}>
                    <Ionicons
                      name={
                        item.priority === 'urgent'
                          ? 'warning-outline'
                          : item.priority === 'important'
                          ? 'bookmark-outline'
                          : 'pulse-outline'
                      }
                      size={18}
                      color={FioColors.white}
                    />
                  </View>
                  <Text numberOfLines={1} style={styles.recentName}>
                    {item.work_name}
                  </Text>
                  <Text numberOfLines={1} style={styles.recentType}>
                    {updateType(item.event_type)}
                  </Text>
                  <Text style={styles.recentTime}>{formatMoment(item.created_at)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.listHeader}>
          <View>
            <Text style={styles.sectionTitle}>Minhas obras</Text>
            <Text style={styles.results}>
              {filtered.length} {filtered.length === 1 ? 'obra encontrada' : 'obras encontradas'}
            </Text>
          </View>
          <Text style={styles.order}>Mais recentes</Text>
        </View>

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {!message && filtered.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="business-outline" size={29} color={FioColors.gold} />
            <Text style={styles.emptyTitle}>Nenhuma obra encontrada</Text>
          </View>
        )}

        {filtered.map((work) => {
          const open = expandedWork === work.id;
          const counts = auxiliary[work.id] ?? EMPTY_AUXILIARY;
          return (
            <View key={work.id} style={styles.workCard}>
              <Pressable
                style={styles.workHeader}
                onPress={() => setExpandedWork(open ? null : work.id)}
              >
                <View style={styles.cover}>
                  <Text style={styles.coverText}>{initials(work.client_name)}</Text>
                </View>
                <View style={styles.workIdentity}>
                  <Text style={styles.workCode}>{work.code}</Text>
                  <Text numberOfLines={1} style={styles.clientName}>
                    {work.client_name}
                  </Text>
                  <Text numberOfLines={1} style={styles.address}>
                    {work.address}
                  </Text>
                </View>
                <View style={styles.statusIdentity}>
                  <View style={styles.statusBadge}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>{STATUS_LABELS[work.status]}</Text>
                  </View>
                  <Text style={styles.progressText}>{work.progress}%</Text>
                </View>
                <Ionicons
                  name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={20}
                  color={FioColors.textMuted}
                />
              </Pressable>

              {open && (
                <View style={styles.workBody}>
                  <View style={styles.visitRow}>
                    <Ionicons name="calendar-outline" size={15} color={FioColors.green} />
                    <Text style={styles.visitText}>
                      Próxima visita: {formatDate(work.next_visit_at)}
                    </Text>
                  </View>
                  <View style={styles.shortcuts}>
                    <Shortcut
                      icon="grid-outline"
                      label="Ambientes"
                      value={counts.environments}
                      onPress={() => openSection(work.id, 'environments')}
                    />
                    <Shortcut
                      icon="alert-circle-outline"
                      label="Pendências"
                      value={counts.pending}
                      tone="orange"
                      onPress={() => openSection(work.id, 'pending')}
                    />
                    <Shortcut
                      icon="images-outline"
                      label="Fotos"
                      value={counts.photos}
                      onPress={() => openSection(work.id, 'photos')}
                    />
                  </View>
                  <Pressable
                    style={styles.openButton}
                    onPress={() => openSection(work.id)}
                  >
                    <Text style={styles.openButtonText}>Abrir obra</Text>
                    <Ionicons name="arrow-forward-outline" size={17} color={FioColors.white} />
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function Shortcut({
  icon,
  label,
  value,
  tone = 'green',
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  tone?: 'green' | 'orange';
  onPress: () => void;
}) {
  const color = tone === 'orange' ? FioColors.orange : FioColors.green;
  return (
    <Pressable style={styles.shortcut} onPress={onPress}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.shortcutLabel}>{label}</Text>
      <Text style={[styles.shortcutValue, { color }]}>{value}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 16,
    paddingTop: 23,
    paddingBottom: 70,
  },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  titleIdentity: { flex: 1 },
  title: { fontSize: 25, fontWeight: '900', color: FioColors.text },
  subtitle: { marginTop: 3, fontSize: 10, color: FioColors.textMuted },
  searchIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surface },
  newButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 13, borderRadius: 13, backgroundColor: FioColors.ink },
  newButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.white },
  searchBox: { minHeight: 50, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.gold, borderRadius: 13, backgroundColor: FioColors.surface },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 13, color: FioColors.text },
  recentSection: { marginTop: 25 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: FioColors.text },
  recentList: { paddingTop: 12, paddingBottom: 4, gap: 9 },
  recentCard: { width: 132, minHeight: 124, padding: 11, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  recentImportant: { borderColor: FioColors.gold, backgroundColor: '#FFFAF0' },
  recentUrgent: { borderColor: FioColors.orange, backgroundColor: '#FFF8EE' },
  recentIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  recentName: { marginTop: 9, fontSize: 11, fontWeight: '900', color: FioColors.text },
  recentType: { marginTop: 4, fontSize: 9, fontWeight: '800', color: FioColors.green },
  recentTime: { marginTop: 3, fontSize: 8, color: FioColors.textSoft },
  listHeader: { marginTop: 27, marginBottom: 11, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  results: { marginTop: 3, fontSize: 9, color: FioColors.textSoft },
  order: { fontSize: 9, color: FioColors.textMuted },
  workCard: { marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface, ...FioShadow },
  workHeader: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  cover: { width: 58, height: 66, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: FioColors.ink },
  coverText: { fontSize: 18, fontWeight: '900', color: FioColors.gold },
  workIdentity: { flex: 1, minWidth: 0 },
  workCode: { fontSize: 9, fontWeight: '800', color: FioColors.textMuted },
  clientName: { marginTop: 3, fontSize: 15, fontWeight: '900', color: FioColors.text },
  address: { marginTop: 4, fontSize: 9, color: FioColors.textSoft },
  statusIdentity: { alignItems: 'flex-end', gap: 5 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: FioColors.greenSoft },
  statusDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: FioColors.green },
  statusText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  progressText: { fontSize: 9, fontWeight: '900', color: FioColors.textMuted },
  workBody: { padding: 12, paddingTop: 0, borderTopWidth: 1, borderTopColor: '#EEEAE2' },
  visitRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 5 },
  visitText: { fontSize: 9, color: FioColors.textMuted },
  shortcuts: { marginTop: 11, flexDirection: 'row', gap: 7 },
  shortcut: { minHeight: 58, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surfaceMuted },
  shortcutLabel: { fontSize: 8, color: FioColors.textMuted },
  shortcutValue: { fontSize: 13, fontWeight: '900' },
  openButton: { minHeight: 44, marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: FioColors.ink },
  openButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.white },
  emptyCard: { alignItems: 'center', padding: 28, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text },
  errorCard: { padding: 13, borderRadius: 12, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, color: FioColors.danger },
});
