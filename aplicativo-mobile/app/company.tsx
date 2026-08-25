import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type CompanyContext = { company_id: string; company_name: string; relationship_type: string; company_role: string | null; role_title: string | null; is_active: boolean; is_archived: boolean; can_manage: boolean };

export default function CompanyScreen() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setMessage('');
    const { data, error } = await supabase.rpc('get_my_company_profiles_for_management');
    if (error) setMessage(error.message); else setCompanies((data ?? []) as CompanyContext[]);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function changeCompany(company: CompanyContext, action: 'archive' | 'restore' | 'delete') {
    const run = async () => {
      const result = await supabase.rpc('manage_my_company_profile', { p_company_id: company.company_id, p_action: action });
      if (result.error) setMessage(result.error.message); else await load();
    };
    if (action === 'restore') { await run(); return; }
    Alert.alert(action === 'delete' ? 'Excluir empresa?' : 'Arquivar empresa?', action === 'delete' ? 'A empresa sairá da sua conta, mas o histórico de obras e equipe será preservado para recuperação.' : 'Ela deixará as áreas ativas e poderá ser restaurada depois.', [{ text: 'Cancelar', style: 'cancel' }, { text: action === 'delete' ? 'Excluir' : 'Arquivar', style: action === 'delete' ? 'destructive' : 'default', onPress: () => void run() }]);
  }

  return (
    <View style={styles.page}>
      <FioPageHeader eyebrow="ÁREA EMPRESARIAL" title="Empresa" subtitle="Perfis empresariais separados do seu perfil pessoal." />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.newCompanyButton} onPress={() => router.push('/create-company')}><Ionicons name="add-circle-outline" size={19} color={FioColors.textOnAccent} /><Text style={styles.newCompanyText}>Adicionar nova empresa</Text></Pressable>
        {loading ? <ActivityIndicator color={FioColors.gold} /> : companies.length === 0 ? (
          <View style={styles.empty}><Ionicons name="storefront-outline" size={29} color={FioColors.gold} /><Text style={styles.emptyTitle}>Crie o perfil da sua loja</Text><Text style={styles.emptyText}>Tenha uma página própria para empresa, equipe, obras, mensagens e agenda.</Text><Pressable style={styles.linkButton} onPress={() => router.push('/create-company')}><Text style={styles.linkButtonText}>Criar perfil da loja</Text></Pressable><Pressable style={styles.secondaryLinkButton} onPress={() => router.push('/links')}><Text style={styles.secondaryLinkButtonText}>Tenho um convite ou vínculo</Text></Pressable></View>
        ) : companies.map((company) => (
          <View key={company.company_id} style={[styles.companyWrap, company.is_archived && styles.archivedWrap]}><Pressable style={styles.companyCard} disabled={company.is_archived} onPress={() => router.push({ pathname: '/company-public-profile', params: { companyId: company.company_id } })}>
            <View style={styles.companyIcon}><Ionicons name="storefront-outline" size={22} color={FioColors.green} /></View>
            <View style={styles.companyIdentity}><Text style={styles.companyName}>{company.company_name}</Text><Text style={styles.companyRole}>{company.role_title || company.company_role || (company.relationship_type === 'member' ? 'Membro' : 'Colaborador')}</Text></View>
            <View style={styles.activeBadge}><Text style={styles.activeText}>{company.is_archived ? 'Arquivada' : company.is_active ? 'Em uso' : 'Ativa'}</Text></View>
            <Ionicons name="chevron-forward-outline" size={19} color={FioColors.textSoft} />
          </Pressable>{company.can_manage && <View style={styles.actions}>{company.is_archived ? <Pressable style={styles.actionButton} onPress={() => void changeCompany(company, 'restore')}><Text style={styles.actionText}>Restaurar</Text></Pressable> : <Pressable style={styles.actionButton} onPress={() => void changeCompany(company, 'archive')}><Text style={styles.actionText}>Arquivar</Text></Pressable>}<Pressable style={styles.deleteButton} onPress={() => void changeCompany(company, 'delete')}><Text style={styles.deleteText}>Excluir</Text></Pressable></View>}</View>
        ))}
        {!!message && <Text style={styles.error}>{message}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas }, content: { width: '100%', maxWidth: 780, alignSelf: 'center', padding: 16, paddingTop: 24, gap: 10 },
  newCompanyButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: FioColors.green }, newCompanyText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  companyWrap: { overflow: 'hidden', borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, archivedWrap: { opacity: 0.72 },
  companyCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
  companyIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: FioColors.greenSoft }, companyIdentity: { flex: 1 }, companyName: { fontSize: 14, fontWeight: '900', color: FioColors.text }, companyRole: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: FioColors.greenSoft }, activeText: { fontSize: 8, fontWeight: '900', color: FioColors.green },
  actions: { minHeight: 40, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 11, paddingBottom: 10 }, actionButton: { justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: FioColors.surfaceMuted }, actionText: { fontSize: 9, fontWeight: '900', color: FioColors.gold }, deleteButton: { justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: FioColors.dangerSoft }, deleteText: { fontSize: 9, fontWeight: '900', color: FioColors.danger },
  empty: { alignItems: 'center', padding: 30, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface }, emptyTitle: { marginTop: 11, fontSize: 16, fontWeight: '900', color: FioColors.text }, emptyText: { marginTop: 6, textAlign: 'center', fontSize: 11, lineHeight: 17, color: FioColors.textMuted },
  linkButton: { minHeight: 42, marginTop: 14, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 11, backgroundColor: FioColors.green }, linkButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.textOnAccent }, secondaryLinkButton: { minHeight: 38, marginTop: 8, justifyContent: 'center', paddingHorizontal: 14, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 }, secondaryLinkButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.green }, error: { padding: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft },
});
