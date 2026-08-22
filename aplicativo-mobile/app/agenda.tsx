import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type AgendaScope = 'mine' | 'work' | 'company';
type AccessLevel = 'owner' | 'manager' | 'collaborator' | 'viewer';
type VisitAction = 'confirm' | 'reschedule' | 'start' | 'complete' | 'cancel';
type VisitStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

type AgendaWork = {
  work_id: string;
  work_code: string;
  client_name: string;
  address: string;
  status: string;
  access_level: AccessLevel;
  can_create: boolean;
};

type AssignmentParticipant = {
  participant_id: string;
  user_id: string;
  full_name: string;
  role_title: string | null;
  job_title: string | null;
  access_level: Exclude<AccessLevel, 'viewer'>;
  company_id: string | null;
};

type VisitEnvironment = {
  environment_id: string;
  name: string;
};

type VisitParticipant = {
  user_id: string;
  full_name: string;
  participation_role: 'responsible' | 'participant';
  response_status: 'pending' | 'confirmed' | 'declined';
};

type WorkVisit = {
  visit_id: string;
  work_id: string;
  work_code: string;
  client_name: string;
  address: string;
  company_id: string | null;
  company_name: string | null;
  starts_at: string;
  duration_minutes: number;
  responsible_user_id: string;
  responsible_name: string;
  status: VisitStatus;
  observation: string | null;
  environments: VisitEnvironment[];
  participants: VisitParticipant[];
  can_manage: boolean;
  created_at: string;
};

type EnvironmentOption = {
  id: string;
  name: string;
};

const SCOPE_OPTIONS: { key: AgendaScope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'mine', label: 'Minha agenda', icon: 'person-outline' },
  { key: 'work', label: 'Por obra', icon: 'business-outline' },
  { key: 'company', label: 'Empresa', icon: 'people-outline' },
];

const STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  rescheduled: 'Reagendada',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

const DURATION_OPTIONS = [30, 60, 90, 120];

const ACTION_LABELS: Record<VisitAction, string> = {
  confirm: 'Confirmar visita',
  reschedule: 'Reagendar',
  start: 'Iniciar visita',
  complete: 'Concluir visita',
  cancel: 'Cancelar visita',
};

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} h ${remaining}` : `${hours} h`;
}

function suggestedStart() {
  const value = new Date();
  value.setSeconds(0, 0);
  value.setMinutes(value.getMinutes() < 30 ? 30 : 0);
  value.setHours(value.getHours() + (value.getMinutes() === 0 ? 1 : 0));
  return value;
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatVisitDay(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPickerValue(value: Date) {
  return value.toLocaleString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toggleId(values: string[], id: string) {
  return values.includes(id)
    ? values.filter((value) => value !== id)
    : [...values, id];
}

function VisitCard({
  visit,
  onManage,
  onEdit,
}: {
  visit: WorkVisit;
  onManage: (visit: WorkVisit) => void;
  onEdit: (visit: WorkVisit) => void;
}) {
  const statusTone =
    visit.status === 'cancelled'
      ? styles.statusCancelled
      : visit.status === 'completed'
        ? styles.statusCompleted
        : visit.status === 'in_progress'
          ? styles.statusProgress
          : styles.statusScheduled;
  const environmentNames = visit.environments.map((item) => item.name).join(', ');
  const invitedCount = visit.participants.filter(
    (item) => item.participation_role === 'participant'
  ).length;

  return (
    <View style={styles.visitCard}>
      <View style={styles.visitTopRow}>
        <View style={styles.dateBadge}>
          <Text style={styles.dateBadgeDay}>
            {new Date(visit.starts_at).toLocaleDateString('pt-BR', { day: '2-digit' })}
          </Text>
          <Text style={styles.dateBadgeMonth}>
            {new Date(visit.starts_at)
              .toLocaleDateString('pt-BR', { month: 'short' })
              .replace('.', '')}
          </Text>
        </View>

        <View style={styles.visitIdentity}>
          <Text style={styles.visitWorkCode}>{visit.work_code}</Text>
          <Text numberOfLines={1} style={styles.visitClient}>{visit.client_name}</Text>
          <Text style={styles.visitMoment}>
            {formatVisitDay(visit.starts_at)} · {formatTime(visit.starts_at)} · {visit.duration_minutes} min
          </Text>
        </View>

        <View style={[styles.statusBadge, statusTone]}>
          <Text style={styles.statusText}>{STATUS_LABELS[visit.status]}</Text>
        </View>
      </View>

      <View style={styles.visitDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="person-outline" size={15} color={FioColors.green} />
          <Text numberOfLines={1} style={styles.detailText}>
            Responsável: {visit.responsible_name}
          </Text>
        </View>
        {!!environmentNames && (
          <View style={styles.detailRow}>
            <Ionicons name="grid-outline" size={15} color={FioColors.gold} />
            <Text numberOfLines={2} style={styles.detailText}>{environmentNames}</Text>
          </View>
        )}
        {invitedCount > 0 && (
          <View style={styles.detailRow}>
            <Ionicons name="people-outline" size={15} color={FioColors.textMuted} />
            <Text style={styles.detailText}>
              {invitedCount} {invitedCount === 1 ? 'participante' : 'participantes'}
            </Text>
          </View>
        )}
        {!!visit.observation && (
          <Text numberOfLines={3} style={styles.observation}>{visit.observation}</Text>
        )}
        {visit.can_manage && !['completed', 'cancelled'].includes(visit.status) && (
          <>
            <Pressable style={styles.manageButton} onPress={() => onManage(visit)}>
              <Ionicons name="options-outline" size={15} color={FioColors.green} />
              <Text style={styles.manageButtonText}>Gerenciar visita</Text>
            </Pressable>
            {visit.status !== 'in_progress' && (
            <Pressable style={styles.editButton} onPress={() => onEdit(visit)}>
                <Ionicons name="create-outline" size={15} color={FioColors.gold} />
                <Text style={styles.editButtonText}>Editar dados</Text>
              </Pressable>
            )}
          </>
        )}
      </View>
    </View>
  );
}

export default function AgendaScreen() {
  const params = useLocalSearchParams<{
    workId?: string | string[];
    quick?: string | string[];
    visitId?: string | string[];
    action?: string | string[];
  }>();
  const requestedWorkId = firstParam(params.workId);
  const requestedQuick = firstParam(params.quick) === '1';
  const requestedVisitId = firstParam(params.visitId);
  const requestedVisitAction = firstParam(params.action);
  const [scope, setScope] = useState<AgendaScope>(requestedWorkId ? 'work' : 'mine');
  const [works, setWorks] = useState<AgendaWork[]>([]);
  const [visits, setVisits] = useState<WorkVisit[]>([]);
  const [selectedWorkId, setSelectedWorkId] = useState(requestedWorkId ?? '');
  const [activeCompanyName, setActiveCompanyName] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [editingVisit, setEditingVisit] = useState<WorkVisit | null>(null);
  const [createWorkId, setCreateWorkId] = useState('');
  const [participants, setParticipants] = useState<AssignmentParticipant[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentOption[]>([]);
  const [responsibleId, setResponsibleId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [environmentIds, setEnvironmentIds] = useState<string[]>([]);
  const [startsAt, setStartsAt] = useState(suggestedStart);
  const [duration, setDuration] = useState(60);
  const [observation, setObservation] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState('');
  const [manageOpen, setManageOpen] = useState(false);
  const [managedVisit, setManagedVisit] = useState<WorkVisit | null>(null);
  const [manageAction, setManageAction] = useState<VisitAction | null>(null);
  const [manageStartsAt, setManageStartsAt] = useState(suggestedStart);
  const [manageReason, setManageReason] = useState('');
  const [manageSaving, setManageSaving] = useState(false);
  const [manageMessage, setManageMessage] = useState('');
  const scopeRef = useRef<AgendaScope>(requestedWorkId ? 'work' : 'mine');
  const selectedWorkIdRef = useRef(requestedWorkId ?? '');
  const quickOpenedRef = useRef(false);
  const visitActionHandledRef = useRef('');

  const creatableWorks = useMemo(
    () => works.filter((work) => work.can_create),
    [works]
  );
  const selectedCreateWork = works.find((work) => work.work_id === createWorkId);
  const collaboratorCreating = selectedCreateWork?.access_level === 'collaborator';
  const focusedVisit = useMemo(
    () => visits.find((visit) => visit.visit_id === requestedVisitId) ?? null,
    [requestedVisitId, visits]
  );

  const upcomingVisits = useMemo(
    () => visits.filter(
      (visit) =>
        visit.visit_id !== requestedVisitId &&
        !['completed', 'cancelled'].includes(visit.status) &&
        new Date(visit.starts_at).getTime() >= Date.now() - 60 * 60 * 1000
    ),
    [requestedVisitId, visits]
  );
  const historyVisits = useMemo(
    () => visits.filter(
      (visit) =>
        visit.visit_id !== requestedVisitId &&
        !upcomingVisits.includes(visit)
    ),
    [requestedVisitId, upcomingVisits, visits]
  );

  const manageActions = useMemo<VisitAction[]>(() => {
    if (!managedVisit) return [];
    if (managedVisit.status === 'in_progress') return ['complete', 'cancel'];
    if (managedVisit.status === 'confirmed') return ['reschedule', 'start', 'cancel'];
    if (managedVisit.status === 'scheduled' || managedVisit.status === 'rescheduled') {
      return ['confirm', 'reschedule', 'start', 'cancel'];
    }
    return [];
  }, [managedVisit]);

  const fetchVisits = useCallback(async (nextScope: AgendaScope, workId: string) => {
    if (nextScope === 'work' && !workId) {
      setVisits([]);
      return;
    }
    const result = await supabase.rpc('get_work_visits', {
      p_scope: nextScope,
      p_work_id: nextScope === 'work' ? workId : null,
    });
    if (result.error) throw result.error;
    setVisits((result.data ?? []) as WorkVisit[]);
  }, []);

  const loadAgenda = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setMessage('');

    try {
      const [userResult, worksResult, companyResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.rpc('get_agenda_works'),
        supabase.rpc('get_active_company_context'),
      ]);
      if (userResult.error) throw userResult.error;
      if (worksResult.error) throw worksResult.error;
      if (companyResult.error) throw companyResult.error;

      const loadedWorks = (worksResult.data ?? []) as AgendaWork[];
      const preferredWorkId =
        (requestedWorkId && loadedWorks.some((work) => work.work_id === requestedWorkId)
          ? requestedWorkId
          : selectedWorkIdRef.current &&
              loadedWorks.some((work) => work.work_id === selectedWorkIdRef.current)
            ? selectedWorkIdRef.current
            : loadedWorks[0]?.work_id) ?? '';
      const preferredScope = requestedWorkId ? 'work' : scopeRef.current;

      setCurrentUserId(userResult.data.user?.id ?? '');
      setWorks(loadedWorks);
      setSelectedWorkId(preferredWorkId);
      selectedWorkIdRef.current = preferredWorkId;
      setScope(preferredScope);
      scopeRef.current = preferredScope;
      setActiveCompanyName(companyResult.data?.[0]?.company_name ?? '');
      await fetchVisits(preferredScope, preferredWorkId);
      if (requestedQuick && preferredWorkId && !quickOpenedRef.current) {
        quickOpenedRef.current = true;
        setQuickMode(true);
        setCreateWorkId(preferredWorkId);
        setStartsAt(new Date());
        setObservation('');
        setCreateOpen(true);
        await loadFormOptions(preferredWorkId);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // loadFormOptions is intentionally kept as a local action; this focus load runs once per route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchVisits, requestedQuick, requestedWorkId]);

  useFocusEffect(
    useCallback(() => {
      loadAgenda();
    }, [loadAgenda])
  );

  useEffect(() => {
    if (!requestedVisitId || loading) return;
    const visit = visits.find((item) => item.visit_id === requestedVisitId);
    if (!visit) return;
    const actionKey = `${requestedVisitId}:${requestedVisitAction ?? 'open'}`;
    if (visitActionHandledRef.current === actionKey) return;
    visitActionHandledRef.current = actionKey;

    if (requestedVisitAction === 'edit' && visit.can_manage) {
      void openEdit(visit);
    } else if (requestedVisitAction === 'manage' && visit.can_manage) {
      openManagement(visit);
    }
  // The route action must run once after the requested visit is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, requestedVisitAction, requestedVisitId, visits]);

  async function changeScope(nextScope: AgendaScope) {
    setScope(nextScope);
    scopeRef.current = nextScope;
    setLoading(true);
    setMessage('');
    try {
      await fetchVisits(nextScope, selectedWorkId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível mudar a agenda.');
    } finally {
      setLoading(false);
    }
  }

  async function chooseAgendaWork(workId: string) {
    setSelectedWorkId(workId);
    selectedWorkIdRef.current = workId;
    setLoading(true);
    setMessage('');
    try {
      await fetchVisits('work', workId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a agenda da obra.');
    } finally {
      setLoading(false);
    }
  }

  async function loadFormOptions(workId: string) {
    setCreateWorkId(workId);
    setFormLoading(true);
    setFormMessage('');
    setParticipantIds([]);
    setEnvironmentIds([]);
    try {
      const [participantResult, environmentResult] = await Promise.all([
        supabase.rpc('get_work_participants_for_assignment', { p_work_id: workId }),
        supabase
          .from('environments')
          .select('id, name')
          .eq('work_id', workId)
          .eq('active', true)
          .neq('status', 'cancelado')
          .order('name'),
      ]);
      if (participantResult.error) throw participantResult.error;
      if (environmentResult.error) throw environmentResult.error;
      const loadedParticipants = (participantResult.data ?? []) as AssignmentParticipant[];
      setParticipants(loadedParticipants);
      setEnvironments((environmentResult.data ?? []) as EnvironmentOption[]);
      const currentParticipant = loadedParticipants.find(
        (participant) => participant.user_id === currentUserId
      );
      setResponsibleId(currentParticipant?.user_id ?? loadedParticipants[0]?.user_id ?? '');
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : 'Não foi possível carregar os dados da visita.'
      );
    } finally {
      setFormLoading(false);
    }
  }

  function openCreation() {
    const preferred =
      creatableWorks.find((work) => work.work_id === selectedWorkId) ?? creatableWorks[0];
    if (!preferred) {
      setMessage('Seu acesso atual permite apenas visualizar as agendas.');
      return;
    }
    setStartsAt(suggestedStart());
    setDuration(60);
    setObservation('');
    setParticipantIds([]);
    setEnvironmentIds([]);
    setCreateOpen(true);
    setQuickMode(false);
    setEditingVisit(null);
    loadFormOptions(preferred.work_id);
  }

  async function openEdit(visit: WorkVisit) {
    setEditingVisit(visit);
    setQuickMode(false);
    setCreateOpen(true);
    setStartsAt(new Date(visit.starts_at));
    setObservation(visit.observation ?? '');
    setParticipantIds(visit.participants.filter((item) => item.participation_role === 'participant').map((item) => item.user_id));
    setEnvironmentIds(visit.environments.map((item) => item.environment_id));
    await loadFormOptions(visit.work_id);
    setResponsibleId(visit.responsible_user_id);
    setParticipantIds(visit.participants.filter((item) => item.participation_role === 'participant').map((item) => item.user_id));
    setEnvironmentIds(visit.environments.map((item) => item.environment_id));
  }

  function openAndroidDateTime() {
    DateTimePickerAndroid.open({
      value: startsAt,
      mode: 'date',
      display: 'calendar',
      minimumDate: new Date(),
      onChange: (dateEvent, selectedDate) => {
        if (dateEvent.type !== 'set' || !selectedDate) return;
        DateTimePickerAndroid.open({
          value: startsAt,
          mode: 'time',
          display: 'clock',
          is24Hour: true,
          onChange: (timeEvent, selectedTime) => {
            if (timeEvent.type !== 'set' || !selectedTime) return;
            const combined = new Date(selectedDate);
            combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            setStartsAt(combined);
          },
        });
      },
    });
  }

  async function saveVisit() {
    if (!createWorkId || !responsibleId) {
      setFormMessage('Escolha a obra e o responsável.');
      return;
    }
    if (startsAt.getTime() < Date.now() - 5 * 60 * 1000) {
      setFormMessage('Escolha uma data e horário futuros.');
      return;
    }
    setSaving(true);
    setFormMessage('');
    if (quickMode) {
      const quickResult = await supabase.rpc('create_quick_work_visit', {
        p_work_id: createWorkId,
        p_observation: observation,
      });
      if (quickResult.error) {
        setFormMessage(quickResult.error.message);
        setSaving(false);
        return;
      }
      setCreateOpen(false);
      setSaving(false);
      setQuickMode(false);
      await fetchVisits(scopeRef.current, selectedWorkIdRef.current);
      return;
    }
    if (editingVisit) {
      const editResult = await supabase.rpc('update_work_visit_details', {
        p_visit_id: editingVisit.visit_id,
        p_starts_at: startsAt.toISOString(),
        p_responsible_user_id: responsibleId,
        p_participant_ids: participantIds.filter((id) => id !== responsibleId),
        p_environment_ids: environmentIds,
        p_observation: observation,
      });
      if (editResult.error) {
        setFormMessage(editResult.error.message);
        setSaving(false);
        return;
      }
      setCreateOpen(false);
      setEditingVisit(null);
      setSaving(false);
      await fetchVisits(scopeRef.current, selectedWorkIdRef.current);
      return;
    }
    const result = await supabase.rpc('create_work_visit', {
      p_work_id: createWorkId,
      p_starts_at: startsAt.toISOString(),
      p_duration_minutes: duration,
      p_responsible_user_id: responsibleId,
      p_environment_ids: environmentIds,
      p_participant_ids: participantIds.filter((id) => id !== responsibleId),
      p_observation: observation,
    });
    if (result.error) {
      setFormMessage(result.error.message);
      setSaving(false);
      return;
    }
    setCreateOpen(false);
    setSaving(false);
    setScope('mine');
    scopeRef.current = 'mine';
    setSelectedWorkId(createWorkId);
    selectedWorkIdRef.current = createWorkId;
    await fetchVisits('mine', createWorkId);
  }

  function openManagement(visit: WorkVisit) {
    const currentStart = new Date(visit.starts_at);
    setManagedVisit(visit);
    setManageAction(null);
    setManageStartsAt(currentStart.getTime() > Date.now() ? currentStart : suggestedStart());
    setManageReason('');
    setManageMessage('');
    setManageOpen(true);
  }

  function openAndroidManageDateTime() {
    DateTimePickerAndroid.open({
      value: manageStartsAt,
      mode: 'date',
      display: 'calendar',
      minimumDate: new Date(),
      onChange: (dateEvent, selectedDate) => {
        if (dateEvent.type !== 'set' || !selectedDate) return;
        DateTimePickerAndroid.open({
          value: manageStartsAt,
          mode: 'time',
          display: 'clock',
          is24Hour: true,
          onChange: (timeEvent, selectedTime) => {
            if (timeEvent.type !== 'set' || !selectedTime) return;
            const combined = new Date(selectedDate);
            combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            setManageStartsAt(combined);
          },
        });
      },
    });
  }

  async function saveVisitAction() {
    if (!managedVisit || !manageAction) {
      setManageMessage('Escolha uma ação para a visita.');
      return;
    }
    if (manageAction === 'reschedule' && manageStartsAt.getTime() <= Date.now()) {
      setManageMessage('Escolha uma nova data e horário futuros.');
      return;
    }
    if (['reschedule', 'cancel'].includes(manageAction) && !manageReason.trim()) {
      setManageMessage(
        manageAction === 'reschedule'
          ? 'Informe o motivo do reagendamento.'
          : 'Informe o motivo do cancelamento.'
      );
      return;
    }

    setManageSaving(true);
    setManageMessage('');
    const result = await supabase.rpc('transition_work_visit', {
      p_visit_id: managedVisit.visit_id,
      p_action: manageAction,
      p_new_starts_at: manageAction === 'reschedule' ? manageStartsAt.toISOString() : null,
      p_reason: ['reschedule', 'cancel'].includes(manageAction) ? manageReason.trim() : null,
    });
    if (result.error) {
      setManageMessage(result.error.message);
      setManageSaving(false);
      return;
    }

    setManageOpen(false);
    setManageSaving(false);
    await fetchVisits(scopeRef.current, selectedWorkIdRef.current);
  }

  if (loading && works.length === 0) {
    return (
      <View style={styles.loadingPage}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.loadingText}>Carregando agenda...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="PLANEJAMENTO"
        title="Agenda e visitas"
        subtitle="Compromissos pessoais, por obra e da empresa."
        actionIcon={creatableWorks.length > 0 ? 'add-outline' : undefined}
        actionLabel="Agendar visita"
        onAction={creatableWorks.length > 0 ? openCreation : undefined}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadAgenda(true)}
            tintColor={FioColors.gold}
          />
        }
      >
        <View style={styles.scopeRow}>
          {SCOPE_OPTIONS.map((option) => {
            const active = scope === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.scopeChip, active && styles.scopeChipActive]}
                onPress={() => changeScope(option.key)}
              >
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={active ? FioColors.textOnAccent : FioColors.textMuted}
                />
                <Text style={[styles.scopeText, active && styles.scopeTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {scope === 'work' && (
          <View style={styles.workSelector}>
            <Text style={styles.selectorLabel}>OBRA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalChips}>
                {works.map((work) => (
                  <Pressable
                    key={work.work_id}
                    style={[
                      styles.workChip,
                      selectedWorkId === work.work_id && styles.workChipActive,
                    ]}
                    onPress={() => chooseAgendaWork(work.work_id)}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.workChipText,
                        selectedWorkId === work.work_id && styles.workChipTextActive,
                      ]}
                    >
                      {work.work_code} · {work.client_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {scope === 'company' && (
          <View style={styles.contextCard}>
            <Ionicons name="storefront-outline" size={17} color={FioColors.gold} />
            <Text style={styles.contextText}>
              {activeCompanyName || 'Nenhuma empresa ativa selecionada no seu perfil.'}
            </Text>
          </View>
        )}

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {loading && works.length > 0 && (
          <ActivityIndicator style={styles.inlineLoading} color={FioColors.gold} />
        )}

        {!loading && focusedVisit && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Visita selecionada</Text>
            <VisitCard
              visit={focusedVisit}
              onManage={openManagement}
              onEdit={openEdit}
            />
          </View>
        )}

        {!loading && !message && visits.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={31} color={FioColors.green} />
            <Text style={styles.emptyTitle}>Nenhuma visita neste recorte</Text>
            <Text style={styles.emptyText}>
              {creatableWorks.length > 0
                ? 'Use o botão + para agendar a primeira visita.'
                : 'Seu perfil pode acompanhar as visitas cadastradas.'}
            </Text>
          </View>
        )}

        {!loading && upcomingVisits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Próximas visitas</Text>
            <Text style={styles.sectionCount}>{upcomingVisits.length}</Text>
            {upcomingVisits.map((visit) => (
              <VisitCard key={visit.visit_id} visit={visit} onManage={openManagement} onEdit={openEdit} />
            ))}
          </View>
        )}

        {!loading && historyVisits.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Histórico</Text>
            <Text style={styles.sectionCount}>{historyVisits.length}</Text>
            {historyVisits.map((visit) => (
              <VisitCard key={visit.visit_id} visit={visit} onManage={openManagement} onEdit={openEdit} />
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={manageOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !manageSaving && setManageOpen(false)}
      >
        <SafeAreaView style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalEyebrow}>VISITA</Text>
              <Text style={styles.modalTitle}>Gerenciar compromisso</Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar"
              style={styles.closeButton}
              onPress={() => setManageOpen(false)}
              disabled={manageSaving}
            >
              <Ionicons name="close-outline" size={23} color={FioColors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formContent}>
            {managedVisit && (
              <View style={styles.manageSummary}>
                <Text style={styles.manageWork}>
                  {managedVisit.work_code} · {managedVisit.client_name}
                </Text>
                <Text style={styles.manageMoment}>
                  {formatPickerValue(new Date(managedVisit.starts_at))}
                </Text>
                <Text style={styles.manageStatus}>{STATUS_LABELS[managedVisit.status]}</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>AÇÃO</Text>
            <View style={styles.actionList}>
              {manageActions.map((action) => {
                const active = manageAction === action;
                return (
                  <Pressable
                    key={action}
                    style={[styles.actionButton, active && styles.actionButtonActive]}
                    onPress={() => {
                      setManageAction(action);
                      setManageMessage('');
                    }}
                    disabled={manageSaving}
                  >
                    <Text style={[styles.actionButtonText, active && styles.actionButtonTextActive]}>
                      {ACTION_LABELS[action]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {manageAction === 'reschedule' && (
              <>
                <Text style={styles.fieldLabel}>NOVA DATA E HORÁRIO</Text>
                <View style={styles.dateSummary}>
                  <Ionicons name="calendar-outline" size={19} color={FioColors.green} />
                  <Text style={styles.dateSummaryText}>{formatPickerValue(manageStartsAt)}</Text>
                </View>
                {Platform.OS === 'ios' ? (
                  <>
                    <DateTimePicker
                      value={manageStartsAt}
                      mode="date"
                      display="inline"
                      locale="pt-BR"
                      themeVariant="dark"
                      accentColor={FioColors.green}
                      minimumDate={new Date()}
                      onChange={(_event, value) => {
                        if (!value) return;
                        const combined = new Date(value);
                        combined.setHours(
                          manageStartsAt.getHours(),
                          manageStartsAt.getMinutes(),
                          0,
                          0
                        );
                        setManageStartsAt(combined);
                      }}
                    />
                    <DateTimePicker
                      value={manageStartsAt}
                      mode="time"
                      display="spinner"
                      locale="pt-BR"
                      themeVariant="dark"
                      textColor={FioColors.text}
                      minuteInterval={5}
                      onChange={(_event, value) => {
                        if (!value) return;
                        const combined = new Date(manageStartsAt);
                        combined.setHours(value.getHours(), value.getMinutes(), 0, 0);
                        setManageStartsAt(combined);
                      }}
                    />
                  </>
                ) : (
                  <Pressable style={styles.dateButton} onPress={openAndroidManageDateTime}>
                    <Text style={styles.dateButtonText}>Alterar data e horário</Text>
                  </Pressable>
                )}
              </>
            )}

            {(manageAction === 'reschedule' || manageAction === 'cancel') && (
              <>
                <Text style={styles.fieldLabel}>MOTIVO</Text>
                <TextInput
                  value={manageReason}
                  onChangeText={setManageReason}
                  placeholder={
                    manageAction === 'reschedule'
                      ? 'Por que a visita foi reagendada?'
                      : 'Por que a visita foi cancelada?'
                  }
                  placeholderTextColor={FioColors.textSoft}
                  multiline
                  style={styles.observationInput}
                />
              </>
            )}

            {!!manageMessage && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{manageMessage}</Text>
              </View>
            )}

            <Pressable
              style={[
                styles.saveButton,
                (!manageAction || manageSaving) && styles.disabledButton,
                manageAction === 'cancel' && styles.cancelActionButton,
              ]}
              onPress={saveVisitAction}
              disabled={!manageAction || manageSaving}
            >
              {manageSaving ? (
                <ActivityIndicator color={FioColors.textOnAccent} />
              ) : (
                <Text style={styles.saveButtonText}>
                  {manageAction ? ACTION_LABELS[manageAction] : 'Escolha uma ação'}
                </Text>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal
        visible={createOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !saving && setCreateOpen(false)}
      >
        <SafeAreaView style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalEyebrow}>{editingVisit ? 'EDITAR VISITA' : quickMode ? 'VISITA RÁPIDA' : 'NOVA VISITA'}</Text>
              <Text style={styles.modalTitle}>{editingVisit ? 'Editar compromisso' : 'Agendar compromisso'}</Text>
            </View>
            <Pressable
              accessibilityLabel="Fechar"
              style={styles.closeButton}
              onPress={() => setCreateOpen(false)}
              disabled={saving}
            >
              <Ionicons name="close-outline" size={23} color={FioColors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.formContent}>
            <Text style={styles.fieldLabel}>OBRA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.horizontalChips}>
                {creatableWorks.map((work) => (
                  <Pressable
                    key={work.work_id}
                    style={[
                      styles.workChip,
                      createWorkId === work.work_id && styles.workChipActive,
                    ]}
                    onPress={() => loadFormOptions(work.work_id)}
                    disabled={saving || formLoading}
                  >
                    <Text
                      style={[
                        styles.workChipText,
                        createWorkId === work.work_id && styles.workChipTextActive,
                      ]}
                    >
                      {work.work_code} · {work.client_name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>

            {formLoading ? (
              <ActivityIndicator style={styles.formLoading} color={FioColors.gold} />
            ) : (
              <>
                {quickMode ? (
                  <View style={styles.quickNotice}>
                    <Ionicons name="time-outline" size={18} color={FioColors.green} />
                    <Text style={styles.quickNoticeText}>A chegada será registrada agora.</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>DATA E HORÁRIO</Text>
                    <View style={styles.dateSummary}>
                      <Ionicons name="calendar-outline" size={19} color={FioColors.green} />
                      <Text style={styles.dateSummaryText}>{formatPickerValue(startsAt)}</Text>
                    </View>
                {Platform.OS === 'ios' ? (
                  <>
                    <DateTimePicker
                      value={startsAt}
                      mode="date"
                      display="inline"
                      locale="pt-BR"
                      themeVariant="dark"
                      accentColor={FioColors.green}
                      minimumDate={new Date()}
                      onChange={(_event, value) => {
                        if (!value) return;
                        const combined = new Date(value);
                        combined.setHours(startsAt.getHours(), startsAt.getMinutes(), 0, 0);
                        setStartsAt(combined);
                      }}
                    />
                    <DateTimePicker
                      value={startsAt}
                      mode="time"
                      display="spinner"
                      locale="pt-BR"
                      themeVariant="dark"
                      textColor={FioColors.text}
                      minuteInterval={5}
                      onChange={(_event, value) => {
                        if (!value) return;
                        const combined = new Date(startsAt);
                        combined.setHours(value.getHours(), value.getMinutes(), 0, 0);
                        setStartsAt(combined);
                      }}
                    />
                  </>
                ) : (
                  <Pressable style={styles.dateButton} onPress={openAndroidDateTime}>
                    <Text style={styles.dateButtonText}>Alterar data e horário</Text>
                  </Pressable>
                )}
                  </>
                )}

                <Text style={styles.fieldLabel}>DURAÇÃO</Text>
                <View style={styles.chipsWrap}>
                  {DURATION_OPTIONS.map((minutes) => (
                    <Pressable
                      key={minutes}
                      style={[styles.choiceChip, duration === minutes && styles.choiceChipActive]}
                      onPress={() => setDuration(minutes)}
                    >
                      <Text
                        style={[
                          styles.choiceChipText,
                          duration === minutes && styles.choiceChipTextActive,
                        ]}
                      >
                        {formatDuration(minutes)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>RESPONSÁVEL</Text>
                <View style={styles.chipsWrap}>
                  {participants.map((participant) => {
                    const active = responsibleId === participant.user_id;
                    const disabled = collaboratorCreating && participant.user_id !== currentUserId;
                    return (
                      <Pressable
                        key={participant.user_id}
                        style={[
                          styles.choiceChip,
                          active && styles.choiceChipActive,
                          disabled && styles.choiceChipDisabled,
                        ]}
                        onPress={() => setResponsibleId(participant.user_id)}
                        disabled={disabled}
                      >
                        <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                          {participant.full_name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {environments.length > 0 && (
                  <>
                    <Text style={styles.fieldLabel}>AMBIENTES</Text>
                    <View style={styles.chipsWrap}>
                      {environments.map((environment) => {
                        const active = environmentIds.includes(environment.id);
                        return (
                          <Pressable
                            key={environment.id}
                            style={[styles.choiceChip, active && styles.choiceChipActive]}
                            onPress={() => setEnvironmentIds(toggleId(environmentIds, environment.id))}
                          >
                            <Text
                              style={[
                                styles.choiceChipText,
                                active && styles.choiceChipTextActive,
                              ]}
                            >
                              {environment.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </>
                )}

                <Text style={styles.fieldLabel}>PARTICIPANTES</Text>
                <Text style={styles.fieldHelp}>A confirmação é informativa e não bloqueia a visita.</Text>
                <View style={styles.chipsWrap}>
                  {participants
                    .filter((participant) => participant.user_id !== responsibleId)
                    .map((participant) => {
                      const active = participantIds.includes(participant.user_id);
                      return (
                        <Pressable
                          key={participant.user_id}
                          style={[styles.choiceChip, active && styles.choiceChipActive]}
                          onPress={() =>
                            setParticipantIds(toggleId(participantIds, participant.user_id))
                          }
                        >
                          <Text
                            style={[
                              styles.choiceChipText,
                              active && styles.choiceChipTextActive,
                            ]}
                          >
                            {participant.full_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Text style={styles.fieldLabel}>OBSERVAÇÃO</Text>
                <TextInput
                  value={observation}
                  onChangeText={setObservation}
                  placeholder="Acesso, objetivo da visita ou orientação para a equipe"
                  placeholderTextColor={FioColors.textSoft}
                  multiline
                  style={styles.observationInput}
                />
              </>
            )}

            {!!formMessage && (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>{formMessage}</Text>
              </View>
            )}

            <Pressable
              style={[styles.saveButton, (saving || formLoading) && styles.disabledButton]}
              onPress={saveVisit}
              disabled={saving || formLoading}
            >
              {saving ? (
                <ActivityIndicator color={FioColors.textOnAccent} />
              ) : (
                <>
                  <Ionicons name="calendar-outline" size={18} color={FioColors.textOnAccent} />
                  <Text style={styles.saveButtonText}>{editingVisit ? 'Salvar alterações' : quickMode ? 'Registrar chegada' : 'Agendar visita'}</Text>
                </>
              )}
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    padding: 12,
    paddingBottom: 80,
  },
  loadingPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FioColors.canvas,
  },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  scopeRow: { flexDirection: 'row', gap: 6 },
  scopeChip: {
    minHeight: 42,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 7,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 12,
    backgroundColor: FioColors.surface,
  },
  scopeChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  scopeText: { fontSize: 9, fontWeight: '800', color: FioColors.textMuted },
  scopeTextActive: { color: FioColors.textOnAccent },
  workSelector: { marginTop: 12 },
  selectorLabel: { marginBottom: 7, fontSize: 8, fontWeight: '900', letterSpacing: 1, color: FioColors.gold },
  horizontalChips: { flexDirection: 'row', gap: 7 },
  workChip: {
    maxWidth: 230,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 11,
    backgroundColor: FioColors.surface,
  },
  workChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  workChipText: { fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  workChipTextActive: { color: FioColors.green },
  contextCard: {
    minHeight: 42,
    marginTop: 12,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: FioColors.goldSoft,
  },
  contextText: { flex: 1, fontSize: 10, color: FioColors.inkSoft },
  inlineLoading: { marginTop: 28 },
  errorCard: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, lineHeight: 16, color: FioColors.danger },
  emptyCard: {
    marginTop: 18,
    alignItems: 'center',
    padding: 28,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.large,
    backgroundColor: FioColors.surface,
  },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text },
  emptyText: { marginTop: 5, textAlign: 'center', fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  section: { marginTop: 18 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  sectionCount: { marginTop: 2, marginBottom: 7, fontSize: 9, color: FioColors.textSoft },
  visitCard: {
    marginBottom: 9,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 16,
    backgroundColor: FioColors.surface,
    ...FioShadow,
  },
  visitTopRow: { minHeight: 72, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  dateBadge: {
    width: 46,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: FioColors.greenSoft,
  },
  dateBadgeDay: { fontSize: 18, lineHeight: 19, fontWeight: '900', color: FioColors.green },
  dateBadgeMonth: { marginTop: 2, fontSize: 8, fontWeight: '900', textTransform: 'uppercase', color: FioColors.green },
  visitIdentity: { flex: 1, minWidth: 0 },
  visitWorkCode: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: FioColors.gold },
  visitClient: { marginTop: 2, fontSize: 13, fontWeight: '900', color: FioColors.text },
  visitMoment: { marginTop: 4, fontSize: 9, color: FioColors.textMuted },
  statusBadge: { maxWidth: 80, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 999 },
  statusScheduled: { backgroundColor: FioColors.greenSoft },
  statusProgress: { backgroundColor: FioColors.orangeSoft },
  statusCompleted: { backgroundColor: FioColors.successSoft },
  statusCancelled: { backgroundColor: FioColors.dangerSoft },
  statusText: { textAlign: 'center', fontSize: 8, fontWeight: '900', color: FioColors.text },
  visitDetails: { padding: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: FioColors.line },
  detailRow: { marginBottom: 5, flexDirection: 'row', alignItems: 'center', gap: 7 },
  detailText: { flex: 1, fontSize: 10, lineHeight: 14, color: FioColors.textMuted },
  observation: { marginTop: 3, padding: 8, fontSize: 10, lineHeight: 15, color: FioColors.inkSoft, borderRadius: 9, backgroundColor: FioColors.surfaceMuted },
  manageButton: { minHeight: 38, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.green, borderRadius: 10, backgroundColor: FioColors.greenSoft },
  manageButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  editButton: { minHeight: 38, marginTop: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.gold, borderRadius: 10, backgroundColor: FioColors.goldSoft },
  editButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.gold },
  modalPage: { flex: 1, backgroundColor: FioColors.canvas },
  modalHeader: {
    minHeight: 64,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: FioColors.line,
    backgroundColor: FioColors.surfaceMuted,
  },
  modalHeading: { flex: 1 },
  modalEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 1, color: FioColors.gold },
  modalTitle: { marginTop: 2, fontSize: 19, fontWeight: '900', color: FioColors.text },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surface },
  formContent: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 14, paddingBottom: 60 },
  fieldLabel: { marginTop: 17, marginBottom: 7, fontSize: 8, fontWeight: '900', letterSpacing: 1, color: FioColors.gold },
  fieldHelp: { marginTop: -3, marginBottom: 8, fontSize: 9, color: FioColors.textSoft },
  formLoading: { marginVertical: 40 },
  dateSummary: { minHeight: 46, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  dateSummaryText: { flex: 1, fontSize: 11, fontWeight: '800', color: FioColors.text },
  dateButton: { minHeight: 42, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.greenSoft },
  dateButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  quickNotice: { minHeight: 48, marginTop: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, backgroundColor: FioColors.greenSoft },
  quickNoticeText: { fontSize: 11, fontWeight: '800', color: FioColors.green },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choiceChip: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 11, borderWidth: 1, borderColor: FioColors.line, borderRadius: 999, backgroundColor: FioColors.surface },
  choiceChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  choiceChipDisabled: { opacity: 0.35 },
  choiceChipText: { fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  choiceChipTextActive: { color: FioColors.green },
  observationInput: { minHeight: 92, padding: 12, textAlignVertical: 'top', fontSize: 12, lineHeight: 18, color: FioColors.text, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surface },
  manageSummary: { padding: 13, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surface },
  manageWork: { fontSize: 13, fontWeight: '900', color: FioColors.text },
  manageMoment: { marginTop: 5, fontSize: 10, color: FioColors.textMuted },
  manageStatus: { marginTop: 8, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5, overflow: 'hidden', borderRadius: 999, fontSize: 8, fontWeight: '900', color: FioColors.green, backgroundColor: FioColors.greenSoft },
  actionList: { gap: 7 },
  actionButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  actionButtonActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  actionButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textMuted },
  actionButtonTextActive: { color: FioColors.green },
  saveButton: { minHeight: 50, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: FioColors.green },
  cancelActionButton: { backgroundColor: FioColors.danger },
  saveButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  disabledButton: { opacity: 0.55 },
});
