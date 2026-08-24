import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Work = {
  id: string;
  code: string;
  client_name: string;
  address: string;
  status: 'agendada' | 'em_andamento' | 'aguardando_peca' | 'aguardando_cliente' | 'finalizada';
  progress: number;
  next_visit_at: string | null;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
};

type Visit = {
  visit_id: string;
  work_id: string;
  work_code: string;
  client_name: string;
  starts_at: string;
  status: string;
};

type FeedEvent = {
  id: string;
  work_id: string;
  work_code: string;
  work_name: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<Work['status'], string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || '';
}

function visitMoment(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === today.toDateString()) return `Hoje, ${time}`;
  if (date.toDateString() === tomorrow.toDateString()) return `Amanhã, ${time}`;
  return `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · ${time}`;
}

function feedType(value: string | null) {
  if (value?.startsWith('FOTO_')) return 'Foto';
  if (value?.startsWith('PENDENCIA_')) return 'Pendência';
  if (value?.startsWith('DOCUMENTO_')) return 'Documento';
  if (value?.includes('AMBIENTE')) return 'Ambiente';
  return 'Atualização';
}

export default function HomeScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [works, setWorks] = useState<Work[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [feed, setFeed] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const activeWorks = useMemo(() => works.filter((work) => work.status !== 'finalizada'), [works]);
  const nextVisit = useMemo(
    () => visits
      .filter((visit) => !['completed', 'cancelled'].includes(visit.status) && new Date(visit.starts_at).getTime() >= Date.now() - 3600000)
      .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0],
    [visits]
  );

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setMessage('');
    try {
      const [userResult, worksResult, visitsResult, notificationsResult, feedResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('works').select('id, code, client_name, address, status, progress, next_visit_at, updated_at, archived_at, deleted_at').is('archived_at', null).is('deleted_at', null).order('updated_at', { ascending: false }),
        supabase.rpc('get_work_visits', { p_scope: 'mine', p_work_id: null }),
        supabase.rpc('get_my_notification_unread_count'),
        supabase.rpc('get_my_fio_feed', { p_limit: 6 }),
      ]);
      if (worksResult.error) throw worksResult.error;
      const userId = userResult.data.user?.id;
      const loadedWorks = (worksResult.data ?? []) as Work[];
      setWorks(loadedWorks);
      setVisits((visitsResult.data ?? []) as Visit[]);
      setUnreadCount(Number(notificationsResult.data ?? 0));
      if (!feedResult.error) setFeed((feedResult.data ?? []) as FeedEvent[]);
      if (userId) {
        const [profileResult, pendingResult] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
          loadedWorks.length
            ? supabase.from('work_pending_items').select('id', { count: 'exact', head: true }).in('work_id', loadedWorks.map((work) => work.id)).eq('status', 'open')
            : Promise.resolve({ count: 0, error: null }),
        ]);
        setName(firstName(profileResult.data?.full_name));
        if (pendingResult.error) throw pendingResult.error;
        setPendingCount(pendingResult.count ?? 0);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a página inicial.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) return <View style={styles.loading}><ActivityIndicator size="large" color={FioColors.green} /></View>;

  return (
    <View style={styles.page}>
      <FioPageHeader eyebrow="PAINEL OPERACIONAL" title={name ? `Olá, ${name}` : 'Página inicial'} subtitle="O que precisa da sua atenção hoje." />
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={FioColors.green} />}>
        {!!message && <Text style={styles.error}>{message}</Text>}
        <View style={styles.stats}>
          <Pressable style={styles.stat} onPress={() => router.push('/works')}><Ionicons name="business-outline" size={21} color={FioColors.green} /><Text style={styles.statNumber}>{activeWorks.length}</Text><Text style={styles.statLabel}>obras ativas</Text></Pressable>
          <Pressable style={styles.stat} onPress={() => router.push('/works')}><Ionicons name="alert-circle-outline" size={21} color={FioColors.orange} /><Text style={styles.statNumber}>{pendingCount}</Text><Text style={styles.statLabel}>pendências abertas</Text></Pressable>
          <Pressable style={styles.stat} onPress={() => router.push('/notifications')}><Ionicons name="notifications-outline" size={21} color={FioColors.gold} /><Text style={styles.statNumber}>{unreadCount}</Text><Text style={styles.statLabel}>não lidas</Text></Pressable>
        </View>

        <Text style={styles.sectionTitle}>Próxima visita</Text>
        {nextVisit ? <Pressable style={styles.visitCard} onPress={() => router.push({ pathname: '/agenda', params: { visitId: nextVisit.visit_id } })}><View style={styles.visitIcon}><Ionicons name="calendar-outline" size={24} color={FioColors.ink} /></View><View style={styles.grow}><Text style={styles.visitMoment}>{visitMoment(nextVisit.starts_at)}</Text><Text style={styles.visitTitle}>{nextVisit.client_name}</Text><Text style={styles.subtle}>{nextVisit.work_code}</Text></View><Ionicons name="chevron-forward" size={22} color={FioColors.textMuted} /></Pressable> : <Pressable style={styles.emptyCard} onPress={() => router.push('/agenda')}><Ionicons name="calendar-clear-outline" size={24} color={FioColors.green} /><View style={styles.grow}><Text style={styles.emptyTitle}>Nenhuma visita próxima</Text><Text style={styles.subtle}>Abra a Agenda para organizar o dia.</Text></View><Ionicons name="add-circle-outline" size={25} color={FioColors.green} /></Pressable>}

        <Text style={styles.sectionTitle}>Acessos rápidos</Text>
        <View style={styles.shortcuts}>
          <Pressable style={styles.shortcut} onPress={() => router.push('/works')}><Ionicons name="business-outline" size={23} color={FioColors.green} /><Text style={styles.shortcutText}>Obras</Text></Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push('/agenda')}><Ionicons name="calendar-outline" size={23} color={FioColors.green} /><Text style={styles.shortcutText}>Agenda</Text></Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push('/notifications')}><Ionicons name="notifications-outline" size={23} color={FioColors.green} /><Text style={styles.shortcutText}>Avisos</Text></Pressable>
          <Pressable style={styles.shortcut} onPress={() => router.push('/messages')}><Ionicons name="chatbubbles-outline" size={23} color={FioColors.green} /><Text style={styles.shortcutText}>Mensagens</Text></Pressable>
        </View>

        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Obras recentes</Text><Pressable onPress={() => router.push('/works')}><Text style={styles.link}>Ver todas</Text></Pressable></View>
        {works.slice(0, 4).map((work) => <Pressable key={work.id} style={styles.workCard} onPress={() => router.push(`/works/${work.id}`)}><View style={styles.workTop}><View style={styles.grow}><Text style={styles.workCode}>{work.code}</Text><Text style={styles.workName}>{work.client_name}</Text><Text numberOfLines={1} style={styles.subtle}>{work.address}</Text></View><View style={[styles.status, work.status === 'finalizada' && styles.statusFinished]}><Text style={styles.statusText}>{STATUS_LABEL[work.status]}</Text></View></View><View style={styles.progressMeta}><Text style={styles.subtle}>Andamento</Text><Text style={styles.progressValue}>{work.progress}%</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${Math.max(0, Math.min(100, work.progress))}%` }]} /></View></Pressable>)}
        {!works.length && <View style={styles.emptyCard}><Ionicons name="business-outline" size={25} color={FioColors.green} /><View style={styles.grow}><Text style={styles.emptyTitle}>Você ainda não tem obras</Text><Text style={styles.subtle}>Crie a primeira obra para começar.</Text></View></View>}

        <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Meu FIO</Text><Pressable onPress={() => router.push('/')}><Text style={styles.link}>Ver histórico</Text></Pressable></View>
        <Text style={styles.fioHelp}>Últimas atualizações de todas as suas obras.</Text>
        {feed.slice(0, 5).map((event) => <Pressable key={event.id} style={styles.feedCard} onPress={() => router.push({ pathname: '/works/[id]', params: { id: event.work_id, section: 'fio' } })}><View style={styles.feedIcon}><Ionicons name={event.event_type?.startsWith('FOTO_') ? 'camera-outline' : event.event_type?.startsWith('PENDENCIA_') ? 'alert-circle-outline' : 'pulse-outline'} size={19} color={FioColors.orange} /></View><View style={styles.grow}><Text style={styles.feedWork}>{event.work_code} · {event.work_name}</Text><Text numberOfLines={1} style={styles.feedTitle}>{event.title || feedType(event.event_type)}</Text><Text numberOfLines={2} style={styles.subtle}>{event.description || feedType(event.event_type)}</Text></View><Text style={styles.feedTime}>{new Date(event.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</Text></Pressable>)}
        {!feed.length && <View style={styles.emptyCard}><Ionicons name="pulse-outline" size={25} color={FioColors.green} /><View style={styles.grow}><Text style={styles.emptyTitle}>Nenhuma atualização ainda</Text><Text style={styles.subtle}>Os registros das obras aparecerão aqui.</Text></View></View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas }, content: { padding: 18, paddingBottom: 46, gap: 14 }, error: { color: FioColors.danger, fontWeight: '700' }, stats: { flexDirection: 'row', gap: 10 }, stat: { flex: 1, minHeight: 124, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, padding: 13, backgroundColor: FioColors.surface, ...FioShadow }, statNumber: { marginTop: 12, fontSize: 27, fontWeight: '900', color: FioColors.text }, statLabel: { marginTop: 2, fontSize: 12, lineHeight: 16, fontWeight: '700', color: FioColors.textMuted }, sectionTitle: { marginTop: 10, fontSize: 21, fontWeight: '900', color: FioColors.text }, visitCard: { minHeight: 103, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.large, backgroundColor: FioColors.surfaceRaised }, visitIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.green }, grow: { flex: 1, minWidth: 0 }, visitMoment: { fontSize: 13, fontWeight: '900', color: FioColors.gold }, visitTitle: { marginTop: 3, fontSize: 18, fontWeight: '900', color: FioColors.text }, subtle: { marginTop: 2, fontSize: 13, color: FioColors.textMuted }, emptyCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 15, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface }, emptyTitle: { fontSize: 16, fontWeight: '900', color: FioColors.text }, shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, shortcut: { width: '47.8%', minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, shortcutText: { fontSize: 14, fontWeight: '900', color: FioColors.text }, sectionRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }, link: { color: FioColors.green, fontSize: 14, fontWeight: '900' }, workCard: { gap: 9, padding: 15, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface }, workTop: { flexDirection: 'row', gap: 12 }, workCode: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: FioColors.gold }, workName: { marginTop: 3, fontSize: 18, fontWeight: '900', color: FioColors.text }, status: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: FioColors.goldSoft }, statusFinished: { backgroundColor: FioColors.successSoft }, statusText: { fontSize: 11, fontWeight: '900', color: FioColors.inkSoft }, progressMeta: { flexDirection: 'row', justifyContent: 'space-between' }, progressValue: { color: FioColors.text, fontSize: 15, fontWeight: '900' }, track: { height: 8, overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.surfaceRaised }, fill: { height: '100%', borderRadius: 999, backgroundColor: FioColors.green }, fioHelp: { marginTop: -9, fontSize: 12, color: FioColors.textMuted }, feedCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, feedIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.orangeSoft }, feedWork: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7, color: FioColors.gold }, feedTitle: { marginTop: 2, fontSize: 14, fontWeight: '900', color: FioColors.text }, feedTime: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', color: FioColors.textSoft },
});
