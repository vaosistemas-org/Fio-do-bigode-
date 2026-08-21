import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  supabase,
  supabasePublishableKey,
  supabaseUrl,
} from '@/lib/supabase';

type PublicPhoto = {
  id: string;
  file_name: string | null;
  url?: string | null;
};

type PublicEvent = {
  id: string;
  event_type: string | null;
  title: string | null;
  description: string | null;
  environment_name: string | null;
  actor_full_name: string;
  created_at: string;
  photos: PublicPhoto[];
};

type PublicDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  environment_name: string | null;
  allow_download: boolean;
  current_version: number;
  version_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  updated_at: string;
};

type PublicFio = {
  work: {
    code: string;
    title: string;
    status: string;
    progress: number;
    updated_at: string;
  };
  events: PublicEvent[];
  documents: PublicDocument[];
};

function dayKey(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

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

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    agendada: 'Agendada',
    em_andamento: 'Em andamento',
    aguardando_peca: 'Aguardando peça',
    aguardando_cliente: 'Aguardando cliente',
    finalizada: 'Finalizada',
  };
  return labels[value] ?? value;
}

async function getPublicFileUrl(
  token: string,
  kind: 'document' | 'photo',
  id: string
) {
  const query = new URLSearchParams({ token, kind, id });
  const response = await fetch(
    `${supabaseUrl}/functions/v1/work-public-file?${query.toString()}`,
    {
      headers: {
        apikey: supabasePublishableKey,
      },
    }
  );
  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    throw new Error(payload.error ?? 'Arquivo indisponível.');
  }
  return payload.url;
}

export default function PublicFioScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<PublicFio | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);

  async function load() {
    if (!token) {
      setMessage('Link inválido.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage('');
    const { data: result, error } = await supabase.rpc('get_public_work_fio', {
      p_token: token,
    });
    if (error || !result) {
      setData(null);
      setMessage(error?.message ?? 'Este link não está mais disponível.');
      setLoading(false);
      return;
    }

    const fio = result as PublicFio;
    const events = await Promise.all(
      fio.events.map(async (event) => ({
        ...event,
        photos: await Promise.all(
          event.photos.map(async (photo) => {
            try {
              const url = await getPublicFileUrl(token, 'photo', photo.id);
              return { ...photo, url };
            } catch {
              return { ...photo, url: null };
            }
          })
        ),
      }))
    );
    setData({ ...fio, events });
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [token]);

  const dayGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; events: PublicEvent[] }> = [];
    for (const event of data?.events ?? []) {
      const key = dayKey(event.created_at);
      let group = groups.find((item) => item.key === key);
      if (!group) {
        group = { key, label: formatDay(event.created_at), events: [] };
        groups.push(group);
      }
      group.events.push(event);
    }
    return groups;
  }, [data]);

  async function openDocument(document: PublicDocument) {
    if (!token || openingId) return;
    setOpeningId(document.id);
    setMessage('');
    try {
      const url = await getPublicFileUrl(token, 'document', document.version_id);
      await Linking.openURL(url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Arquivo indisponível.');
    } finally {
      setOpeningId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator color="#74B892" />
          <Text style={styles.loadingText}>Abrindo o FIO da obra...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.invalidIcon}>
            <Ionicons name="link-outline" size={30} color="#74B892" />
          </View>
          <Text style={styles.invalidTitle}>Link indisponível</Text>
          <Text style={styles.invalidText}>{message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}>
            <Text style={styles.brandLetter}>F</Text>
          </View>
          <View>
            <Text style={styles.brandName}>FIO</Text>
            <Text style={styles.readOnly}>Visualização somente leitura</Text>
          </View>
        </View>

        <View style={styles.workCard}>
          <Text style={styles.workCode}>{data.work.code}</Text>
          <Text style={styles.workTitle}>{data.work.title}</Text>
          <View style={styles.workMetaRow}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{statusLabel(data.work.status)}</Text>
            </View>
            <Text style={styles.progressLabel}>{data.work.progress}% concluída</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${data.work.progress}%` }]} />
          </View>
          <Text style={styles.privacyNote}>
            Este link mostra somente informações liberadas no FIO geral. Dados internos da obra e das empresas não aparecem aqui.
          </Text>
        </View>

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        {data.documents.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="document-text-outline" size={21} color="#74B892" />
              <Text style={styles.sectionTitle}>Documentos da obra</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{data.documents.length}</Text>
              </View>
            </View>
            {data.documents.map((document) => (
              <View key={document.id} style={styles.documentCard}>
                <View style={styles.documentIdentity}>
                  <Text style={styles.documentTitle}>{document.title}</Text>
                  <Text style={styles.documentMeta}>
                    {document.environment_name || 'Geral da obra'} · v{document.current_version}
                  </Text>
                  {!!document.description && (
                    <Text numberOfLines={2} style={styles.documentDescription}>
                      {document.description}
                    </Text>
                  )}
                </View>
                <Pressable
                  style={styles.openButton}
                  disabled={openingId === document.id}
                  onPress={() => openDocument(document)}
                >
                  {openingId === document.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="eye-outline" size={18} color="#FFFFFF" />
                  )}
                </Pressable>
                <Text style={styles.downloadRule}>
                  {document.allow_download ? 'Download liberado' : 'Visualização'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="chatbubble-ellipses-outline" size={21} color="#74B892" />
            <Text style={styles.sectionTitle}>FIO / Diário</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{data.events.length}</Text>
            </View>
          </View>

          {dayGroups.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nenhuma atualização liberada.</Text>
            </View>
          ) : (
            dayGroups.map((group) => (
              <View key={group.key} style={styles.dayGroup}>
                <Text style={styles.dayTitle}>{group.label}</Text>
                {group.events.map((event) => (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventTop}>
                      <Text style={styles.eventTitle}>{event.title || 'Atualização da obra'}</Text>
                      <Text style={styles.eventTime}>{formatTime(event.created_at)}</Text>
                    </View>
                    {!!event.description && (
                      <Text style={styles.eventDescription}>{event.description}</Text>
                    )}
                    {event.photos.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
                        {event.photos.map((photo) =>
                          photo.url ? (
                            <Image key={photo.id} source={{ uri: photo.url }} style={styles.photo} />
                          ) : (
                            <View key={photo.id} style={styles.photoFallback}>
                              <Ionicons name="image-outline" size={24} color="#C79A45" />
                            </View>
                          )
                        )}
                      </ScrollView>
                    )}
                    <View style={styles.eventMeta}>
                      <Text style={styles.eventScope}>{event.environment_name || 'Geral da obra'}</Text>
                      <Text style={styles.eventActor}>{event.actor_full_name}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        <Text style={styles.footer}>Conteúdo compartilhado com segurança pelo FIO.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#242824' },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 40 },
  centered: { flex: 1, padding: 28, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 13, color: '#C0C7C1' },
  invalidIcon: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#30483A' },
  invalidTitle: { marginTop: 14, fontSize: 21, fontWeight: '900', color: '#F2F3EF' },
  invalidText: { maxWidth: 340, marginTop: 6, textAlign: 'center', fontSize: 12, lineHeight: 18, color: '#C0C7C1' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#74B892' },
  brandLetter: { fontSize: 21, fontWeight: '900', color: '#172119' },
  brandName: { fontSize: 16, fontWeight: '900', color: '#F2F3EF' },
  readOnly: { marginTop: 1, fontSize: 10, color: '#C0C7C1' },
  workCard: { marginTop: 16, padding: 18, borderWidth: 1, borderColor: '#4C534D', borderRadius: 18, backgroundColor: '#2E332F' },
  workCode: { fontSize: 10, fontWeight: '900', letterSpacing: 1.5, color: '#74B892' },
  workTitle: { marginTop: 4, fontSize: 24, fontWeight: '900', color: '#F2F3EF' },
  workMetaRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: '#30483A' },
  statusText: { fontSize: 10, fontWeight: '800', color: '#74B892' },
  progressLabel: { fontSize: 11, fontWeight: '800', color: '#F2F3EF' },
  progressTrack: { height: 7, marginTop: 9, overflow: 'hidden', borderRadius: 999, backgroundColor: '#383E39' },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#74B892' },
  privacyNote: { marginTop: 14, padding: 10, borderRadius: 10, fontSize: 9, lineHeight: 14, color: '#C0C7C1', backgroundColor: '#383E39' },
  errorCard: { marginTop: 12, padding: 11, borderRadius: 11, backgroundColor: '#4A2F2D' },
  errorText: { fontSize: 10, color: '#FF8D83' },
  section: { marginTop: 14, padding: 13, borderWidth: 1, borderColor: '#4C534D', borderRadius: 16, backgroundColor: '#2E332F' },
  sectionHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: '#F2F3EF' },
  countBadge: { minWidth: 25, paddingHorizontal: 7, paddingVertical: 4, alignItems: 'center', borderRadius: 999, backgroundColor: '#30483A' },
  countText: { fontSize: 10, fontWeight: '900', color: '#74B892' },
  documentCard: { marginTop: 8, padding: 11, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderWidth: 1, borderColor: '#4C534D', borderRadius: 12 },
  documentIdentity: { flex: 1, minWidth: 210 },
  documentTitle: { fontSize: 12, fontWeight: '800', color: '#F2F3EF' },
  documentMeta: { marginTop: 2, fontSize: 9, color: '#C0C7C1' },
  documentDescription: { marginTop: 5, fontSize: 9, lineHeight: 13, color: '#C0C7C1' },
  openButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#74B892' },
  downloadRule: { width: '100%', fontSize: 8, textAlign: 'right', color: '#929A93' },
  emptyCard: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 11, color: '#929A93' },
  dayGroup: { marginTop: 11 },
  dayTitle: { marginBottom: 6, fontSize: 11, fontWeight: '900', textTransform: 'capitalize', color: '#C0C7C1' },
  eventCard: { marginBottom: 8, padding: 11, borderWidth: 1, borderColor: '#4C534D', borderRadius: 12, backgroundColor: '#2E332F' },
  eventTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  eventTitle: { flex: 1, fontSize: 12, fontWeight: '800', color: '#F2F3EF' },
  eventTime: { fontSize: 9, color: '#929A93' },
  eventDescription: { marginTop: 5, fontSize: 10, lineHeight: 15, color: '#C0C7C1' },
  photos: { marginTop: 8, gap: 7 },
  photo: { width: 105, height: 82, borderRadius: 10, backgroundColor: '#383E39' },
  photoFallback: { width: 105, height: 82, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#30483A' },
  eventMeta: { marginTop: 8, paddingTop: 7, flexDirection: 'row', justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: '#4C534D' },
  eventScope: { flex: 1, fontSize: 8, fontWeight: '800', color: '#74B892' },
  eventActor: { flex: 1, textAlign: 'right', fontSize: 8, color: '#929A93' },
  footer: { marginTop: 18, textAlign: 'center', fontSize: 9, color: '#929A93' },
});
