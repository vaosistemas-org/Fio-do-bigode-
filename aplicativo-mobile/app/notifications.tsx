import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type NotificationEntity = 'document' | 'visit' | 'pending' | 'message' | 'work';

type Notification = {
  id: string;
  work_id: string | null;
  event_id: string | null;
  event_type: string;
  entity_type: NotificationEntity;
  entity_id: string | null;
  target_section: string;
  title: string;
  description: string | null;
  read_at: string | null;
  created_at: string;
  can_confirm_visit: boolean;
  can_edit_visit: boolean;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function primaryLabel(item: Notification) {
  if (item.entity_type === 'message') return 'Abrir conversa';
  if (item.entity_type === 'document') return 'Abrir documento';
  if (item.entity_type === 'visit') return 'Abrir visita';
  if (item.entity_type === 'pending') return 'Abrir pendência';
  return 'Ver contexto';
}

function primaryIcon(item: Notification): keyof typeof Ionicons.glyphMap {
  if (item.entity_type === 'message') return 'chatbubble-outline';
  if (item.entity_type === 'document') return 'document-text-outline';
  if (item.entity_type === 'visit') return 'calendar-outline';
  if (item.entity_type === 'pending') return 'alert-circle-outline';
  return 'arrow-forward-outline';
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    const result = await supabase.rpc('get_my_notifications');
    if (!result.error) setItems((result.data ?? []) as Notification[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function markRead(item: Notification) {
    if (item.read_at) return;
    setItems((current) => current.map((value) =>
      value.id === item.id
        ? { ...value, read_at: new Date().toISOString() }
        : value
    ));
    await supabase.rpc('mark_fio_notification_read', {
      p_notification_id: item.id,
    });
  }

  async function openWork(item: Notification) {
    await markRead(item);
    if (!item.work_id) return;
    router.push({ pathname: '/works/[id]', params: { id: item.work_id } });
  }

  async function openPrimary(item: Notification) {
    await markRead(item);
    if (item.entity_type === 'message' && item.entity_id) {
      router.push({
        pathname: '/messages',
        params: { conversationId: item.entity_id },
      });
      return;
    }
    if (!item.work_id) return;

    if (item.entity_type === 'visit' && item.entity_id) {
      router.push({
        pathname: '/agenda',
        params: { workId: item.work_id, visitId: item.entity_id, action: 'manage' },
      });
      return;
    }

    router.push({
      pathname: '/works/[id]',
      params: {
        id: item.work_id,
        section: item.target_section,
        documentId: item.entity_type === 'document' ? item.entity_id ?? undefined : undefined,
        pendingId: item.entity_type === 'pending' ? item.entity_id ?? undefined : undefined,
      },
    });
  }

  async function confirmVisit(item: Notification) {
    if (!item.entity_id || actingId) return;
    setActingId(item.id);
    const result = await supabase.rpc('transition_work_visit', {
      p_visit_id: item.entity_id,
      p_action: 'confirm',
      p_new_starts_at: null,
      p_reason: null,
    });
    if (result.error) {
      Alert.alert('Não foi possível confirmar', result.error.message);
    } else {
      await markRead(item);
      Alert.alert('Visita confirmada', 'O agendamento foi confirmado e registrado no FIO.');
      await load();
    }
    setActingId(null);
  }

  async function editVisit(item: Notification) {
    await markRead(item);
    if (!item.work_id || !item.entity_id) return;
    router.push({
      pathname: '/agenda',
      params: { workId: item.work_id, visitId: item.entity_id, action: 'edit' },
    });
  }

  const unread = items.filter((item) => !item.read_at).length;

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="FIOS"
        title="Notificações"
        subtitle={unread ? `${unread} não lida${unread === 1 ? '' : 's'}` : 'Tudo em dia'}
      />
      {loading ? (
        <ActivityIndicator style={styles.loading} color={FioColors.gold} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={FioColors.gold}
            />
          }
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="notifications-outline" size={30} color={FioColors.green} />
              <Text style={styles.emptyTitle}>Nenhuma notificação</Text>
              <Text style={styles.emptyText}>Novas movimentações das suas obras aparecerão aqui.</Text>
            </View>
          ) : items.map((item) => (
            <View key={item.id} style={[styles.card, !item.read_at && styles.unread]}>
              <Pressable style={styles.cardMain} onPress={() => openPrimary(item)}>
                <View style={styles.icon}>
                  <Ionicons
                    name={item.read_at ? 'notifications-outline' : 'notifications'}
                    size={19}
                    color={FioColors.green}
                  />
                </View>
                <View style={styles.body}>
                  <Text style={styles.title}>{item.title}</Text>
                  {!!item.description && <Text style={styles.description}>{item.description}</Text>}
                  <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                </View>
              </Pressable>

              <View style={styles.actions}>
                <Pressable style={styles.primaryAction} onPress={() => openPrimary(item)}>
                  <Ionicons name={primaryIcon(item)} size={15} color={FioColors.textOnAccent} />
                  <Text style={styles.primaryActionText}>{primaryLabel(item)}</Text>
                </Pressable>
                {item.can_confirm_visit && (
                  <Pressable
                    style={styles.secondaryAction}
                    onPress={() => confirmVisit(item)}
                    disabled={actingId === item.id}
                  >
                    {actingId === item.id ? (
                      <ActivityIndicator size="small" color={FioColors.green} />
                    ) : (
                      <Ionicons name="checkmark-circle-outline" size={15} color={FioColors.green} />
                    )}
                    <Text style={styles.secondaryActionText}>Confirmar</Text>
                  </Pressable>
                )}
                {item.can_edit_visit && (
                  <Pressable style={styles.secondaryAction} onPress={() => editVisit(item)}>
                    <Ionicons name="create-outline" size={15} color={FioColors.green} />
                    <Text style={styles.secondaryActionText}>Alterar</Text>
                  </Pressable>
                )}
                {item.work_id && (
                  <Pressable style={styles.secondaryAction} onPress={() => openWork(item)}>
                    <Ionicons name="business-outline" size={15} color={FioColors.green} />
                    <Text style={styles.secondaryActionText}>Ver obra</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { padding: 12, paddingBottom: 80 },
  loading: { marginTop: 40 },
  card: { marginBottom: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: 14, backgroundColor: FioColors.surface, overflow: 'hidden' },
  unread: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  cardMain: { padding: 12, flexDirection: 'row', gap: 10 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FioColors.surfaceMuted },
  body: { flex: 1 },
  title: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  description: { marginTop: 4, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  date: { marginTop: 6, fontSize: 9, color: FioColors.textSoft },
  actions: { paddingHorizontal: 10, paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  primaryAction: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, backgroundColor: FioColors.green },
  primaryActionText: { fontSize: 10, fontWeight: '900', color: FioColors.textOnAccent },
  secondaryAction: { minHeight: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surface },
  secondaryActionText: { fontSize: 10, fontWeight: '800', color: FioColors.text },
  empty: { marginTop: 25, alignItems: 'center', padding: 28, borderRadius: 16, backgroundColor: FioColors.surface },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text },
  emptyText: { marginTop: 5, textAlign: 'center', fontSize: 10, color: FioColors.textMuted },
});
