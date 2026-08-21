import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Notification = { id: string; work_id: string | null; title: string; description: string | null; read_at: string | null; created_at: string };
const formatDate = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function NotificationsScreen() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    const result = await supabase.rpc('get_my_notifications');
    if (!result.error) setItems((result.data ?? []) as Notification[]);
    setLoading(false); setRefreshing(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  async function markRead(item: Notification) {
    if (item.read_at) return;
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, read_at: new Date().toISOString() } : value));
    await supabase.rpc('mark_fio_notification_read', { p_notification_id: item.id });
  }
  const unread = items.filter((item) => !item.read_at).length;
  return <View style={styles.page}>
    <FioPageHeader eyebrow="FIOS" title="Notificações" subtitle={unread ? `${unread} não lida${unread === 1 ? '' : 's'}` : 'Tudo em dia'} />
    {loading ? <ActivityIndicator style={styles.loading} color={FioColors.gold} /> : <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={FioColors.gold} />}>
      {items.length === 0 ? <View style={styles.empty}><Ionicons name="notifications-outline" size={30} color={FioColors.green} /><Text style={styles.emptyTitle}>Nenhuma notificação</Text><Text style={styles.emptyText}>Novas movimentações das suas obras aparecerão aqui.</Text></View> : items.map((item) => <Pressable key={item.id} style={[styles.card, !item.read_at && styles.unread]} onPress={() => markRead(item)}><View style={styles.icon}><Ionicons name={item.read_at ? 'notifications-outline' : 'notifications'} size={19} color={FioColors.green} /></View><View style={styles.body}><Text style={styles.title}>{item.title}</Text>{!!item.description && <Text style={styles.description}>{item.description}</Text>}<Text style={styles.date}>{formatDate(item.created_at)}</Text></View></Pressable>)}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: FioColors.canvas }, content: { padding: 12, paddingBottom: 80 }, loading: { marginTop: 40 }, card: { marginBottom: 8, padding: 12, flexDirection: 'row', gap: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: 14, backgroundColor: FioColors.surface }, unread: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft }, icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FioColors.surfaceMuted }, body: { flex: 1 }, title: { fontSize: 12, fontWeight: '900', color: FioColors.text }, description: { marginTop: 4, fontSize: 10, lineHeight: 15, color: FioColors.textMuted }, date: { marginTop: 6, fontSize: 9, color: FioColors.textSoft }, empty: { marginTop: 25, alignItems: 'center', padding: 28, borderRadius: 16, backgroundColor: FioColors.surface }, emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text }, emptyText: { marginTop: 5, textAlign: 'center', fontSize: 10, color: FioColors.textMuted } });
