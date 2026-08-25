import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type PublicProfile = {
  user_id: string;
  full_name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  bio: string | null;
  job_title: string | null;
  coverage_area: string | null;
  avatar_url: string | null;
  cover_url: string | null;
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

function Stat({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: number; label: string }) {
  return <View style={styles.stat}><Ionicons name={icon} size={18} color={FioColors.green} /><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

export default function PublicProfileScreen() {
  const router = useRouter();
  const { userId, preview } = useLocalSearchParams<{ userId?: string; preview?: string }>();
  const isOwnPreview = preview === '1';
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [summary, setSummary] = useState<Summary>({ active_works: 0, companies: 0 });
  const [activeTab, setActiveTab] = useState<'activities' | 'portfolio' | 'agenda' | 'messages'>('activities');
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
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
    const { data: authData } = await supabase.auth.getUser();
    const canPreviewOwnProfile = isOwnPreview && authData.user?.id === userId;
    const [profileResult, companiesResult, summaryResult] = await Promise.all([
      canPreviewOwnProfile
        ? supabase
            .from('profiles')
            .select('id, professional_name, professional_phone, professional_whatsapp, professional_email, professional_bio, job_title, coverage_area, professional_avatar_url, professional_cover_url, professional_profile_enabled')
            .eq('id', userId)
            .maybeSingle()
        : supabase.rpc('get_public_professional_profile', { p_user_id: userId }),
      supabase.rpc('get_public_professional_companies', { p_user_id: userId }),
      supabase.rpc('get_public_professional_summary', { p_user_id: userId }),
    ]);
    if (profileResult.error) {
      setMessage(profileResult.error.message);
      setProfile(null);
    } else {
      const row = canPreviewOwnProfile
        ? profileResult.data
        : Array.isArray(profileResult.data)
        ? profileResult.data[0]
        : null;
      setProfile(row ? {
        user_id: canPreviewOwnProfile ? row.id : row.user_id,
        full_name: (canPreviewOwnProfile ? row.professional_name : row.full_name) ?? 'Profissional do FIO',
        phone: (canPreviewOwnProfile ? row.professional_phone : row.phone) ?? null,
        whatsapp: (canPreviewOwnProfile ? row.professional_whatsapp : row.whatsapp) ?? null,
        email: (canPreviewOwnProfile ? row.professional_email : row.email) ?? null,
        bio: (canPreviewOwnProfile ? row.professional_bio : row.bio) ?? null,
        job_title: row.job_title ?? null,
        coverage_area: row.coverage_area ?? null,
        avatar_url: (canPreviewOwnProfile ? row.professional_avatar_url : row.avatar_url) ?? null,
        cover_url: (canPreviewOwnProfile ? row.professional_cover_url : row.cover_url) ?? null,
        professional_profile_enabled: Boolean(row.professional_profile_enabled),
      } : null);
      if (!row) setMessage('Este perfil público está desativado.');
    }
    if (!companiesResult.error) setCompanies((companiesResult.data ?? []) as PublicCompany[]);
    if (!summaryResult.error && summaryResult.data?.[0]) setSummary(summaryResult.data[0] as Summary);
    setLoading(false);
  }, [isOwnPreview, userId]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function shareProfile() {
    if (!profile) return;
    await Share.share({ message: `Perfil de ${profile.full_name} no FIO — Gestão de Obras.` });
  }

  async function startMessage() {
    if (!profile || !composerText.trim() || sendingMessage) return;
    setSendingMessage(true);
    const conversation = await supabase.rpc('open_public_direct_conversation', { p_user_id: profile.user_id });
    if (conversation.error || !conversation.data) {
      setMessage(conversation.error?.message ?? 'Não foi possível abrir a conversa.');
      setSendingMessage(false);
      return;
    }
    const sent = await supabase.rpc('send_fio_message', { p_conversation_id: conversation.data, p_body: composerText.trim(), p_message_type: 'text' });
    setSendingMessage(false);
    if (sent.error) { setMessage(sent.error.message); return; }
    setComposerText('');
    setComposerOpen(false);
    router.push({ pathname: '/messages', params: { conversationId: String(conversation.data) } });
  }

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={FioColors.gold} /><Text style={styles.loadingText}>Carregando perfil público...</Text></View>;
  }

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.publicTop}>
          <Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color={FioColors.text} /></Pressable>
          <View style={styles.publicBrand}><Text style={styles.publicBrandName}>Fio do Bigode</Text><Text style={styles.publicBrandCaption}>Conectando obras, pessoas e histórias.</Text></View>
          <View style={styles.publicTopActions}><Ionicons name="calendar-outline" size={20} color={FioColors.text} /><Ionicons name="chatbubble-ellipses-outline" size={20} color={FioColors.text} /></View>
        </View>
        {!!message && !profile && <View style={styles.errorCard}><Ionicons name="information-circle-outline" size={19} color={FioColors.orange} /><Text style={styles.errorText}>{message}</Text></View>}
        {profile && (
          <>
            <View style={styles.coverBanner}>{profile.cover_url ? <Image source={{ uri: profile.cover_url }} style={styles.coverImage} /> : null}<View style={styles.coverShade}><View><Text style={styles.coverEyebrow}>{isOwnPreview ? 'PRÉVIA DO PERFIL' : 'PERFIL PÚBLICO'}</Text><Text style={styles.coverTitle}>FIO</Text></View><Ionicons name="construct-outline" size={42} color={FioColors.gold} /></View></View>
            <View style={styles.heroCard}>
              {isOwnPreview && !profile.professional_profile_enabled && <View style={styles.previewBadge}><Ionicons name="eye-off-outline" size={13} color={FioColors.orange} /><Text style={styles.previewBadgeText}>Desativado · somente você vê esta prévia</Text></View>}
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
                <Pressable style={styles.heroAction} onPress={() => isOwnPreview ? router.push('/edit-my-professional-profile') : setComposerOpen(true)}><Ionicons name={isOwnPreview ? 'create-outline' : 'chatbubble-ellipses-outline'} size={18} color={FioColors.orange} /><Text style={[styles.heroActionText, styles.orangeText]}>{isOwnPreview ? 'Editar perfil' : 'Enviar mensagem'}</Text></Pressable>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Stat icon="business-outline" value={summary.active_works} label="Obras ativas" />
              <Stat icon="people-outline" value={summary.companies} label="Empresas" />
              <Stat icon="calendar-outline" value={companies.length} label="Vínculos" />
              <Stat icon="checkmark-circle-outline" value={profile.professional_profile_enabled ? 1 : 0} label="Verificado" />
            </View>
            <View style={styles.tabs}>
              {([['activities', 'Atividades'], ['portfolio', 'Portfólio'], ['agenda', 'Agenda'], ['messages', 'Mensagens']] as const).map(([key, label]) => (
                <Pressable key={key} onPress={() => setActiveTab(key)}><Text style={[styles.tab, activeTab === key && styles.tabActive]}>{label}</Text></Pressable>
              ))}
            </View>

            {activeTab === 'activities' && <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>ATIVIDADES RECENTES</Text>
              <DataRow icon="person-outline" label="Nome" value={profile.full_name} />
              {profile.bio && <DataRow icon="document-text-outline" label="Apresentação" value={profile.bio} />}
              {profile.phone && <DataRow icon="call-outline" label="Telefone" value={profile.phone} />}
              {profile.whatsapp && <DataRow icon="logo-whatsapp" label="WhatsApp" value={profile.whatsapp} />}
              {profile.email && <DataRow icon="mail-outline" label="E-mail" value={profile.email} />}
              <View style={styles.activityRow}><Ionicons name="pulse-outline" size={19} color={FioColors.green} /><View style={styles.activityCopy}><Text style={styles.activityTitle}>Atuação no FIO</Text><Text style={styles.activityText}>{profile.job_title || 'Profissional do FIO'} · {summary.active_works} obras ativas</Text></View><Ionicons name="chevron-forward-outline" size={17} color={FioColors.textSoft} /></View>
              <View style={styles.activityRow}><Ionicons name="location-outline" size={19} color={FioColors.orange} /><View style={styles.activityCopy}><Text style={styles.activityTitle}>Área de atendimento</Text><Text style={styles.activityText}>{profile.coverage_area || 'Área não informada'}</Text></View></View>
            </View>}

            {activeTab === 'portfolio' && <View style={styles.sectionCard}><Text style={styles.sectionTitle}>PORTFÓLIO</Text><View style={styles.placeholder}><Ionicons name="images-outline" size={30} color={FioColors.green} /><Text style={styles.placeholderTitle}>Portfólio em preparação</Text><Text style={styles.placeholderText}>Fotos de ambientes, obras e trabalhos publicados aparecerão aqui.</Text></View></View>}
            {activeTab === 'agenda' && <View style={styles.sectionCard}><Text style={styles.sectionTitle}>AGENDA</Text><View style={styles.placeholder}><Ionicons name="calendar-outline" size={30} color={FioColors.gold} /><Text style={styles.placeholderTitle}>Agenda profissional</Text><Text style={styles.placeholderText}>Os horários e visitas autorizados para este perfil aparecerão aqui.</Text><Pressable style={styles.placeholderButton} onPress={() => router.push('/agenda')}><Text style={styles.placeholderButtonText}>Abrir agenda</Text></Pressable></View></View>}
            {activeTab === 'messages' && <View style={styles.sectionCard}><Text style={styles.sectionTitle}>MENSAGENS</Text><View style={styles.placeholder}><Ionicons name="chatbubble-ellipses-outline" size={30} color={FioColors.orange} /><Text style={styles.placeholderTitle}>Fale com este perfil</Text><Text style={styles.placeholderText}>Envie uma mensagem rápida para iniciar o contato.</Text><Pressable style={[styles.placeholderButton, styles.orangeButton]} onPress={() => setComposerOpen(true)}><Text style={styles.placeholderButtonText}>Enviar mensagem</Text></Pressable></View></View>}

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
      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <View style={styles.modalBackdrop}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}><View style={styles.composer}><View style={styles.composerHeader}><View><Text style={styles.composerEyebrow}>NOVA CONVERSA</Text><Text style={styles.composerTitle}>{profile?.full_name}</Text></View><Pressable onPress={() => setComposerOpen(false)}><Ionicons name="close-circle-outline" size={28} color={FioColors.textMuted} /></Pressable></View><Text style={styles.composerHint}>Escreva uma mensagem rápida para iniciar o contato.</Text><TextInput autoFocus multiline value={composerText} onChangeText={setComposerText} placeholder="Digite sua mensagem..." placeholderTextColor={FioColors.textSoft} style={styles.composerInput} /><Pressable disabled={!composerText.trim() || sendingMessage} style={[styles.composerButton, (!composerText.trim() || sendingMessage) && styles.composerButtonDisabled]} onPress={() => void startMessage()}><Text style={styles.composerButtonText}>{sendingMessage ? 'Enviando...' : 'Enviar mensagem'}</Text></Pressable></View></KeyboardAvoidingView></View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 14, paddingBottom: 70 },
  publicTop: { minHeight: 68, marginHorizontal: -14, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: FioColors.ink },
  publicBrand: { flex: 1 },
  publicBrandName: { fontFamily: 'serif', fontSize: 19, fontWeight: '900', color: FioColors.text },
  publicBrandCaption: { marginTop: 2, fontSize: 9, color: FioColors.gold },
  publicTopActions: { flexDirection: 'row', gap: 15 },
  coverBanner: { minHeight: 132, marginHorizontal: -1, overflow: 'hidden', borderBottomLeftRadius: 19, borderBottomRightRadius: 19, backgroundColor: FioColors.inkSoft },
  coverImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  coverShade: { minHeight: 132, padding: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', backgroundColor: 'rgba(24,29,26,0.48)' },
  coverEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: FioColors.gold },
  coverTitle: { marginTop: 5, fontFamily: 'serif', fontSize: 34, fontWeight: '900', color: FioColors.text },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  heroCard: { marginTop: -38, padding: 16, paddingTop: 47, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface, ...FioShadow },
  previewBadge: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999, backgroundColor: FioColors.orangeSoft },
  previewBadgeText: { fontSize: 8, fontWeight: '900', color: FioColors.orange },
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
  statsRow: { marginTop: 12, flexDirection: 'row', gap: 7 },
  stat: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surface },
  statValue: { marginTop: 3, fontSize: 19, fontWeight: '900', color: FioColors.text },
  statLabel: { marginTop: 1, textAlign: 'center', fontSize: 8, color: FioColors.textMuted },
  tabs: { marginTop: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderBottomWidth: 1, borderBottomColor: FioColors.line, backgroundColor: FioColors.surface },
  tab: { paddingHorizontal: 7, paddingVertical: 14, fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  tabActive: { color: FioColors.green, borderBottomWidth: 2, borderBottomColor: FioColors.green },
  sectionCard: { marginTop: 12, padding: 15, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  sectionTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1.1, color: FioColors.green },
  dataRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  dataLabel: { fontSize: 11, color: FioColors.textMuted },
  dataValue: { flex: 1, textAlign: 'right', fontSize: 11, fontWeight: '800', color: FioColors.text },
  activityRow: { minHeight: 59, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  activityCopy: { flex: 1 },
  activityTitle: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  activityText: { marginTop: 3, fontSize: 10, color: FioColors.textMuted },
  placeholder: { alignItems: 'center', paddingVertical: 26, paddingHorizontal: 18 },
  placeholderTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: FioColors.text },
  placeholderText: { marginTop: 5, textAlign: 'center', fontSize: 11, lineHeight: 17, color: FioColors.textMuted },
  placeholderButton: { minHeight: 40, marginTop: 14, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  orangeButton: { backgroundColor: FioColors.orange },
  placeholderButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  composer: { padding: 18, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  composerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  composerEyebrow: { fontSize: 9, fontWeight: '900', letterSpacing: 1.2, color: FioColors.orange },
  composerTitle: { marginTop: 3, fontSize: 19, fontWeight: '900', color: FioColors.text },
  composerHint: { marginTop: 6, fontSize: 11, color: FioColors.textMuted },
  composerInput: { minHeight: 92, marginTop: 14, padding: 13, textAlignVertical: 'top', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 13, color: FioColors.text, backgroundColor: FioColors.surfaceMuted },
  composerButton: { minHeight: 50, marginTop: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: FioColors.orange },
  composerButtonDisabled: { opacity: 0.45 },
  composerButtonText: { fontSize: 13, fontWeight: '900', color: FioColors.textOnAccent },
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
