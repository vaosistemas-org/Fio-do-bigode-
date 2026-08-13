import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  WorkEnvironment,
  WorkParticipant,
} from '@/components/work-central/types';
import { supabase } from '@/lib/supabase';

type Priority = 'low' | 'normal' | 'high' | 'urgent';
type PendingStatus = 'open' | 'completed';

type PendingItem = {
  id: string;
  work_id: string;
  environment_id: string | null;
  title: string;
  description: string | null;
  priority: Priority;
  responsible_user_id: string | null;
  due_date: string | null;
  blocks_delivery: boolean;
  status: PendingStatus;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const PRIORITIES: Array<{
  value: Priority;
  label: string;
}> = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const PRIORITY_ORDER: Record<Priority, number> = {
  low: 0,
  normal: 1,
  high: 2,
  urgent: 3,
};

function formatDate(value: string | null) {
  if (!value) return 'Sem prazo';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function toDateValue(value: string | null) {
  if (!value) return new Date();
  return new Date(`${value}T12:00:00`);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function WorkPendingPanel({
  workId,
  environments,
  participants,
  canWrite,
  onOpenCountChange,
}: {
  workId: string;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  canWrite: boolean;
  onOpenCountChange?: (count: number) => void;
}) {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [tab, setTab] = useState<PendingStatus>('open');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>('normal');
  const [responsibleId, setResponsibleId] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [blocksDelivery, setBlocksDelivery] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const environmentNames = useMemo(
    () =>
      Object.fromEntries(
        environments.map((environment) => [
          environment.id,
          environment.name,
        ])
      ),
    [environments]
  );
  const participantNames = useMemo(
    () =>
      Object.fromEntries(
        participants.map((participant) => [
          participant.user_id,
          participant.full_name,
        ])
      ),
    [participants]
  );
  const operationalParticipants = participants.filter(
    (participant) => participant.access_level !== 'viewer'
  );

  async function loadItems() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('work_pending_items')
      .select(`
        id, work_id, environment_id, title, description,
        priority, responsible_user_id, due_date,
        blocks_delivery, status, completed_at,
        created_at, updated_at
      `)
      .eq('work_id', workId)
      .order('created_at', { ascending: false });

    if (error) {
      setMessage(error.message);
      setItems([]);
    } else {
      const loaded = (data ?? []) as PendingItem[];
      setItems(loaded);
      onOpenCountChange?.(
        loaded.filter((item) => item.status === 'open').length
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    loadItems();
  }, [workId]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setEnvironmentId(null);
    setPriority('normal');
    setResponsibleId(null);
    setDueDate(null);
    setBlocksDelivery(false);
    setShowDatePicker(false);
  }

  function openNew() {
    resetForm();
    setFormVisible(true);
  }

  function openEdit(item: PendingItem) {
    setEditingId(item.id);
    setTitle(item.title);
    setDescription(item.description ?? '');
    setEnvironmentId(item.environment_id);
    setPriority(item.priority);
    setResponsibleId(item.responsible_user_id);
    setDueDate(item.due_date);
    setBlocksDelivery(item.blocks_delivery);
    setShowDatePicker(false);
    setFormVisible(true);
  }

  async function saveItem() {
    if (!canWrite || saving) return;
    if (!title.trim()) {
      setMessage('Informe o título da pendência.');
      return;
    }

    setSaving(true);
    setMessage('');
    const { data: authData, error: authError } =
      await supabase.auth.getUser();

    if (authError || !authData.user) {
      setMessage('Usuário não autenticado.');
      setSaving(false);
      return;
    }

    const values = {
      environment_id: environmentId,
      title: title.trim(),
      description: description.trim() || null,
      priority,
      responsible_user_id: responsibleId,
      due_date: dueDate,
      blocks_delivery: blocksDelivery,
      updated_by: authData.user.id,
    };

    const result = editingId
      ? await supabase
          .from('work_pending_items')
          .update(values)
          .eq('id', editingId)
      : await supabase.from('work_pending_items').insert({
          ...values,
          work_id: workId,
          created_by: authData.user.id,
        });

    if (result.error) {
      setMessage(result.error.message);
      setSaving(false);
      return;
    }

    setFormVisible(false);
    resetForm();
    await loadItems();
    setSaving(false);
  }

  async function changeStatus(item: PendingItem) {
    if (!canWrite || changingId) return;
    setChangingId(item.id);
    setMessage('');
    const { data: authData } = await supabase.auth.getUser();
    const nextStatus: PendingStatus =
      item.status === 'open' ? 'completed' : 'open';
    const { error } = await supabase
      .from('work_pending_items')
      .update({
        status: nextStatus,
        completed_at:
          nextStatus === 'completed'
            ? new Date().toISOString()
            : null,
        completed_by:
          nextStatus === 'completed'
            ? authData.user?.id ?? null
            : null,
        updated_by: authData.user?.id ?? null,
      })
      .eq('id', item.id);

    if (error) setMessage(error.message);
    else await loadItems();
    setChangingId(null);
  }

  const visibleItems = items
    .filter((item) => item.status === tab)
    .sort((a, b) => {
      if (a.blocks_delivery !== b.blocks_delivery) {
        return a.blocks_delivery ? -1 : 1;
      }
      return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    });
  const openCount = items.filter((item) => item.status === 'open').length;
  const completedCount = items.length - openCount;

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#4937D8" />
        <Text style={styles.muted}>Carregando pendências...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{openCount}</Text>
          <Text style={styles.summaryLabel}>Abertas</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {items.filter((item) => item.blocks_delivery && item.status === 'open').length}
          </Text>
          <Text style={styles.summaryLabel}>Impedem entrega</Text>
        </View>
      </View>

      {canWrite && (
        <Pressable style={styles.newButton} onPress={openNew}>
          <Ionicons name="add-outline" size={20} color="#FFFFFF" />
          <Text style={styles.newButtonText}>Nova pendência</Text>
        </Pressable>
      )}

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, tab === 'open' && styles.tabActive]}
          onPress={() => setTab('open')}
        >
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>
            Abertas ({openCount})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'completed' && styles.tabActive]}
          onPress={() => setTab('completed')}
        >
          <Text style={[styles.tabText, tab === 'completed' && styles.tabTextActive]}>
            Concluídas ({completedCount})
          </Text>
        </Pressable>
      </View>

      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      {visibleItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {tab === 'open' ? 'Nenhuma pendência aberta' : 'Nenhuma pendência concluída'}
          </Text>
        </View>
      ) : (
        visibleItems.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <View key={item.id} style={styles.itemCard}>
              <Pressable
                style={styles.itemHeader}
                onPress={() => setExpandedId(expanded ? null : item.id)}
              >
                <View style={styles.itemIdentity}>
                  <View style={styles.badgeRow}>
                    <View style={[styles.priorityBadge, styles[`priority_${item.priority}`]]}>
                      <Text style={styles.priorityText}>
                        {PRIORITIES.find((option) => option.value === item.priority)?.label}
                      </Text>
                    </View>
                    {item.blocks_delivery && (
                      <View style={styles.blockBadge}>
                        <Text style={styles.blockText}>Impede a entrega</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemMeta}>
                    {item.environment_id
                      ? environmentNames[item.environment_id] ?? 'Ambiente'
                      : 'Geral da obra'}
                    {' · '}
                    {formatDate(item.due_date)}
                  </Text>
                </View>
                <Ionicons
                  name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={20}
                  color="#34405A"
                />
              </Pressable>

              {expanded && (
                <View style={styles.itemBody}>
                  {!!item.description && (
                    <Text style={styles.description}>{item.description}</Text>
                  )}
                  <Text style={styles.detail}>
                    Responsável: {item.responsible_user_id
                      ? participantNames[item.responsible_user_id] ?? 'Responsável'
                      : 'Não definido'}
                  </Text>
                  {canWrite && (
                    <View style={styles.itemActions}>
                      <Pressable style={styles.editButton} onPress={() => openEdit(item)}>
                        <Text style={styles.editText}>Editar</Text>
                      </Pressable>
                      <Pressable
                        style={styles.finishButton}
                        onPress={() => changeStatus(item)}
                        disabled={changingId !== null}
                      >
                        <Text style={styles.finishText}>
                          {changingId === item.id
                            ? 'Salvando...'
                            : item.status === 'open'
                            ? 'Concluir'
                            : 'Reabrir'}
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Editar pendência' : 'Nova pendência'}
              </Text>
              <Pressable style={styles.closeButton} onPress={() => setFormVisible(false)}>
                <Ionicons name="close-outline" size={25} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="O que precisa ser resolvido?"
                placeholderTextColor="#98A0AE"
                maxLength={160}
              />

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Detalhes importantes"
                placeholderTextColor="#98A0AE"
                multiline
              />

              <Text style={styles.label}>Local</Text>
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, environmentId === null && styles.chipActive]}
                  onPress={() => setEnvironmentId(null)}
                >
                  <Text style={[styles.chipText, environmentId === null && styles.chipTextActive]}>
                    Geral da obra
                  </Text>
                </Pressable>
                {environments.map((environment) => (
                  <Pressable
                    key={environment.id}
                    style={[styles.chip, environmentId === environment.id && styles.chipActive]}
                    onPress={() => setEnvironmentId(environment.id)}
                  >
                    <Text style={[styles.chipText, environmentId === environment.id && styles.chipTextActive]}>
                      {environment.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Prioridade</Text>
              <View style={styles.chips}>
                {PRIORITIES.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.chip, priority === option.value && styles.chipActive]}
                    onPress={() => setPriority(option.value)}
                  >
                    <Text style={[styles.chipText, priority === option.value && styles.chipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Responsável</Text>
              <View style={styles.chips}>
                <Pressable
                  style={[styles.chip, responsibleId === null && styles.chipActive]}
                  onPress={() => setResponsibleId(null)}
                >
                  <Text style={[styles.chipText, responsibleId === null && styles.chipTextActive]}>
                    Não definido
                  </Text>
                </Pressable>
                {operationalParticipants.map((participant) => (
                  <Pressable
                    key={participant.user_id}
                    style={[styles.chip, responsibleId === participant.user_id && styles.chipActive]}
                    onPress={() => setResponsibleId(participant.user_id)}
                  >
                    <Text style={[styles.chipText, responsibleId === participant.user_id && styles.chipTextActive]}>
                      {participant.full_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Prazo</Text>
              <View style={styles.dateRow}>
                <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
                  <Ionicons name="calendar-outline" size={18} color="#4937D8" />
                  <Text style={styles.dateText}>{formatDate(dueDate)}</Text>
                </Pressable>
                {!!dueDate && (
                  <Pressable style={styles.clearDateButton} onPress={() => setDueDate(null)}>
                    <Text style={styles.clearDateText}>Limpar</Text>
                  </Pressable>
                )}
              </View>
              {showDatePicker && (
                <DateTimePicker
                  value={toDateValue(dueDate)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(_event, value) => {
                    if (Platform.OS !== 'ios') setShowDatePicker(false);
                    if (value) setDueDate(toIsoDate(value));
                  }}
                />
              )}

              <View style={styles.switchRow}>
                <View style={styles.switchIdentity}>
                  <Text style={styles.switchTitle}>Impede a entrega</Text>
                  <Text style={styles.switchHelp}>
                    Destaca esta pendência como bloqueio da obra.
                  </Text>
                </View>
                <Switch
                  value={blocksDelivery}
                  onValueChange={setBlocksDelivery}
                  trackColor={{ false: '#D6DAE2', true: '#BEB7F4' }}
                  thumbColor={blocksDelivery ? '#4937D8' : '#FFFFFF'}
                />
              </View>

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveItem}
                disabled={saving}
              >
                <Text style={styles.saveText}>
                  {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar pendência'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 90, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: '#7A8394' },
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#F3F2FC' },
  summaryNumber: { fontSize: 22, fontWeight: '900', color: '#4937D8' },
  summaryLabel: { marginTop: 2, fontSize: 10, color: '#666180' },
  newButton: { minHeight: 46, marginTop: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: '#4937D8' },
  newButtonText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  tabs: { marginTop: 13, flexDirection: 'row', gap: 8 },
  tab: { minHeight: 40, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F0F2F5' },
  tabActive: { backgroundColor: '#ECE9FF' },
  tabText: { fontSize: 10, fontWeight: '700', color: '#737C8D' },
  tabTextActive: { color: '#4937D8' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 11, lineHeight: 16, color: '#B42318' },
  emptyCard: { marginTop: 10, padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: '#F6F7F9' },
  emptyTitle: { fontSize: 12, fontWeight: '700', color: '#70798B' },
  itemCard: { marginTop: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E0E3E9', borderRadius: 13, backgroundColor: '#FFFFFF' },
  itemHeader: { minHeight: 72, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemIdentity: { flex: 1 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  priority_low: { backgroundColor: '#EEF4F8' },
  priority_normal: { backgroundColor: '#F0EEFF' },
  priority_high: { backgroundColor: '#FFF0E6' },
  priority_urgent: { backgroundColor: '#FFE9E6' },
  priorityText: { fontSize: 8, fontWeight: '800', color: '#4D5668' },
  blockBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FFE1DD' },
  blockText: { fontSize: 8, fontWeight: '900', color: '#B42318' },
  itemTitle: { marginTop: 6, fontSize: 13, fontWeight: '800', color: '#202B3D' },
  itemMeta: { marginTop: 3, fontSize: 10, color: '#798294' },
  itemBody: { padding: 12, paddingTop: 2, borderTopWidth: 1, borderTopColor: '#ECEEF2' },
  description: { marginTop: 9, fontSize: 12, lineHeight: 17, color: '#4F5B70' },
  detail: { marginTop: 8, fontSize: 10, color: '#707A8E' },
  itemActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  editButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#CDC8F2', borderRadius: 11 },
  editText: { fontSize: 11, fontWeight: '800', color: '#4937D8' },
  finishButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#4937D8' },
  finishText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 25, 43, 0.38)' },
  modalCard: { maxHeight: '92%', padding: 18, paddingBottom: 26, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 21, fontWeight: '900', color: '#172033' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F2F5' },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800', color: '#536078' },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, fontSize: 13, color: '#202B3D', backgroundColor: '#FAFBFC' },
  textarea: { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE0E7', borderRadius: 999, backgroundColor: '#FFFFFF' },
  chipActive: { borderColor: '#4937D8', backgroundColor: '#ECE9FF' },
  chipText: { fontSize: 10, fontWeight: '700', color: '#697386' },
  chipTextActive: { color: '#4937D8' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateButton: { minHeight: 44, flex: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: '#DCE0E7', borderRadius: 11 },
  dateText: { fontSize: 11, fontWeight: '700', color: '#4F5B70' },
  clearDateButton: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  clearDateText: { fontSize: 10, fontWeight: '800', color: '#B42318' },
  switchRow: { marginTop: 17, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, backgroundColor: '#F4F3FC' },
  switchIdentity: { flex: 1 },
  switchTitle: { fontSize: 12, fontWeight: '800', color: '#2B3548' },
  switchHelp: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#70798C' },
  saveButton: { minHeight: 50, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#4937D8' },
  disabledButton: { opacity: 0.55 },
  saveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
