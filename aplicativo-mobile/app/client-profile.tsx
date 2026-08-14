import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type ClientProfile = {
  id: string;
  code: string;
  client_name: string;
  client_phone: string;
  address: string;
  status: string;
};

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'C';
}

export default function ClientProfileScreen() {
  const router = useRouter();
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!workId) {
      setMessage('Cliente não encontrado.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage('');
    const { data, error } = await supabase
      .from('works')
      .select('id, code, client_name, client_phone, address, status')
      .eq('id', workId)
      .maybeSingle();
    if (error) setMessage(error.message);
    else setClient(data as ClientProfile | null);
    setLoading(false);
  }, [workId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="PERFIL DO CLIENTE"
        title="Cliente"
        subtitle="Visão simplificada, separada dos perfis pessoal, profissional e empresarial."
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={FioColors.gold} />
        ) : client ? (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.initials}>{initials(client.client_name)}</Text>
            </View>
            <Text style={styles.name}>{client.client_name}</Text>
            <Text style={styles.code}>Cliente na obra {client.code}</Text>
            <View style={styles.data}>
              <Data icon="call-outline" label="Telefone" value={client.client_phone || 'Não informado'} />
              <Data icon="location-outline" label="Endereço da obra" value={client.address} />
            </View>
            <Pressable
              style={styles.workButton}
              onPress={() =>
                router.replace({ pathname: '/works/[id]', params: { id: client.id } })
              }
            >
              <Text style={styles.workButtonText}>Voltar à Central da obra</Text>
              <Ionicons name="arrow-forward-outline" size={17} color={FioColors.white} />
            </Pressable>
          </View>
        ) : (
          <Text style={styles.error}>{message || 'Cliente não encontrado.'}</Text>
        )}
      </ScrollView>
    </View>
  );
}

function Data({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Ionicons name={icon} size={18} color={FioColors.green} />
      <View style={styles.dataIdentity}>
        <Text style={styles.dataLabel}>{label}</Text>
        <Text style={styles.dataValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 16, paddingTop: 24 },
  card: { alignItems: 'center', padding: 22, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  avatar: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.goldSoft },
  initials: { fontSize: 25, fontWeight: '900', color: FioColors.ink },
  name: { marginTop: 13, fontSize: 22, fontWeight: '900', color: FioColors.text },
  code: { marginTop: 4, fontSize: 10, color: FioColors.textMuted },
  data: { width: '100%', marginTop: 21, gap: 8 },
  dataRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 12, backgroundColor: FioColors.surfaceMuted },
  dataIdentity: { flex: 1 },
  dataLabel: { fontSize: 8, fontWeight: '800', color: FioColors.textMuted },
  dataValue: { marginTop: 3, fontSize: 11, lineHeight: 16, fontWeight: '700', color: FioColors.text },
  workButton: { width: '100%', minHeight: 46, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: FioColors.ink },
  workButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.white },
  error: { padding: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft },
});
