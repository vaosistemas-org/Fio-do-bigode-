import { useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

type Company = {
  id: string;
  name: string;
};

type CompanyLink = {
  id: string;
  company_id: string;
  role_title: string;
  status: string;
};

export default function CompanyLinkScreen() {
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] =
    useState<Company | null>(null);

  const [currentLink, setCurrentLink] =
    useState<CompanyLink | null>(null);

  const [roleTitle, setRoleTitle] = useState('');

  const [searching, setSearching] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const [message, setMessage] = useState('');

  const isPending = currentLink?.status === 'pending';
  const isApproved = currentLink?.status === 'approved';

  function handleBack() {
    Keyboard.dismiss();
    router.replace('/profile');
  }

  async function handleSearch() {
    Keyboard.dismiss();

    setMessage('');
    setSelectedCompany(null);
    setCurrentLink(null);
    setRoleTitle('');

    if (query.trim().length < 2) {
      setMessage('Digite pelo menos 2 caracteres.');
      return;
    }

    setSearching(true);

    const { data, error } = await supabase.rpc(
      'search_companies',
      {
        p_query: query.trim(),
      }
    );

    if (error) {
      setMessage(error.message);
      setSearching(false);
      return;
    }

    setCompanies(data ?? []);

    if (!data || data.length === 0) {
      setMessage('Nenhuma empresa encontrada no FIO.');
    }

    setSearching(false);
  }

  async function loadCompanyLink(company: Company) {
    setCheckingLink(true);
    setMessage('');
    setCurrentLink(null);

    const { data, error } = await supabase.rpc(
      'get_my_company_link',
      {
        p_company_id: company.id,
      }
    );

    if (error) {
      setMessage(error.message);
      setCheckingLink(false);
      return;
    }

    const link = data?.[0] ?? null;

    setCurrentLink(link);

    if (link?.role_title) {
      setRoleTitle(link.role_title);
    } else {
      setRoleTitle('');
    }

    setCheckingLink(false);
  }

  async function handleSelectCompany(company: Company) {
    Keyboard.dismiss();
    setSelectedCompany(company);
    await loadCompanyLink(company);
  }

  async function handleRequest() {
    Keyboard.dismiss();
    setMessage('');

    if (!selectedCompany) {
      setMessage('Selecione uma empresa.');
      return;
    }

    if (!roleTitle.trim()) {
      setMessage('Informe sua função nessa empresa.');
      return;
    }

    setRequesting(true);

    const { error } = await supabase.rpc(
      'request_company_link',
      {
        p_company_id: selectedCompany.id,
        p_role_title: roleTitle.trim(),
      }
    );

    if (error) {
      setMessage(error.message);
      setRequesting(false);
      return;
    }

    await loadCompanyLink(selectedCompany);

    setRequesting(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.page}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View>
            <Text style={styles.brand}>FIO</Text>
            <Text style={styles.brandSubtitle}>
              GESTÃO DE OBRAS
            </Text>
          </View>

          <Pressable
            style={styles.profileButton}
            onPress={handleBack}
          >
            <Text style={styles.profileButtonText}>
              Meu FIO
            </Text>
          </Pressable>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Empresa no FIO</Text>

          <Text style={styles.subtitle}>
            Encontre uma empresa e solicite seu vínculo profissional.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            BUSCAR EMPRESA
          </Text>

          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Ex.: Casa Oga"
            placeholderTextColor="#8A9094"
            autoCapitalize="words"
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />

          <Pressable
            style={styles.searchButton}
            onPress={handleSearch}
            disabled={searching}
          >
            {searching ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.searchButtonText}>
                Buscar empresa
              </Text>
            )}
          </Pressable>
        </View>

        {companies.length > 0 && (
          <View style={styles.results}>
            <Text style={styles.sectionTitle}>
              RESULTADOS
            </Text>

            {companies.map((company) => {
              const selected =
                selectedCompany?.id === company.id;

              return (
                <Pressable
                  key={company.id}
                  style={[
                    styles.companyCard,
                    selected && styles.companyCardSelected,
                  ]}
                  onPress={() =>
                    handleSelectCompany(company)
                  }
                >
                  <View style={styles.companyInfo}>
                    <Text style={styles.companyName}>
                      {company.name}
                    </Text>

                    <Text style={styles.companyStatus}>
                      Empresa no FIO
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.radio,
                      selected && styles.radioSelected,
                    ]}
                  >
                    {selected && (
                      <View style={styles.radioInner} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedCompany && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              SEU VÍNCULO
            </Text>

            <Text style={styles.selectedCompany}>
              {selectedCompany.name}
            </Text>

            {checkingLink ? (
              <View style={styles.checking}>
                <ActivityIndicator />
                <Text style={styles.checkingText}>
                  Verificando vínculo...
                </Text>
              </View>
            ) : (
              <>
                {isPending && (
                  <View style={styles.statusNotice}>
                    <Text style={styles.statusNoticeTitle}>
                      Solicitação enviada para{' '}
                      {selectedCompany.name}.
                    </Text>

                    <Text style={styles.statusNoticeText}>
                      Aguardando aprovação da empresa.
                    </Text>
                  </View>
                )}

                {isApproved && (
                  <View style={styles.statusNotice}>
                    <Text style={styles.statusNoticeTitle}>
                      Vínculo ativo
                    </Text>

                    <Text style={styles.statusNoticeText}>
                      Seu vínculo com {selectedCompany.name} foi
                      aprovado.
                    </Text>
                  </View>
                )}

                <Text style={styles.label}>
                  Qual é sua função nessa empresa?
                </Text>

                <TextInput
                  style={[
                    styles.input,
                    (isPending || isApproved) &&
                      styles.inputDisabled,
                  ]}
                  value={roleTitle}
                  onChangeText={setRoleTitle}
                  placeholder="Ex.: Montador"
                  placeholderTextColor="#8A9094"
                  editable={!isPending && !isApproved}
                  returnKeyType="done"
                />

                <Pressable
                  style={[
                    styles.requestButton,
                    (requesting ||
                      isPending ||
                      isApproved) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={handleRequest}
                  disabled={
                    requesting ||
                    isPending ||
                    isApproved
                  }
                >
                  {requesting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.requestButtonText}>
                      {isPending
                        ? 'Aguardando resposta'
                        : isApproved
                          ? 'Vínculo ativo'
                          : 'Solicitar vínculo'}
                    </Text>
                  )}
                </Pressable>
              </>
            )}
          </View>
        )}

        {!!message && (
          <Text style={styles.message}>
            {message}
          </Text>
        )}

        <Text style={styles.footer}>
          Você pode continuar usando o FIO sem estar
          vinculado a uma empresa.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
    paddingBottom: 80,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
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

  profileButton: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  profileButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2C343A',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#687177',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    padding: 20,
    marginBottom: 18,
  },

  sectionTitle: {
    marginBottom: 14,
    fontSize: 11,
    fontWeight: '800',
    color: '#5F7567',
    letterSpacing: 1.4,
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#2C343A',
    backgroundColor: '#FFFFFF',
  },

  inputDisabled: {
    backgroundColor: '#F3F4F2',
    color: '#687177',
  },

  searchButton: {
    minHeight: 50,
    marginTop: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C343A',
  },

  searchButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  results: {
    marginBottom: 18,
  },

  companyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 17,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    backgroundColor: '#FFFFFF',
  },

  companyCardSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF7F1',
  },

  companyInfo: {
    flex: 1,
    paddingRight: 16,
  },

  companyName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2C343A',
  },

  companyStatus: {
    marginTop: 3,
    fontSize: 12,
    color: '#777D80',
  },

  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D8DCDA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  radioSelected: {
    borderColor: '#E07A3A',
  },

  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E07A3A',
  },

  selectedCompany: {
    marginBottom: 16,
    fontSize: 18,
    fontWeight: '800',
    color: '#2C343A',
  },

  checking: {
    alignItems: 'center',
    paddingVertical: 20,
  },

  checkingText: {
    marginTop: 8,
    fontSize: 13,
    color: '#777D80',
  },

  statusNotice: {
    marginBottom: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#EEF1ED',
  },

  statusNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C343A',
  },

  statusNoticeText: {
    marginTop: 4,
    fontSize: 12,
    color: '#5F7567',
  },

  label: {
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  requestButton: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07A3A',
  },

  requestButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  buttonDisabled: {
    opacity: 0.55,
  },

  message: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 13,
    color: '#A65B32',
  },

  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
    color: '#8A9094',
  },
});