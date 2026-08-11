import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

type CompanyLink = {
  link_id: string;
  company_id: string;
  company_name: string;
  role_title: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [coverageArea, setCoverageArea] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [companyLinks, setCompanyLinks] = useState<CompanyLink[]>([]);
  const [hasAdminCompany, setHasAdminCompany] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setMessage('');

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setLoading(false);
      return;
    }

    const [
      profileResult,
      adminResult,
      companyLinksResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, job_title, coverage_area, avatar_url'
        )
        .eq('id', user.id)
        .maybeSingle(),

      supabase.rpc('has_admin_company'),

      supabase.rpc('get_my_company_links'),
    ]);

    if (profileResult.error) {
      setMessage(profileResult.error.message);
    } else {
      setFullName(profileResult.data?.full_name ?? '');
      setJobTitle(profileResult.data?.job_title ?? '');
      setCoverageArea(profileResult.data?.coverage_area ?? '');
      setAvatarUrl(profileResult.data?.avatar_url ?? null);
    }

    if (adminResult.error) {
      setHasAdminCompany(false);
    } else {
      setHasAdminCompany(Boolean(adminResult.data));
    }

    if (companyLinksResult.error) {
      setMessage(companyLinksResult.error.message);
      setCompanyLinks([]);
    } else {
      setCompanyLinks(
        (companyLinksResult.data ?? []) as CompanyLink[]
      );
    }

    setLoading(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    setMessage('');

    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message);
      setLoggingOut(false);
      return;
    }

    /*
     * Não fazemos router.replace('/login') aqui.
     * O RootLayout percebe que não existe mais sessão
     * e libera automaticamente a tela de Login.
     */
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'approved':
        return 'Vínculo ativo';

      case 'pending':
        return 'Aguardando aprovação';

      case 'rejected':
        return 'Solicitação recusada';

      default:
        return status;
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'approved':
        return styles.statusApproved;

      case 'pending':
        return styles.statusPending;

      case 'rejected':
        return styles.statusRejected;

      default:
        return styles.statusDefault;
    }
  }

  const initial =
    fullName.trim().charAt(0).toUpperCase() || 'F';

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>
          Carregando Meu FIO...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>FIO</Text>
          <Text style={styles.brandSubtitle}>
            GESTÃO DE OBRAS
          </Text>
        </View>
      </View>

      <Text style={styles.pageTitle}>Meu FIO</Text>

      <View style={styles.profileCard}>
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={styles.avatar}
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Text style={styles.avatarInitial}>
              {initial}
            </Text>
          </View>
        )}

        <View style={styles.profileInfo}>
          <Text style={styles.name}>
            {fullName || 'Usuário do FIO'}
          </Text>

          {!!jobTitle && (
            <Text style={styles.profileDetail}>
              {jobTitle}
            </Text>
          )}

          {!!coverageArea && (
            <Text style={styles.profileDetail}>
              {coverageArea}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.push('/edit-profile')}
      >
        <Text style={styles.secondaryButtonText}>
          Editar perfil
        </Text>
      </Pressable>

      <Text style={styles.sectionTitle}>ACESSOS</Text>

      <Pressable
        style={styles.accessCard}
        onPress={() => router.push('/works')}
      >
        <View style={styles.accessTextArea}>
          <Text style={styles.accessTitle}>Obras</Text>

          <Text style={styles.accessSubtitle}>
            Acompanhar minhas obras
          </Text>
        </View>

        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {hasAdminCompany && (
        <Pressable
          style={[
            styles.accessCard,
            styles.accessCardSpacing,
          ]}
          onPress={() =>
            router.push('/company-link-requests')
          }
        >
          <View style={styles.accessTextArea}>
            <Text style={styles.accessTitle}>
              Solicitações de vínculo
            </Text>

            <Text style={styles.accessSubtitle}>
              Aprovar ou recusar profissionais
            </Text>
          </View>

          <Text style={styles.chevron}>›</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>
        EMPRESA NO FIO
      </Text>

      {companyLinks.length === 0 ? (
        <View style={styles.emptyCompanyCard}>
          <Text style={styles.emptyCompanyTitle}>
            Nenhum vínculo profissional
          </Text>

          <Text style={styles.emptyCompanyText}>
            Você pode procurar uma empresa no FIO e solicitar
            vínculo profissional.
          </Text>
        </View>
      ) : (
        <View style={styles.companyList}>
          {companyLinks.map((link) => (
            <View
              key={link.link_id}
              style={styles.companyCard}
            >
              <View style={styles.companyCardTop}>
                <View style={styles.companyInfo}>
                  <Text style={styles.companyName}>
                    {link.company_name}
                  </Text>

                  <Text style={styles.companyRole}>
                    {link.role_title}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    getStatusStyle(link.status),
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusLabel(link.status)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      <Pressable
        style={styles.companySearchButton}
        onPress={() => router.push('/company-link')}
      >
        <Text style={styles.companySearchButtonText}>
          {companyLinks.length > 0
            ? 'Adicionar outra empresa'
            : 'Buscar empresa no FIO'}
        </Text>
      </Pressable>

      {!!message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}

      <Pressable
        style={[
          styles.logoutButton,
          loggingOut && styles.buttonDisabled,
        ]}
        onPress={handleLogout}
        disabled={loggingOut}
      >
        {loggingOut ? (
          <ActivityIndicator color="#A65B32" />
        ) : (
          <Text style={styles.logoutButtonText}>
            Sair do FIO
          </Text>
        )}
      </Pressable>

      <Text style={styles.footer}>
        Segue o fio da sua obra.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F7F7F5',
  },

  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F5',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#777D80',
  },

  topBar: {
    marginBottom: 28,
  },

  brand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#2C343A',
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: '#5F7567',
  },

  pageTitle: {
    marginBottom: 20,
    fontSize: 32,
    fontWeight: '700',
    color: '#2C343A',
  },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    backgroundColor: '#FFFFFF',
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },

  avatarFallback: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    backgroundColor: '#2C343A',
  },

  avatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  profileInfo: {
    flex: 1,
    marginLeft: 17,
  },

  name: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2C343A',
  },

  profileDetail: {
    marginTop: 4,
    fontSize: 13,
    color: '#687177',
  },

  secondaryButton: {
    alignSelf: 'flex-start',
    marginTop: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: '#5F7567',
  },

  accessCard: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },

  accessCardSpacing: {
    marginTop: -20,
  },

  accessTextArea: {
    flex: 1,
  },

  accessTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C343A',
  },

  accessSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: '#777D80',
  },

  chevron: {
    marginLeft: 12,
    fontSize: 26,
    color: '#8A9094',
  },

  emptyCompanyCard: {
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },

  emptyCompanyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C343A',
  },

  emptyCompanyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#777D80',
  },

  companyList: {
    marginBottom: 4,
  },

  companyCard: {
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },

  companyCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  companyInfo: {
    flex: 1,
    paddingRight: 12,
  },

  companyName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C343A',
  },

  companyRole: {
    marginTop: 4,
    fontSize: 13,
    color: '#687177',
  },

  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusApproved: {
    backgroundColor: '#E8EEE9',
  },

  statusPending: {
    backgroundColor: '#FFF1E6',
  },

  statusRejected: {
    backgroundColor: '#F2F2F0',
  },

  statusDefault: {
    backgroundColor: '#F2F2F0',
  },

  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2C343A',
  },

  companySearchButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },

  companySearchButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C343A',
  },

  message: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 13,
    color: '#A65B32',
  },

  logoutButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6D6CD',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
  },

  logoutButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#A65B32',
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  footer: {
    marginTop: 28,
    textAlign: 'center',
    fontSize: 12,
    color: '#8A9094',
  },
});