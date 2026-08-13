import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { WorkEnvironment } from '@/components/work-central/types';
import { supabase } from '@/lib/supabase';

type TimelineFilter = 'all' | 'general' | string;

type WorkEvent = {
  id: string;
  environment_id: string | null;
  environment_name: string | null;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_user_id: string | null;
  actor_full_name: string | null;
  visibility: string | null;
  created_at: string;
};

function formatDay(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function eventIcon(eventType: string | null): keyof typeof Ionicons.glyphMap {
  if (eventType?.startsWith('FOTO_')) return 'camera-outline';
  if (eventType?.startsWith('PENDENCIA_')) return 'alert-circle-outline';
  if (eventType?.includes('AMBIENTE')) return 'grid-outline';
  if (eventType?.includes('PARTICIPANTE')) return 'people-outline';
  if (eventType === 'DIARIO_REGISTRO_MANUAL') return 'create-outline';
  return 'pulse-outline';
}

export function WorkTimelinePanel({
  workId,
  environments,
  canWrite,
}: {
  workId: string;
  environments: WorkEnvironment[];
  canWrite: boolean;
}) {
  const [events, setEvents] = useState<WorkEvent[]>([]);
  const [filter, setFilter] = useState<TimelineFilter>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase.rpc('get_work_timeline', {
      p_work_id: workId,
    });

    if (error) {
      setMessage(error.message);
      setEvents([]);
    } else {
      setEvents((data ?? []) as WorkEvent[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, [workId]);

  const visibleEvents = useMemo(() => {
    if (filter === 'all') return events;
    if (filter === 'general') {
      return events.filter((event) => !event.environment_id);
    }
    return events.filter((event) => event.environment_id === filter);
  }, [events, filter]);

  const groupedEvents = useMemo(() => {
    const groups: Array<{
      day: string;
      events: WorkEvent[];
    }> = [];

    for (const event of visibleEvents) {
      const day = formatDay(event.created_at);
      const existing = groups.find((group) => group.day === day);
      if (existing) existing.events.push(event);
      else groups.push({ day, events: [event] });
    }
    return groups;
  }, [visibleEvents]);

  function openForm() {
    setTitle('');
    setDescription('');
    setEnvironmentId(null);
    setMessage('');
    setFormVisible(true);
  }

  async function saveEntry() {
    if (!canWrite || saving) return;
    if (!title.trim()) {
      setMessage('Informe o título da atualização.');
      return;
    }

    setSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('create_work_diary_entry', {
      p_work_id: workId,
      p_environment_id: environmentId,
      p_title: title.trim(),
      p_description: description.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setFormVisible(false);
    setTitle('');
    setDescription('');
    setEnvironmentId(null);
    await loadEvents();
    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#4937D8" />
        <Text style={styles.muted}>Carregando o FIO...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{events.length}</Text>
          <Text style={styles.summaryLabel}>Atualizações recentes</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {events.filter((event) => event.event_type === 'DIARIO_REGISTRO_MANUAL').length}
          </Text>
          <Text style={styles.summaryLabel}>Registros manuais</Text>
        </View>
      </View>

      {canWrite && (
        <Pressable style={styles.newButton} onPress={openForm}>
          <Ionicons name="create-outline" size={19} color="#FFFFFF" />
          <Text style={styles.newButtonText}>Registrar atualização</Text>
        </Pressable>
      )}

      <Text style={styles.filterLabel}>FILTRAR POR</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        <Pressable
          style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            Tudo
          </Text>
        </Pressable>
        <Pressable
          style={[styles.filterChip, filter === 'general' && styles.filterChipActive]}
          onPress={() => setFilter('general')}
        >
          <Text style={[styles.filterText, filter === 'general' && styles.filterTextActive]}>
            Geral da obra
          </Text>
        </Pressable>
        {environments.map((environment) => (
          <Pressable
            key={environment.id}
            style={[styles.filterChip, filter === environment.id && styles.filterChipActive]}
            onPress={() => setFilter(environment.id)}
          >
            <Text style={[styles.filterText, filter === environment.id && styles.filterTextActive]}>
              {environment.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      {groupedEvents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nenhuma atualização neste filtro</Text>
        </View>
      ) : (
        groupedEvents.map((group) => (
          <View key={group.day} style={styles.dayGroup}>
            <Text style={styles.dayTitle}>{group.day}</Text>
            {group.events.map((event, index) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={styles.timelineColumn}>
                  <View style={styles.eventIcon}>
                    <Ionicons
                      name={eventIcon(event.event_type)}
                      size={16}
                      color="#FFFFFF"
                    />
                  </View>
                  {index < group.events.length - 1 && (
                    <View style={styles.timelineLine} />
                  )}
                </View>

                <View style={styles.eventCard}>
                  <View style={styles.eventTop}>
                    <Text style={styles.eventTitle}>
                      {event.title || 'Atualização da obra'}
                    </Text>
                    <Text style={styles.eventTime}>
                      {formatTime(event.created_at)}
                    </Text>
                  </View>
                  {!!event.description && (
                    <Text style={styles.eventDescription}>{event.description}</Text>
                  )}
                  <View style={styles.eventMetaRow}>
                    <Text style={styles.eventScope}>
                      {event.environment_name || 'Geral da obra'}
                    </Text>
                    <Text style={styles.eventActor}>
                      {event.actor_full_name || 'Usuário do FIO'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ))
      )}

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Nova atualização</Text>
                <Text style={styles.modalSubtitle}>
                  Este registro entrará na linha do tempo.
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setFormVisible(false)}>
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Título *</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Materiais recebidos"
                placeholderTextColor="#98A0AE"
                maxLength={160}
              />

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Conte o que aconteceu"
                placeholderTextColor="#98A0AE"
                multiline
              />

              <Text style={styles.label}>Onde aconteceu?</Text>
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

              <Pressable
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={saveEntry}
                disabled={saving}
              >
                <Text style={styles.saveText}>
                  {saving ? 'Registrando...' : 'Registrar no FIO'}
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
  filterLabel: { marginTop: 15, fontSize: 9, fontWeight: '900', letterSpacing: 1, color: '#727B8D' },
  filters: { paddingTop: 7, paddingBottom: 2, gap: 7 },
  filterChip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 999 },
  filterChipActive: { borderColor: '#4937D8', backgroundColor: '#ECE9FF' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#717B8E' },
  filterTextActive: { color: '#4937D8' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 11, color: '#B42318' },
  emptyCard: { marginTop: 10, padding: 18, alignItems: 'center', borderRadius: 12, backgroundColor: '#F6F7F9' },
  emptyTitle: { fontSize: 11, fontWeight: '700', color: '#727C8E' },
  dayGroup: { marginTop: 15 },
  dayTitle: { marginBottom: 7, fontSize: 10, fontWeight: '900', color: '#5C6679', textTransform: 'capitalize' },
  eventRow: { flexDirection: 'row', gap: 9 },
  timelineColumn: { width: 30, alignItems: 'center' },
  eventIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#4937D8', zIndex: 2 },
  timelineLine: { width: 2, flex: 1, minHeight: 40, backgroundColor: '#DDD9F6' },
  eventCard: { flex: 1, marginBottom: 10, padding: 11, borderWidth: 1, borderColor: '#E1E4EA', borderRadius: 12, backgroundColor: '#FFFFFF' },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  eventTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: '#263146' },
  eventTime: { fontSize: 9, color: '#8B93A2' },
  eventDescription: { marginTop: 5, fontSize: 11, lineHeight: 16, color: '#5E687B' },
  eventMetaRow: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 5 },
  eventScope: { fontSize: 9, fontWeight: '800', color: '#4937D8' },
  eventActor: { fontSize: 9, color: '#7C8596' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 25, 43, 0.38)' },
  modalCard: { maxHeight: '88%', padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: '#172033' },
  modalSubtitle: { marginTop: 3, fontSize: 10, color: '#727C8E' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F2F5' },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800', color: '#536078' },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, fontSize: 13, color: '#202B3D', backgroundColor: '#FAFBFC' },
  textarea: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DCE0E7', borderRadius: 999 },
  chipActive: { borderColor: '#4937D8', backgroundColor: '#ECE9FF' },
  chipText: { fontSize: 10, fontWeight: '700', color: '#697386' },
  chipTextActive: { color: '#4937D8' },
  saveButton: { minHeight: 50, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#4937D8' },
  disabledButton: { opacity: 0.55 },
  saveText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
});
