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
  suggested_role_title: string;
  company_id: string | null;
  company_name: string | null;
  relationship_type:
    | 'member'
    | 'collaborator'
    | 'fio_profile';
};

type Participant = {
  participant_id: string;
  user_id: string;
  access_level:
    | 'owner'
    | 'manager'
    | 'collaborator'
    | 'viewer';
  is_current_user: boolean;
};

export default function AddWorkParticipantScreen() {
  const router = useRouter();

  const { workId } =
    useLocalSearchParams<{
      workId: string;
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

  const [participantType, setParticipantType] = useState<'professional' | 'client'>('professional');

  const [
    accessLevel,
    setAccessLevel,
  ] = useState<
    'manager' |
    'collaborator' |
    'viewer'
  >('collaborator');

  const [
    requesterAccess,
    setRequesterAccess,
  ] = useState<
    Participant['access_level'] |
    null
  >(null);

  const [
    loadingAccess,
    setLoadingAccess,
  ] = useState(true);

  const [
    searching,
    setSearching,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState('');

  useEffect(() => {
    async function loadRequesterAccess() {
      if (!workId) {
        setMessage(
          'Obra não encontrada.'
        );
        setLoadingAccess(false);
        return;
      }

      setLoadingAccess(true);

      try {
        const { data, error } =
          await supabase.rpc(
            'get_work_participants',
            {
              p_work_id:
                workId,
            }
          );

        if (error) {
          setMessage(
            error.message
          );
          setRequesterAccess(
            null
          );
          return;
        }

        const participants =
          (data ??
            []) as Participant[];

        const current =
          participants.find(
            (participant) =>
              participant.is_current_user
          );

        setRequesterAccess(
          current?.access_level ??
            null
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar sua permissão nesta obra.'
        );
      } finally {
        setLoadingAccess(false);
      }
    }

    loadRequesterAccess();
  }, [workId]);

  useEffect(() => {
    const cleanedSearch =
      search.trim();

    if (
      !workId ||
      selectedCandidate ||
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
            'search_work_participant_profiles',
            {
              p_work_id:
                workId,
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
          (data ??
            []) as Candidate[]
        );

        setSearching(false);
      },
      350
    );

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    search,
    workId,
    selectedCandidate,
  ]);

  function selectCandidate(
    candidate: Candidate
  ) {
    setSelectedCandidate(
      candidate
    );

    setRoleTitle(participantType === 'client' ? 'Cliente' : candidate.suggested_role_title || candidate.job_title || '');
    setAccessLevel(participantType === 'client' ? 'viewer' : 'collaborator');

    setCandidates([]);
    setMessage('');
  }

  function clearSelection() {
    setSelectedCandidate(null);
    setRoleTitle('');
    setAccessLevel(participantType === 'client' ? 'viewer' : 'collaborator');
    setSearch('');
    setCandidates([]);
    setMessage('');
  }

  async function addParticipant() {
    if (
      !workId ||
      !selectedCandidate ||
      saving
    ) {
      return;
    }

    const cleanedRole =
      roleTitle.trim();

    if (!cleanedRole) {
      setMessage(
        'Informe a função da pessoa nesta obra.'
      );
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'add_work_participant',
          {
            p_work_id:
              workId,
            p_user_id:
              selectedCandidate.user_id,
            p_company_id:
              selectedCandidate.company_id,
            p_role_title:
              cleanedRole,
            p_access_level:
              accessLevel,
          }
        );

      if (error) {
        setMessage(
          error.message
        );
        return;
      }

      if (participantType === 'client') {
        const portalResult = await supabase.rpc('set_work_client_portal_member', {
          p_work_id: workId,
          p_user_id: selectedCandidate.user_id,
          p_enabled: true,
        });
        if (portalResult.error) {
          setMessage(portalResult.error.message);
          return;
        }
      }

      Alert.alert(
        'Participante adicionado',
        participantType === 'client'
          ? `${selectedCandidate.full_name} agora tem acesso à Área do Cliente desta obra.`
          : `${selectedCandidate.full_name} agora tem acesso a esta obra.`,
        [
          {
            text:
              'Voltar aos participantes',
            onPress: () =>
              router.back(),
          },
        ]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível adicionar o participante.'
      );
    } finally {
      setSaving(false);
    }
  }

  const canAssignManager =
    requesterAccess === 'owner';

  if (loadingAccess) {
    return (
      <View
        style={styles.loading}
      >
        <ActivityIndicator />

        <Text
          style={
            styles.loadingText
          }
        >
          Carregando...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={
        styles.content
      }
      showsVerticalScrollIndicator={
        false
      }
      keyboardShouldPersistTaps="handled"
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
          ‹ Participantes
        </Text>
      </Pressable>

      <Text
        style={styles.eyebrow}
      >
        OBRA
      </Text>

      <Text
        style={styles.title}
      >
        Adicionar participante
      </Text>

      <Text
        style={styles.subtitle}
      >
        Busque uma pessoa que já tenha
        perfil no FIO e defina a função
        dela nesta obra.
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
            BUSCAR PERFIL NO FIO
          </Text>

          <View style={styles.typeOptions}>
            <Pressable style={[styles.typeOption, participantType === 'professional' && styles.typeOptionSelected]} onPress={() => setParticipantType('professional')}>
              <Text style={styles.typeTitle}>Profissional</Text>
              <Text style={styles.typeHelp}>Trabalha na obra</Text>
            </Pressable>
            <Pressable style={[styles.typeOption, participantType === 'client' && styles.typeOptionSelected]} onPress={() => setParticipantType('client')}>
              <Text style={styles.typeTitle}>Cliente</Text>
              <Text style={styles.typeHelp}>Acompanha pelo portal</Text>
            </Pressable>
          </View>

          <TextInput
            style={
              styles.searchInput
            }
            value={search}
            onChangeText={
              setSearch
            }
            placeholder="Digite nome ou função"
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
              caracteres para pesquisar
              os perfis cadastrados no
              FIO.
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
                Buscando perfis...
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
                  Nenhum perfil
                  encontrado
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  Tente buscar pelo nome
                  ou pela função
                  profissional.
                </Text>
              </View>
            )}

          {candidates.map(
            (candidate) => {
              const detail =
                candidate.company_name
                  ? candidate.company_name
                  : 'Perfil FIO';

              return (
                <Pressable
                  key={
                    candidate.user_id
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.candidateCard,
                    pressed &&
                      styles.buttonPressed,
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
                      candidate.suggested_role_title ||
                      'Profissional FIO'
                    }
                    detail={
                      detail
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
              );
            }
          )}
        </>
      ) : (
        <>
          <Text
            style={
              styles.fieldLabel
            }
          >
            {participantType === 'client' ? 'CLIENTE SELECIONADO' : 'PESSOA SELECIONADA'}
          </Text>

          <View
            style={
              styles.selectedCard
            }
          >
            <Pressable
              style={styles.profilePressable}
              onPress={() =>
                router.push({
                  pathname: '/work-person-profile',
                  params: { workId, userId: selectedCandidate.user_id },
                })
              }
            >
              <ProfessionalMiniProfile
                name={selectedCandidate.full_name}
                avatarUrl={selectedCandidate.avatar_url}
                role={participantType === 'client' ? 'Cliente' : selectedCandidate.job_title || selectedCandidate.suggested_role_title || 'Perfil FIO'}
                detail={participantType === 'client' ? 'Área do Cliente' : selectedCandidate.company_name || 'Perfil FIO'}
              />
              <Text style={styles.viewProfileText}>Ver perfil</Text>
            </Pressable>

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
                Trocar pessoa
              </Text>
            </Pressable>
          </View>

          <Text
            style={[
              styles.fieldLabel,
              styles.fieldSpacing,
            ]}
          >
            FUNÇÃO NESTA OBRA
          </Text>

          <TextInput
            style={
              styles.input
            }
            value={roleTitle}
            onChangeText={setRoleTitle}
            editable={participantType !== 'client'}
            placeholder={participantType === 'client' ? 'Cliente' : 'Ex.: Montador'}
            placeholderTextColor="#9A9FA2"
            autoCapitalize="words"
          />

          <Text style={styles.helperText}>{participantType === 'client' ? 'O cliente terá acesso somente de consulta à Área do Cliente desta obra.' : 'A função acima vale para esta obra e pode ser diferente do cargo geral do perfil.'}</Text>

          <Text
            style={[
              styles.fieldLabel,
              styles.fieldSpacing,
            ]}
          >
            NÍVEL DE ACESSO
          </Text>

          <View style={styles.accessOptions}>
            {participantType === 'client' ? <View style={[styles.accessOption, styles.accessOptionSelected]}><Text style={styles.accessOptionTitle}>Visualização</Text><Text style={styles.accessOptionText}>Acesso somente para consulta no portal do cliente.</Text></View> : <>
            {canAssignManager && (
              <Pressable
                style={[
                  styles.accessOption,
                  accessLevel ===
                    'manager' &&
                    styles.accessOptionSelected,
                ]}
                onPress={() =>
                  setAccessLevel(
                    'manager'
                  )
                }
              >
                <Text
                  style={
                    styles.accessOptionTitle
                  }
                >
                  Gestor
                </Text>

                <Text
                  style={
                    styles.accessOptionText
                  }
                >
                  Pode administrar
                  participantes da obra.
                </Text>
              </Pressable>
            )}

            <Pressable
              style={[
                styles.accessOption,
                accessLevel ===
                  'collaborator' &&
                  styles.accessOptionSelected,
              ]}
              onPress={() =>
                setAccessLevel(
                  'collaborator'
                )
              }
            >
              <Text
                style={
                  styles.accessOptionTitle
                }
              >
                Colaborador
              </Text>

              <Text
                style={
                  styles.accessOptionText
                }
              >
                Participa e trabalha
                nesta obra.
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.accessOption,
                accessLevel ===
                  'viewer' &&
                  styles.accessOptionSelected,
              ]}
              onPress={() =>
                setAccessLevel(
                  'viewer'
                )
              }
            >
              <Text
                style={
                  styles.accessOptionTitle
                }
              >
                Visualização
              </Text>

              <Text
                style={
                  styles.accessOptionText
                }
              >
                Acesso somente para
                consulta.
              </Text>
            </Pressable>
            </>}
          </View>

          <Pressable
            style={({
              pressed,
            }) => [
              styles.saveButton,
              pressed &&
                styles.buttonPressed,
              saving &&
                styles.buttonDisabled,
            ]}
            onPress={
              addParticipant
            }
            disabled={
              saving
            }
          >
            {saving ? (
              <ActivityIndicator
                color="#FFFFFF"
              />
            ) : (
              <Text
                style={
                  styles.saveButtonText
                }
              >
                Adicionar à obra
              </Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles =
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: '#242824',
    },

    content: {
      width: '100%',
      maxWidth: 620,
      alignSelf: 'center',
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 70,
    },

    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#242824',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#C0C7C1',
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 22,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 999,
      backgroundColor: '#2E332F',
    },

    backButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#F2F3EF',
    },

    eyebrow: {
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#FFB04A',
    },

    title: {
      marginTop: 4,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    subtitle: {
      marginTop: 6,
      marginBottom: 20,
      fontSize: 13,
      lineHeight: 19,
      color: '#C0C7C1',
    },

    fieldLabel: {
      marginBottom: 8,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: '#626A6F',
    },

    fieldSpacing: {
      marginTop: 20,
    },

    typeOptions: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },

    typeOption: {
      flex: 1,
      minHeight: 72,
      padding: 11,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 12,
      backgroundColor: '#2E332F',
    },

    typeOptionSelected: {
      borderColor: '#74B892',
      backgroundColor: '#383E39',
    },

    typeTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    typeHelp: {
      marginTop: 4,
      fontSize: 9,
      lineHeight: 13,
      color: '#C0C7C1',
    },

    searchInput: {
      minHeight: 48,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 12,
      backgroundColor: '#2E332F',
      fontSize: 14,
      color: '#F2F3EF',
    },

    helperText: {
      marginTop: 7,
      marginBottom: 14,
      fontSize: 10,
      lineHeight: 15,
      color: '#8B9195',
    },

    searchingArea: {
      paddingVertical: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },

    searchingText: {
      marginTop: 8,
      fontSize: 11,
      color: '#858B8F',
    },

    candidateCard: {
      marginBottom: 9,
      padding: 13,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#4C534D',
      borderRadius: 14,
      backgroundColor: '#2E332F',
    },

    selectText: {
      marginTop: 8,
      fontSize: 10,
      fontWeight: '800',
      color: '#FFB04A',
    },

    selectedCard: {
      padding: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#DADFDA',
      borderRadius: 14,
      backgroundColor: '#2E332F',
    },

    profilePressable: {
      width: '100%',
      alignItems: 'center',
    },

    viewProfileText: {
      marginTop: 9,
      fontSize: 12,
      fontWeight: '800',
      color: '#74B892',
    },

    changeButton: {
      marginTop: 11,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 999,
    },

    changeButtonText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    input: {
      minHeight: 48,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 12,
      backgroundColor: '#2E332F',
      fontSize: 14,
      color: '#F2F3EF',
    },

    accessOptions: {
      gap: 8,
    },

    accessOption: {
      padding: 13,
      borderWidth: 1,
      borderColor: '#687069',
      borderRadius: 12,
      backgroundColor: '#2E332F',
    },

    accessOptionSelected: {
      borderColor: '#5F7567',
      backgroundColor: '#383E39',
    },

    accessOptionTitle: {
      fontSize: 12,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    accessOptionText: {
      marginTop: 3,
      fontSize: 10,
      lineHeight: 15,
      color: '#C0C7C1',
    },

    saveButton: {
      minHeight: 50,
      marginTop: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor:
        '#E07A3A',
    },

    saveButtonText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    emptyCard: {
      padding: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#4C534D',
      borderRadius: 14,
      backgroundColor: '#2E332F',
    },

    emptyTitle: {
      fontSize: 14,
      fontWeight: '800',
      textAlign: 'center',
      color: '#F2F3EF',
    },

    emptyText: {
      marginTop: 5,
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      color: '#858B8F',
    },

    errorCard: {
      marginBottom: 14,
      padding: 13,
      borderRadius: 11,
      backgroundColor:
        '#4A2F2D',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 17,
      color: '#FF8D83',
    },

    buttonPressed: {
      opacity: 0.65,
    },

    buttonDisabled: {
      opacity: 0.55,
    },
  });
