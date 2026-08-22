import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type PublicProfile = {
  user_id: string;
  full_name: string;
  phone: string | null;
  job_title: string | null;
  coverage_area: string | null;
  avatar_url: string | null;
  professional_profile_enabled: boolean;
};

type PublicCompany = {
  company_id: string;
  company_name: string;
  role_title: string | null;
  relationship_status: string;
};

type Summary = { active_works: number; companies: number };

function initials(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F';
}

function DataRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Ionicons name={icon} size={19} color={FioColors.textMuted} />
      <Text style={styles.dataLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.dataValue}>{value}</Text>
    </View>
  );
}

function Counter({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return (
    <View style={styles.counter}>
      <Ionicons name={icon} size={22} color={FioColors.green} />
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

export default function PublicProfileScreen() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId?: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [summary, setSummary] = useState<Summary>({ active_works: 0, companies: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!userId || Array.isArray(userId)) {
      setMessage('Perfil não encontrado.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage('');
    const [profileResult, companiesResult, summaryResult] = await Promise.all([
      supabase.rpc('get_public_professional_profile', { p_user_id: userId }),
      supabase.rpc('get_public_professional_companies', { p_user_id: userId }),
      supabase.rpc('get_public_professional_summary', { p_user_id: userId }),
    ]);
    if (profileResult.error) {
      setMessage(profileResult.error.message);
      setProfile(null);
    } else {
      setProfile((profileResult.data?.[0] ?? null) as PublicProfile | null);
      if (!profileResult.data?.[0]) setMessage('Este perfil público está desativado.');
    }
    if (!companiesResult.error) setCompanies((companiesResult.data ?? []) as PublicCompany[]);
    if (!summaryResult.error && summaryResult.data?.[0]) setSummary(summaryResult.data[0] as Summary);
    setLoading(false);
  }, [userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function shareProfile() {
    if (!profile) return;
    await Share.share({ message: `Perfil de ${profile.full_name} no FIO — Gestão de Obras.` });
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={FioColors.gold} /><Text style={styles.loadingText}>Carregando perfil público...</Text></View>;
  }

  return (
    <View style={styles.page}>
      <FioPageHeader eyebrow="PERFIL PÚBLICO" title="Meu perfil" subtitle="Informações profissionais compartilhadas no FIO" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!!message && !profile && <View style={styles.errorCard}><Ionicons name="information-circle-outline" size={19} color={FioColors.orange} /><Text style={styles.errorText}>{message}</Text></View>}
        {profile && (
          <>
            <View style={styles.heroCard}>
              <View style={styles.heroTop}>
                <View style={styles.avatarFrame}>
                  {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <Text style={styles.avatarInitials}>{initials(profile.full_name)}</Text>}
                </View>
                <View style={styles.heroIdentity}>
                  <Text style={styles.name}>{profile.full_name}</Text>
                  <Text style={styles.role}>{profile.job_title || 'Profissional do FIO'}</Text>
                  <View style={styles.location}><Ionicons name="location-outline" size={16} color={FioColors.textMuted} /><Text style={styles.locationText}>{profile.coverage_area || 'Área não informada'}</Text></View>
                </View>
                <Pressable style={styles.moreButton} onPress={() => void shareProfile()}><Ionicons name="share-social-outline" size={20} color={FioColors.text} /></Pressable>
              </View>
              <View style={styles.heroLine} />
              <View style={styles.heroActions}>
                <Pressable style={styles.heroAction} onPress={() => void shareProfile()}><Ionicons name="share-outline" size={18} color={FioColors.green} /><Text style={styles.heroActionText}>Compartilhar</Text></Pressable>
                <Pressable style={styles.heroAction} onPress={() => router.push({ pathname: '/messages', params: { userId: profile.user_id } })}><Ionicons name="chatbubble-ellipses-outline" size={18} color={FioColors.orange} /><Text style={[styles.heroActionText, styles.orangeText]}>Enviar mensagem</Text></Pressable>
              </View>
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>DADOS BÁSICOS</Text>
              <DataRow icon="person-outline" label="Nome" value={profile.full_name} />
              {profile.phone && <DataRow icon="call-outline" label="Telefone" value={profile.phone} />}
              <DataRow icon="people-outline" label="Função" value={profile.job_title || 'Profissional do FIO'} />
              <DataRow icon="location-outline" label="Área de abrangência" value={profile.coverage_area || 'Não informada'} />
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>VÍNCULO PROFISSIONAL</Text>
              {companies.length === 0 ? <Text style={styles.emptyText}>Nenhum vínculo profissional público informado.</Text> : companies.map((company) => (
                <Pressable key={company.company_id} style={styles.companyCard} onPress={() => router.push({ pathname: '/professional-profile', params: { companyId: company.company_id } })}>
                  <View style={styles.companyLogo}><Text style={styles.companyLogoText}>{initials(company.company_name)}</Text></View>
                  <View style={styles.companyIdentity}><Text style={styles.companyName}>{company.company_name}</Text><Text style={styles.companyRole}>{company.role_title || 'Profissional'}</Text><View style={styles.approved}><Ionicons name="checkmark-circle-outline" size={14} color={FioColors.green} /><Text style={styles.approvedText}>{company.relationship_status}</Text></View></View>
                  <Ionicons name="chevron-forward-outline" size={19} color={FioColors.textMuted} />
                </Pressable>
              ))}
            </View>

            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>ATUAÇÃO NO FIO</Text>
              <View style={styles.counterRow}><Counter icon="business-outline" value={summary.active_works} label="Obras ativas" /><Counter icon="people-outline" value={summary.companies} label="Empresas" /></View>
            </View>
            <View style={styles.privacyNote}><Ionicons name="shield-checkmark-outline" size={18} color={FioColors.green} /><Text style={styles.privacyText}>Este perfil mostra somente informações profissionais autorizadas. Documentos internos, pendências privadas e dados de outras obras continuam protegidos.</Text></View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 14, paddingBottom: 70 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  heroCard: { padding: 16, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface, ...FioShadow },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarFrame: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: FioColors.greenSoft, borderRadius: 999, backgroundColor: FioColors.gold },
  avatar: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 25, fontWeight: '900', color: FioColors.ink },
  heroIdentity: { flex: 1, minWidth: 0 },
  name: { fontSize: 22, fontWeight: '900', color: FioColors.text },
  role: { marginTop: 3, fontSize: 13, fontWeight: '900', color: FioColors.green },
  location: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  locationText: { fontSize: 10, color: FioColors.textMuted },
  moreButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surfaceMuted },
  heroLine: { height: 1, marginTop: 16, backgroundColor: FioColors.line },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 11 },
  heroAction: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, backgroundColor: FioColors.greenSoft },
  heroActionText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  orangeText: { color: FioColors.orange },
  sectionCard: { marginTop: 12, padding: 15, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  sectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, color: FioColors.green },
  dataRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  dataLabel: { fontSize: 11, color: FioColors.textMuted },
  dataValue: { flex: 1, textAlign: 'right', fontSize: 11, fontWeight: '800', color: FioColors.text },
  companyCard: { marginTop: 11, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  companyLogo: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FioColors.ink },
  companyLogoText: { fontSize: 11, fontWeight: '900', color: FioColors.gold },
  companyIdentity: { flex: 1, minWidth: 0 },
  companyName: { fontSize: 14, fontWeight: '900', color: FioColors.text },
  companyRole: { marginTop: 2, fontSize: 10, color: FioColors.textMuted },
  approved: { marginTop: 5, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: FioColors.greenSoft },
  approvedText: { fontSize: 8, fontWeight: '900', color: FioColors.green },
  counterRow: { marginTop: 15, flexDirection: 'row' },
  counter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  counterValue: { fontSize: 22, fontWeight: '900', color: FioColors.text },
  counterLabel: { fontSize: 9, color: FioColors.textMuted },
  privacyNote: { marginTop: 12, flexDirection: 'row', gap: 8, padding: 13, borderRadius: 12, backgroundColor: FioColors.greenSoft },
  privacyText: { flex: 1, fontSize: 10, lineHeight: 15, color: FioColors.green },
  emptyText: { marginTop: 12, fontSize: 10, color: FioColors.textMuted },
  errorCard: { flexDirection: 'row', gap: 8, padding: 14, borderRadius: 13, backgroundColor: FioColors.orangeSoft },
  errorText: { flex: 1, fontSize: 11, lineHeight: 16, color: FioColors.orange },
});
