import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import {
  FioColors,
  FioRadius,
  FioShadow,
} from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type OpenSection = 'personal' | 'contact' | 'privacy' | null;

type ProfileData = {
  fullName: string;
  phone: string;
  email: string;
  jobTitle: string;
  coverageArea: string;
  avatarUrl: string | null;
  professionalEnabled: boolean;
  clientEnabled: boolean;
  activeWorks: number;
  links: number;
};

const EMPTY_PROFILE: ProfileData = {
  fullName: '',
  phone: '',
  email: '',
  jobTitle: '',
  coverageArea: '',
  avatarUrl: null,
  professionalEnabled: false,
  clientEnabled: false,
  activeWorks: 0,
  links: 0,
};

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'F';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [openSection, setOpenSection] = useState<OpenSection>('personal');
  const [loading, setLoading] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingClientToggle, setSavingClientToggle] = useState(false);
  const [message, setMessage] = useState('');

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setMessage('');

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      setMessage('Não foi possível identificar sua conta.');
      setLoading(false);
      return;
    }

    const [profileResult, worksResult, contextsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, phone, job_title, coverage_area, avatar_url, professional_profile_enabled, client_profile_enabled'
        )
        .eq('id', authData.user.id)
        .maybeSingle(),
      supabase
        .from('works')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .neq('status', 'finalizada'),
      supabase.rpc('get_my_company_contexts'),
    ]);

    if (profileResult.error) {
      setMessage(profileResult.error.message);
      setLoading(false);
      return;
    }

    const data = profileResult.data;
    setProfile({
      fullName: data?.full_name ?? '',
      phone: data?.phone ?? '',
      email: authData.user.email ?? '',
      jobTitle: data?.job_title ?? '',
      coverageArea: data?.coverage_area ?? '',
      avatarUrl: data?.avatar_url ?? null,
      professionalEnabled: Boolean(data?.professional_profile_enabled),
      clientEnabled: Boolean(data?.client_profile_enabled),
      activeWorks: worksResult.count ?? 0,
      links: Array.isArray(contextsResult.data) ? contextsResult.data.length : 0,
    });
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function toggleProfessional(value: boolean) {
    if (savingToggle) return;
    const previous = profile.professionalEnabled;
    setProfile((current) => ({ ...current, professionalEnabled: value }));
    setSavingToggle(true);
    setMessage('');

    const { error } = await supabase.rpc(
      'set_my_professional_profile_enabled',
      { p_enabled: value }
    );

    if (error) {
      setProfile((current) => ({
        ...current,
        professionalEnabled: previous,
      }));
      setMessage(error.message);
    }
    setSavingToggle(false);
  }

  async function toggleClient(value: boolean) {
    if (savingClientToggle) return;
    const previous = profile.clientEnabled;
    setProfile((current) => ({ ...current, clientEnabled: value }));
    setSavingClientToggle(true);
    setMessage('');
    const { error } = await supabase.rpc('set_my_client_profile_enabled', { p_enabled: value });
    if (error) {
      setProfile((current) => ({ ...current, clientEnabled: previous }));
      setMessage(error.message);
    } else {
      await supabase.auth.refreshSession();
    }
    setSavingClientToggle(false);
  }

  function toggleSection(section: Exclude<OpenSection, null>) {
    setOpenSection((current) => (current === section ? null : section));
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.loadingText}>Carregando seu perfil...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="ÁREA PRIVADA"
        title="Meu perfil"
        subtitle="Seus dados, preferências e visão pública."
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.identityRow}>
            <View style={styles.avatarFrame}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <Text style={styles.avatarInitials}>
                  {initials(profile.fullName)}
                </Text>
              )}
            </View>

            <View style={styles.identity}>
              <Text numberOfLines={1} style={styles.name}>
                {profile.fullName || 'Meu perfil'}
              </Text>
              <View style={styles.locationRow}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={FioColors.textMuted}
                />
                <Text numberOfLines={1} style={styles.location}>
                  {profile.coverageArea || 'Localização não informada'}
                </Text>
              </View>
              <View style={styles.privateBadge}>
                <Ionicons
                  name="lock-closed-outline"
                  size={11}
                  color={FioColors.green}
                />
                <Text style={styles.privateBadgeText}>Conta pessoal · privado</Text>
              </View>
            </View>

            <View style={styles.counters}>
              <Counter value={profile.activeWorks} label="Obras ativas" />
              <View style={styles.counterDivider} />
              <Counter value={profile.links} label="Vínculos" />
            </View>
          </View>

          <View style={styles.actions}>
            <CompactAction
              icon="create-outline"
              label="Editar meus dados"
              onPress={() => router.push('/edit-profile')}
            />
            <CompactAction
              icon="eye-outline"
              label="Ver como os outros veem"
              onPress={() =>
                router.push({
                  pathname: '/my-professional-profile',
                  params: { preview: '1' },
                })
              }
            />
            <View style={styles.professionalAction}>
              <Text numberOfLines={2} style={styles.professionalActionText}>
                Perfil profissional
              </Text>
              <Switch
                accessibilityLabel="Ativar perfil profissional"
                value={profile.professionalEnabled}
                onValueChange={toggleProfessional}
                disabled={savingToggle}
                trackColor={{ false: '#D7D5CF', true: '#86A792' }}
                thumbColor={
                  profile.professionalEnabled ? FioColors.green : '#F7F5EF'
                }
              />
            </View>
            <View style={styles.clientAction}>
              <Text numberOfLines={2} style={styles.clientActionText}>Perfil de cliente</Text>
              <Switch
                accessibilityLabel="Ativar perfil de cliente"
                value={profile.clientEnabled}
                onValueChange={toggleClient}
                disabled={savingClientToggle}
                trackColor={{ false: '#D7D5CF', true: '#86A792' }}
                thumbColor={profile.clientEnabled ? FioColors.green : '#F7F5EF'}
              />
            </View>
          </View>
        </View>

        {!!message && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        <View style={styles.sections}>
          <ProfileSection
            icon="person-outline"
            title="Dados pessoais"
            subtitle="Identidade e tipo de conta"
            open={openSection === 'personal'}
            onPress={() => toggleSection('personal')}
          >
            <DataRow label="Nome completo" value={profile.fullName || 'Não informado'} />
            <DataRow label="Localização" value={profile.coverageArea || 'Não informada'} />
            <DataRow label="Tipo de conta" value="Conta pessoal" />
            <Pressable
              style={styles.smallEditButton}
              onPress={() => router.push('/edit-profile')}
            >
              <Ionicons name="create-outline" size={15} color={FioColors.ink} />
              <Text style={styles.smallEditText}>Editar</Text>
            </Pressable>
          </ProfileSection>

          <ProfileSection
            icon="call-outline"
            title="Contato"
            subtitle="Telefone, e-mail e atuação"
            open={openSection === 'contact'}
            onPress={() => toggleSection('contact')}
          >
            <DataRow label="Telefone" value={profile.phone || 'Não informado'} />
            <DataRow label="E-mail" value={profile.email || 'Não informado'} />
            <DataRow label="Atuação" value={profile.jobTitle || 'Não informada'} />
          </ProfileSection>

          <ProfileSection
            icon="shield-checkmark-outline"
            title="Privacidade"
            subtitle="Controle o que aparece publicamente"
            open={openSection === 'privacy'}
            onPress={() => toggleSection('privacy')}
          >
            <DataRow label="Meu perfil" value="Somente você" />
            <DataRow
              label="Perfil profissional"
              value={profile.professionalEnabled ? 'Ativo' : 'Desativado'}
            />
            <DataRow label="Perfil de cliente" value={profile.clientEnabled ? 'Ativo' : 'Desativado'} />
            <Text style={styles.privacyExplanation}>
              Seus dados privados não aparecem no perfil profissional nem no
              perfil da empresa.
            </Text>
          </ProfileSection>
        </View>

        <View style={styles.privateNote}>
          <Ionicons name="information-circle-outline" size={17} color={FioColors.green} />
          <Text style={styles.privateNoteText}>
            Esta é a sua visão privada. Para conferir a visão pública, use “Ver
            como os outros veem”.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterValue}>{value}</Text>
      <Text style={styles.counterLabel}>{label}</Text>
    </View>
  );
}

function CompactAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.compactAction, pressed && styles.pressed]}
      onPress={onPress}
    >
      <View style={styles.compactActionIcon}>
        <Ionicons name={icon} size={17} color={FioColors.ink} />
      </View>
      <Text numberOfLines={2} style={styles.compactActionText}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProfileSection({
  icon,
  title,
  subtitle,
  open,
  onPress,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  open: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.sectionCard}>
      <Pressable style={styles.sectionHeader} onPress={onPress}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={19} color={FioColors.green} />
        </View>
        <View style={styles.sectionIdentity}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={19}
          color={FioColors.textMuted}
        />
      </Pressable>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  scroll: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 900,
    alignSelf: 'center',
    padding: 16,
    paddingTop: 22,
    paddingBottom: 70,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: FioColors.canvas,
  },
  loadingText: { marginTop: 10, fontSize: 12, color: FioColors.textMuted },
  profileCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.large,
    backgroundColor: FioColors.surface,
    ...FioShadow,
  },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  avatarFrame: {
    width: 62,
    height: 62,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: FioColors.goldSoft,
    borderRadius: 999,
    backgroundColor: FioColors.gold,
  },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  avatarInitials: { fontSize: 20, fontWeight: '900', color: FioColors.ink },
  identity: { flex: 1, minWidth: 0 },
  name: { fontSize: 19, fontWeight: '900', color: FioColors.text },
  locationRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 3 },
  location: { flex: 1, fontSize: 10, color: FioColors.textMuted },
  privateBadge: {
    alignSelf: 'flex-start',
    minHeight: 24,
    marginTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: FioRadius.pill,
    backgroundColor: FioColors.greenSoft,
  },
  privateBadgeText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  counters: {
    width: 116,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  counter: { flex: 1, alignItems: 'center', paddingHorizontal: 7 },
  counterValue: { fontSize: 22, fontWeight: '900', color: FioColors.text },
  counterLabel: { marginTop: 2, textAlign: 'center', fontSize: 8, color: FioColors.textMuted },
  counterDivider: { width: 1, height: 38, backgroundColor: FioColors.line },
  actions: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactAction: {
    minHeight: 54,
    minWidth: 110,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: 13,
    backgroundColor: FioColors.surfaceMuted,
  },
  compactActionIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    backgroundColor: FioColors.goldSoft,
  },
  compactActionText: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '800', color: FioColors.text },
  professionalAction: {
    minHeight: 54,
    minWidth: 160,
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#BFD0C3',
    borderRadius: 13,
    backgroundColor: FioColors.greenSoft,
  },
  professionalActionText: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '800', color: FioColors.green },
  clientAction: {
    minHeight: 54,
    minWidth: 160,
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: FioColors.goldSoft,
    borderRadius: 13,
    backgroundColor: FioColors.goldSoft,
  },
  clientActionText: { flex: 1, fontSize: 9, lineHeight: 12, fontWeight: '800', color: FioColors.ink },
  sections: { marginTop: 16, gap: 10 },
  sectionCard: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: FioColors.line,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.surface,
  },
  sectionHeader: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 13,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: FioColors.greenSoft,
  },
  sectionIdentity: { flex: 1, minWidth: 0 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: FioColors.text },
  sectionSubtitle: { marginTop: 2, fontSize: 9, color: FioColors.textMuted },
  sectionBody: {
    padding: 13,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#EEEAE2',
  },
  dataRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEAE2',
  },
  dataLabel: { width: 118, fontSize: 9, fontWeight: '800', color: FioColors.textMuted },
  dataValue: { flex: 1, fontSize: 11, fontWeight: '700', color: FioColors.text },
  smallEditButton: {
    minHeight: 38,
    marginTop: 11,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: FioColors.goldSoft,
  },
  smallEditText: { fontSize: 10, fontWeight: '900', color: FioColors.ink },
  privacyExplanation: { marginTop: 12, fontSize: 10, lineHeight: 16, color: FioColors.textMuted },
  privateNote: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 13,
    borderRadius: 13,
    backgroundColor: FioColors.greenSoft,
  },
  privateNoteText: { flex: 1, fontSize: 10, lineHeight: 15, color: FioColors.green },
  errorCard: { marginTop: 12, padding: 13, borderRadius: 12, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, color: FioColors.danger },
  pressed: { opacity: 0.68 },
});
