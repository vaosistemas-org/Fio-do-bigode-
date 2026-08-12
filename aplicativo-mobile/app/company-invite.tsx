import {
    useEffect,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import {
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import ProfessionalMiniProfile from '@/components/ProfessionalMiniProfile';

import { supabase } from '@/lib/supabase';

type Candidate = {
  user_id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
};

export default function CompanyInviteScreen() {
  const router = useRouter();

  const { companyId } =
    useLocalSearchParams<{
      companyId: string;
    }>();

  const [
    search,
    setSearch,
  ] = useState('');

  const [
    candidates,
    setCandidates,
  ] = useState<Candidate[]>([]);

  const [
    selectedCandidate,
    setSelectedCandidate,
  ] = useState<Candidate | null>(
    null
  );

  const [
    roleTitle,
    setRoleTitle,
  ] = useState('');

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    sending,
    setSending,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState('');

  useEffect(() => {
    const cleanedSearch =
      search.trim();

    if (
      !companyId ||
      cleanedSearch.length < 2
    ) {
      setCandidates([]);
      setSearching(false);
      return;
    }

    let active = true;

    setSearching(true);
    setMessage('');

    const timer = setTimeout(
      async () => {
        const { data, error } =
          await supabase.rpc(
            'search_company_invite_candidates',
            {
              p_company_id:
                companyId,

              p_search:
                cleanedSearch,
            }
          );

        if (!active) {
          return;
        }

        if (error) {
          setCandidates([]);
          setMessage(
            error.message
          );
          setSearching(false);
          return;
        }

        setCandidates(
          (data ?? []) as Candidate[]
        );

        setSearching(false);
      },
      350
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, companyId]);

  function selectCandidate(
    candidate: Candidate
  ) {
    setSelectedCandidate(
      candidate
    );

    setRoleTitle(
      candidate.job_title ?? ''
    );

    setMessage('');
  }

  function clearSelection() {
    setSelectedCandidate(null);
    setRoleTitle('');
    setMessage('');
  }

  async function sendInvite() {
    if (
      !companyId ||
      !selectedCandidate ||
      sending
    ) {
      return;
    }

    const cleanedRole =
      roleTitle.trim();

    if (!cleanedRole) {
      setMessage(
        'Informe a função do profissional na empresa.'
      );

      return;
    }

    setSending(true);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'invite_company_collaborator',
          {
            p_company_id:
              companyId,

            p_user_id:
              selectedCandidate.user_id,

            p_role_title:
              cleanedRole,
          }
        );

      if (error) {
        setMessage(
          error.message
        );

        return;
      }

      Alert.alert(
        'Convite enviado',
        `${selectedCandidate.full_name} receberá o convite para entrar na equipe como ${cleanedRole}.`,
        [
          {
            text:
              'Voltar para a equipe',
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar o convite.'
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.content
      }
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={
        false
      }
    >
      <Pressable
        style={styles.backButton}
        onPress={() =>
          router.back()
        }
      >
        <Text
          style={
            styles.backButtonText
          }
        >
          ‹ Equipe
        </Text>
      </Pressable>

      <Text
        style={styles.eyebrow}
      >
        EQUIPE DA EMPRESA
      </Text>

      <Text
        style={styles.title}
      >
        Adicionar profissional
      </Text>

      <Text
        style={styles.subtitle}
      >
        Busque uma pessoa que já
        possui perfil no FIO e envie
        um convite para fazer parte
        da equipe.
      </Text>

      {!!message && (
        <View
          style={styles.errorCard}
        >
          <Text
            style={
              styles.errorText
            }
          >
            {message}
          </Text>
        </View>
      )}

      {!selectedCandidate ? (
        <>
          <Text
            style={
              styles.fieldLabel
            }
          >
            BUSCAR PROFISSIONAL
          </Text>

          <TextInput
            style={
              styles.searchInput
            }
            value={search}
            onChangeText={setSearch}
            placeholder="Digite o nome ou função"
            placeholderTextColor="#9A9FA2"
            autoCapitalize="words"
            autoCorrect={false}
          />

          {search.trim().length <
            2 && (
            <Text
              style={
                styles.helperText
              }
            >
              Digite pelo menos 2
              caracteres.
            </Text>
          )}

          {searching && (
            <View
              style={
                styles.searchingArea
              }
            >
              <ActivityIndicator />

              <Text
                style={
                  styles.searchingText
                }
              >
                Buscando...
              </Text>
            </View>
          )}

          {!searching &&
            search.trim().length >=
              2 &&
            candidates.length ===
              0 &&
            !message && (
              <View
                style={
                  styles.emptyCard
                }
              >
                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  Nenhum profissional
                  encontrado
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Pessoas que já fazem
                  parte da empresa ou
                  possuem vínculo
                  pendente não aparecem
                  nesta busca.
                </Text>
              </View>
            )}

          <View
            style={
              styles.candidateList
            }
          >
            {candidates.map(
              (candidate) => (
                <Pressable
                  key={
                    candidate.user_id
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.candidateCard,

                    pressed &&
                      styles.pressed,
                  ]}
                  onPress={() =>
                    selectCandidate(
                      candidate
                    )
                  }
                >
                  <ProfessionalMiniProfile
                    name={
                      candidate.full_name
                    }
                    avatarUrl={
                      candidate.avatar_url
                    }
                    role={
                      candidate.job_title ||
                      'Profissional FIO'
                    }
                  />

                  <Text
                    style={
                      styles.selectText
                    }
                  >
                    Selecionar ›
                  </Text>
                </Pressable>
              )
            )}
          </View>
        </>
      ) : (
        <>
          <Text
            style={
              styles.fieldLabel
            }
          >
            PROFISSIONAL
          </Text>

          <View
            style={
              styles.selectedCard
            }
          >
            <ProfessionalMiniProfile
              name={
                selectedCandidate.full_name
              }
              avatarUrl={
                selectedCandidate.avatar_url
              }
              role={
                selectedCandidate.job_title ||
                'Profissional FIO'
              }
              detail="Selecionado"
            />

            <Pressable
              style={
                styles.changeButton
              }
              onPress={
                clearSelection
              }
            >
              <Text
                style={
                  styles.changeButtonText
                }
              >
                Trocar profissional
              </Text>
            </Pressable>
          </View>

          <Text
            style={[
              styles.fieldLabel,
              styles.roleLabel,
            ]}
          >
            FUNÇÃO NA EMPRESA
          </Text>

          <TextInput
            style={
              styles.roleInput
            }
            value={roleTitle}
            onChangeText={
              setRoleTitle
            }
            placeholder="Ex.: Montador"
            placeholderTextColor="#9A9FA2"
            autoCapitalize="words"
          />

          <Text
            style={
              styles.helperText
            }
          >
            Essa será a função exibida
            no vínculo com esta empresa.
          </Text>

          <Pressable
            style={({
              pressed,
            }) => [
              styles.inviteButton,

              pressed &&
                styles.pressed,

              sending &&
                styles.disabledButton,
            ]}
            onPress={sendInvite}
            disabled={sending}
          >
            {sending ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.inviteButtonText
                }
              >
                Enviar convite
              </Text>
            )}
          </Pressable>
        </>
      )}

      <View
        style={styles.infoCard}
      >
        <Text
          style={
            styles.infoTitle
          }
        >
          O profissional precisa
          aceitar
        </Text>

        <Text
          style={
            styles.infoText
          }
        >
          O convite não adiciona a
          pessoa automaticamente. Após
          o aceite, o vínculo passa a
          fazer parte da equipe.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor:
        '#F7F7F5',
    },

    content: {
      width: '100%',
      maxWidth: 620,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 70,
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 24,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      backgroundColor:
        '#FFFFFF',
    },

    backButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#E07A3A',
    },

    title: {
      marginTop: 5,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#2C343A',
    },

    subtitle: {
      marginTop: 8,
      marginBottom: 24,
      fontSize: 13,
      lineHeight: 19,
      color: '#70787D',
    },

    fieldLabel: {
      marginBottom: 8,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
      color: '#626A6F',
    },

    searchInput: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
      fontSize: 15,
      color: '#2C343A',
    },

    helperText: {
      marginTop: 7,
      marginBottom: 15,
      fontSize: 10,
      lineHeight: 15,
      color: '#8B9195',
    },

    searchingArea: {
      paddingVertical: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },

    searchingText: {
      marginTop: 8,
      fontSize: 11,
      color: '#858B8F',
    },

    candidateList: {
      width: '100%',
    },

    candidateCard: {
      marginBottom: 10,
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 15,
      backgroundColor:
        '#FFFFFF',
    },

    selectText: {
      marginTop: 9,
      fontSize: 10,
      fontWeight: '800',
      color: '#E07A3A',
    },

    selectedCard: {
      padding: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#DADFDA',
      borderRadius: 15,
      backgroundColor:
        '#FFFFFF',
    },

    changeButton: {
      marginTop: 12,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
    },

    changeButtonText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#2C343A',
    },

    roleLabel: {
      marginTop: 22,
    },

    roleInput: {
      minHeight: 50,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
      fontSize: 15,
      color: '#2C343A',
    },

    inviteButton: {
      minHeight: 52,
      marginTop: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      backgroundColor:
        '#E07A3A',
    },

    inviteButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    disabledButton: {
      opacity: 0.55,
    },

    pressed: {
      opacity: 0.65,
    },

    emptyCard: {
      marginTop: 4,
      padding: 22,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 15,
      backgroundColor:
        '#FFFFFF',
    },

    emptyTitle: {
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
      color: '#2C343A',
    },

    emptyText: {
      marginTop: 6,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      color: '#858B8F',
    },

    infoCard: {
      marginTop: 24,
      padding: 16,
      borderRadius: 14,
      backgroundColor:
        '#EEF1ED',
    },

    infoTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: '#506455',
    },

    infoText: {
      marginTop: 5,
      fontSize: 11,
      lineHeight: 17,
      color: '#66736B',
    },

    errorCard: {
      marginBottom: 16,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#FFF2F0',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 17,
      color: '#B42318',
    },
  });