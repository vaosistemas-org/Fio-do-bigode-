import {
    useCallback,
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
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import ProfessionalMiniProfile from '@/components/ProfessionalMiniProfile';

import { supabase } from '@/lib/supabase';

type WorkParticipant = {
  participant_id: string;
  user_id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  role_title: string | null;
  access_level:
    | 'owner'
    | 'manager'
    | 'collaborator'
    | 'viewer';
  company_id: string | null;
  company_name: string | null;
  is_current_user: boolean;
  joined_at: string | null;
};

const ACCESS_LABELS: Record<
  WorkParticipant['access_level'],
  string
> = {
  owner: 'Proprietário da obra',
  manager: 'Gestor da obra',
  collaborator: 'Colaborador',
  viewer: 'Visualização',
};

export default function WorkParticipantsScreen() {
  const router = useRouter();

  const { workId } =
    useLocalSearchParams<{
      workId: string;
    }>();

  const [
    participants,
    setParticipants,
  ] = useState<WorkParticipant[]>(
    []
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState('');

  const [
    editingParticipantId,
    setEditingParticipantId,
  ] = useState<string | null>(
    null
  );

  const [
    roleDraft,
    setRoleDraft,
  ] = useState('');

  const [
    accessDraft,
    setAccessDraft,
  ] = useState<
    'manager' |
    'collaborator' |
    'viewer'
  >('collaborator');

  const [
    savingParticipantId,
    setSavingParticipantId,
  ] = useState<string | null>(
    null
  );

  async function loadParticipants() {
    if (!workId) {
      setMessage(
        'Obra não encontrada.'
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

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
        setParticipants([]);
        return;
      }

      setParticipants(
        (data ?? []) as
          WorkParticipant[]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os participantes.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadParticipants();
    }, [workId])
  );

  const currentParticipant =
    participants.find(
      (participant) =>
        participant.is_current_user
    );

  const currentAccess =
    currentParticipant
      ?.access_level ?? null;

  const canManage =
    currentAccess === 'owner' ||
    currentAccess === 'manager';

  function canEditParticipant(
    participant: WorkParticipant
  ) {
    if (!canManage) {
      return false;
    }

    if (
      participant.access_level ===
      'owner'
    ) {
      return false;
    }

    if (
      currentAccess === 'manager' &&
      participant.access_level ===
        'manager'
    ) {
      return false;
    }

    return true;
  }

  function startEdit(
    participant: WorkParticipant
  ) {
    if (
      !canEditParticipant(
        participant
      )
    ) {
      return;
    }

    setEditingParticipantId(
      participant.participant_id
    );

    setRoleDraft(
      participant.role_title ||
        participant.job_title ||
        ''
    );

    if (
      participant.access_level ===
        'manager' ||
      participant.access_level ===
        'viewer'
    ) {
      setAccessDraft(
        participant.access_level
      );
    } else {
      setAccessDraft(
        'collaborator'
      );
    }

    setMessage('');
  }

  function cancelEdit() {
    setEditingParticipantId(
      null
    );
    setRoleDraft('');
    setAccessDraft(
      'collaborator'
    );
    setMessage('');
  }

  async function saveParticipant(
    participant: WorkParticipant
  ) {
    if (
      savingParticipantId
    ) {
      return;
    }

    const cleanedRole =
      roleDraft.trim();

    if (!cleanedRole) {
      setMessage(
        'Informe a função do participante na obra.'
      );
      return;
    }

    setSavingParticipantId(
      participant.participant_id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'update_work_participant',
          {
            p_participant_id:
              participant.participant_id,
            p_role_title:
              cleanedRole,
            p_access_level:
              accessDraft,
          }
        );

      if (error) {
        setMessage(
          error.message
        );
        return;
      }

      cancelEdit();
      await loadParticipants();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar o participante.'
      );
    } finally {
      setSavingParticipantId(
        null
      );
    }
  }

  function confirmRemove(
    participant: WorkParticipant
  ) {
    Alert.alert(
      'Remover da obra?',
      `${participant.full_name} perderá o acesso a esta obra. O vínculo com a empresa não será alterado e o histórico será preservado.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () =>
            removeParticipant(
              participant
            ),
        },
      ]
    );
  }

  async function removeParticipant(
    participant: WorkParticipant
  ) {
    if (
      savingParticipantId
    ) {
      return;
    }

    setSavingParticipantId(
      participant.participant_id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'remove_work_participant',
          {
            p_participant_id:
              participant.participant_id,
          }
        );

      if (error) {
        setMessage(
          error.message
        );
        return;
      }

      if (
        editingParticipantId ===
        participant.participant_id
      ) {
        cancelEdit();
      }

      await loadParticipants();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível remover o participante.'
      );
    } finally {
      setSavingParticipantId(
        null
      );
    }
  }

  if (loading) {
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
          Carregando participantes...
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
          ‹ Obra
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
        Participantes
      </Text>

      <Text
        style={styles.subtitle}
      >
        Pessoas que realmente têm
        acesso a esta obra.
      </Text>

      {canManage && (
        <Pressable
          style={({
            pressed,
          }) => [
            styles.addButton,
            pressed &&
              styles.buttonPressed,
          ]}
          onPress={() =>
            router.push({
              pathname:
                '/add-work-participant',
              params: {
                workId,
              },
            })
          }
        >
          <Text
            style={
              styles.addButtonText
            }
          >
            + Adicionar participante
          </Text>
        </Pressable>
      )}

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

      <View
        style={styles.summaryRow}
      >
        <Text
          style={
            styles.summaryValue
          }
        >
          {participants.length}
        </Text>

        <Text
          style={
            styles.summaryText
          }
        >
          {participants.length === 1
            ? 'participante ativo'
            : 'participantes ativos'}
        </Text>
      </View>

      {participants.map(
        (participant) => {
          const isEditing =
            editingParticipantId ===
            participant.participant_id;

          const isSaving =
            savingParticipantId ===
            participant.participant_id;

          const editable =
            canEditParticipant(
              participant
            );

          const detailParts = [
            ACCESS_LABELS[
              participant.access_level
            ],
            participant.company_name,
          ].filter(Boolean);

          return (
            <View
              key={
                participant.participant_id
              }
              style={
                styles.participantCard
              }
            >
              <ProfessionalMiniProfile
                name={
                  participant.full_name
                }
                avatarUrl={
                  participant.avatar_url
                }
                role={
                  participant.role_title ||
                  participant.job_title ||
                  'Participante da obra'
                }
                detail={
                  detailParts.join(
                    ' · '
                  )
                }
              />

              {participant.is_current_user && (
                <Text
                  style={
                    styles.youText
                  }
                >
                  Você
                </Text>
              )}

              {editable &&
                !isEditing && (
                  <View
                    style={
                      styles.actions
                    }
                  >
                    <Pressable
                      style={({
                        pressed,
                      }) => [
                        styles.editButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        startEdit(
                          participant
                        )
                      }
                      disabled={
                        savingParticipantId !==
                        null
                      }
                    >
                      <Text
                        style={
                          styles.editButtonText
                        }
                      >
                        Editar
                      </Text>
                    </Pressable>

                    <Pressable
                      style={({
                        pressed,
                      }) => [
                        styles.removeButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        confirmRemove(
                          participant
                        )
                      }
                      disabled={
                        savingParticipantId !==
                        null
                      }
                    >
                      <Text
                        style={
                          styles.removeButtonText
                        }
                      >
                        {isSaving
                          ? 'Removendo...'
                          : 'Remover'}
                      </Text>
                    </Pressable>
                  </View>
                )}

              {editable &&
                isEditing && (
                  <View
                    style={
                      styles.editor
                    }
                  >
                    <Text
                      style={
                        styles.editorLabel
                      }
                    >
                      FUNÇÃO NA OBRA
                    </Text>

                    <TextInput
                      style={
                        styles.input
                      }
                      value={
                        roleDraft
                      }
                      onChangeText={
                        setRoleDraft
                      }
                      placeholder="Ex.: Montador"
                      placeholderTextColor="#9A9FA2"
                      editable={
                        !isSaving
                      }
                    />

                    <Text
                      style={[
                        styles.editorLabel,
                        styles.accessLabel,
                      ]}
                    >
                      NÍVEL DE ACESSO
                    </Text>

                    <View
                      style={
                        styles.accessOptions
                      }
                    >
                      {currentAccess ===
                        'owner' && (
                        <Pressable
                          style={[
                            styles.accessOption,
                            accessDraft ===
                              'manager' &&
                              styles.accessOptionSelected,
                          ]}
                          onPress={() =>
                            setAccessDraft(
                              'manager'
                            )
                          }
                        >
                          <Text
                            style={
                              styles.accessOptionText
                            }
                          >
                            Gestor
                          </Text>
                        </Pressable>
                      )}

                      <Pressable
                        style={[
                          styles.accessOption,
                          accessDraft ===
                            'collaborator' &&
                            styles.accessOptionSelected,
                        ]}
                        onPress={() =>
                          setAccessDraft(
                            'collaborator'
                          )
                        }
                      >
                        <Text
                          style={
                            styles.accessOptionText
                          }
                        >
                          Colaborador
                        </Text>
                      </Pressable>

                      <Pressable
                        style={[
                          styles.accessOption,
                          accessDraft ===
                            'viewer' &&
                            styles.accessOptionSelected,
                        ]}
                        onPress={() =>
                          setAccessDraft(
                            'viewer'
                          )
                        }
                      >
                        <Text
                          style={
                            styles.accessOptionText
                          }
                        >
                          Visualização
                        </Text>
                      </Pressable>
                    </View>

                    <View
                      style={
                        styles.editorActions
                      }
                    >
                      <Pressable
                        style={
                          styles.cancelButton
                        }
                        onPress={
                          cancelEdit
                        }
                        disabled={
                          isSaving
                        }
                      >
                        <Text
                          style={
                            styles.cancelButtonText
                          }
                        >
                          Cancelar
                        </Text>
                      </Pressable>

                      <Pressable
                        style={
                          styles.saveButton
                        }
                        onPress={() =>
                          saveParticipant(
                            participant
                          )
                        }
                        disabled={
                          isSaving
                        }
                      >
                        {isSaving ? (
                          <ActivityIndicator
                            color="#FFFFFF"
                          />
                        ) : (
                          <Text
                            style={
                              styles.saveButtonText
                            }
                          >
                            Salvar
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                )}
            </View>
          );
        }
      )}

      <View
        style={styles.infoCard}
      >
        <Text
          style={
            styles.infoTitle
          }
        >
          Empresa e obra são acessos
          diferentes
        </Text>

        <Text
          style={
            styles.infoText
          }
        >
          Fazer parte de uma empresa não
          concede acesso automático às
          obras. Cada participante é
          adicionado somente às obras em
          que realmente precisa atuar.
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

    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor:
        '#F7F7F5',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#777D80',
    },

    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 22,
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
      marginTop: 4,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#2C343A',
    },

    subtitle: {
      marginTop: 6,
      marginBottom: 18,
      fontSize: 13,
      lineHeight: 19,
      color: '#70787D',
    },

    addButton: {
      minHeight: 48,
      marginBottom: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor:
        '#E07A3A',
    },

    addButtonText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    summaryRow: {
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },

    summaryValue: {
      fontSize: 22,
      fontWeight: '800',
      color: '#2C343A',
    },

    summaryText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#777D80',
    },

    participantCard: {
      marginBottom: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 15,
      backgroundColor:
        '#FFFFFF',
    },

    youText: {
      marginTop: 7,
      textAlign: 'center',
      fontSize: 9,
      fontWeight: '800',
      color: '#E07A3A',
    },

    actions: {
      marginTop: 13,
      flexDirection: 'row',
      gap: 8,
    },

    editButton: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 10,
      backgroundColor:
        '#FFFFFF',
    },

    editButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#2C343A',
    },

    removeButton: {
      minHeight: 40,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E6C8C3',
      borderRadius: 10,
      backgroundColor:
        '#FFF8F7',
    },

    removeButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#B42318',
    },

    editor: {
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor:
        '#F7F7F5',
    },

    editorLabel: {
      marginBottom: 7,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.9,
      color: '#626A6F',
    },

    accessLabel: {
      marginTop: 14,
    },

    input: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 10,
      backgroundColor:
        '#FFFFFF',
      fontSize: 14,
      color: '#2C343A',
    },

    accessOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 7,
    },

    accessOption: {
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      backgroundColor:
        '#FFFFFF',
    },

    accessOptionSelected: {
      borderColor: '#5F7567',
      backgroundColor:
        '#EEF1ED',
    },

    accessOptionText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#2C343A',
    },

    editorActions: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 8,
    },

    cancelButton: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 10,
      backgroundColor:
        '#FFFFFF',
    },

    cancelButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#626A6F',
    },

    saveButton: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor:
        '#E07A3A',
    },

    saveButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    infoCard: {
      marginTop: 10,
      padding: 15,
      borderRadius: 13,
      backgroundColor:
        '#EEF1ED',
    },

    infoTitle: {
      fontSize: 11,
      fontWeight: '800',
      color: '#506455',
    },

    infoText: {
      marginTop: 5,
      fontSize: 10,
      lineHeight: 16,
      color: '#66736B',
    },

    errorCard: {
      marginBottom: 14,
      padding: 13,
      borderRadius: 11,
      backgroundColor:
        '#FFF2F0',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 17,
      color: '#B42318',
    },

    buttonPressed: {
      opacity: 0.65,
    },
  });
