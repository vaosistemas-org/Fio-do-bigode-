import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type ProfessionalData = { fullName: string; jobTitle: string; coverageArea: string; avatarUrl: string | null; enabled: boolean };

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F';
}

export default function MyProfessionalProfileScreen() {
  const router = useRouter();
  const { preview } = useLocalSearchParams<{ preview?: string }>();
  const [data, setData] = useState<ProfessionalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      router.replace({
        pathname: '/public-profile',
        params: { userId: data.user.id, preview: '1' },
      });
    });
    return () => { active = false; };
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setMessage('Conta não encontrada.'); setLoading(false); return; }
    const result = await supabase.from('profiles').select('full_name, job_title, coverage_area, avatar_url, professional_profile_enabled').eq('id', authData.user.id).maybeSingle();
    if (result.error) setMessage(result.error.message);
    else setData({ fullName: result.data?.full_name ?? '', jobTitle: result.data?.job_title ?? '', coverageArea: result.data?.coverage_area ?? '', avatarUrl: result.data?.avatar_url ?? null, enabled: Boolean(result.data?.professional_profile_enabled) });
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.page}>
      <FioPageHeader eyebrow={preview ? 'PRÉVIA PÚBLICA' : 'PERFIL PÚBLICO'} title="Perfil profissional" subtitle="Separado do seu Meu perfil privado." />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <ActivityIndicator color={FioColors.gold} /> : data && (
          <View style={styles.card}>
            {!data.enabled && <View style={styles.previewBadge}><Ionicons name="eye-off-outline" size={13} color="#76571F" /><Text style={styles.previewText}>Desativado · somente prévia</Text></View>}
            <View style={styles.identity}>
              <View style={styles.avatarFrame}>{data.avatarUrl ? <Image source={{ uri: data.avatarUrl }} style={styles.avatar} /> : <Text style={styles.initials}>{initials(data.fullName)}</Text>}</View>
              <Text style={styles.name}>{data.fullName}</Text>
              <Text style={styles.role}>{data.jobTitle || 'Profissional do FIO'}</Text>
              <View style={styles.location}><Ionicons name="location-outline" size={15} color={FioColors.textMuted} /><Text style={styles.locationText}>{data.coverageArea || 'Área não informada'}</Text></View>
            </View>
            <View style={styles.publicInfo}><Ionicons name="information-circle-outline" size={18} color={FioColors.green} /><Text style={styles.publicText}>Esta tela mostra somente dados profissionais. Telefone, e-mail e dados privados continuam protegidos.</Text></View>
            <Pressable style={styles.editButton} onPress={() => router.push('/edit-my-professional-profile')}><Ionicons name="create-outline" size={17} color={FioColors.white} /><Text style={styles.editText}>Editar dados profissionais</Text></Pressable>
          </View>
        )}
        {!!message && <Text style={styles.error}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 700, alignSelf: 'center', padding: 16, paddingTop: 24 },
  card: { padding: 22, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface, ...FioShadow },
  previewBadge: { alignSelf: 'flex-end', minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: FioColors.goldSoft },
  previewText: { fontSize: 9, fontWeight: '900', color: '#76571F' },
  identity: { alignItems: 'center' },
  avatarFrame: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: FioColors.goldSoft, borderRadius: 999, backgroundColor: FioColors.gold },
  avatar: { width: '100%', height: '100%' }, initials: { fontSize: 27, fontWeight: '900', color: FioColors.ink },
  name: { marginTop: 14, fontSize: 23, fontWeight: '900', color: FioColors.text },
  role: { marginTop: 4, fontSize: 13, fontWeight: '800', color: FioColors.green },
  location: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }, locationText: { fontSize: 11, color: FioColors.textMuted },
  publicInfo: { marginTop: 22, flexDirection: 'row', gap: 8, padding: 13, borderRadius: 12, backgroundColor: FioColors.greenSoft }, publicText: { flex: 1, fontSize: 10, lineHeight: 15, color: FioColors.green },
  editButton: { minHeight: 46, marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, backgroundColor: FioColors.green }, editText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  error: { padding: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft },
});
