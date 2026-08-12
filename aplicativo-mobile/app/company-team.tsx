import {
    useCallback,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Alert,
    Image,
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

import { supabase } from '@/lib/supabase';

type TeamMember = {
  user_id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  relationship_type:
    | 'member'
    | 'collaborator';
  company_role: string | null;
  role_title: string | null;
  status: string;
  joined_at: string | null;
};

type CompanyProfile = {
  id: string;
  name: string;
};

function getRoleLabel(
  member: TeamMember
) {
  if (
    member.company_role ===
    'owner'
  ) {
    return 'Proprietário';
  }

  if (
    member.company_role ===
    'admin'
  ) {
    return 'Administrador';
  }

  if (member.role_title) {
    return member.role_title;
  }

  if (member.job_title) {
    return member.job_title;
  }

  return 'Profissional';
}

function getRelationshipLabel(
  member: TeamMember
) {
  if (
    member.relationship_type ===
    'member'
  ) {
    return 'Membro da empresa';
  }

  return 'Colaborador profissional';
}

function getInitials(
  name: string
) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'F';
  }

  if (parts.length === 1) {
    return parts[0]
      .charAt(0)
      .toUpperCase();
  }

  return `${parts[0].charAt(
    0
  )}${parts[
    parts.length - 1
  ].charAt(0)}`.toUpperCase();
}

export default function CompanyTeamScreen() {
  const router = useRouter();

  const { companyId } =
    useLocalSearchParams<{
      companyId: string;
    }>();

  const [
    company,
    setCompany,
  ] =
    useState<CompanyProfile | null>(
      null
    );

  const [team, setTeam] =
    useState<TeamMember[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState('');

  const [
    editingUserId,
    setEditingUserId,
  ] = useState<string | null>(
    null
  );

  const [
    roleDraft,
    setRoleDraft,
  ] = useState('');

  const [
    savingUserId,
    setSavingUserId,
  ] = useState<string | null>(
    null
  );

  async function loadData() {
    if (!companyId) {
      setMessage(
        'Empresa não encontrada.'
      );

      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const [
        companyResult,
        teamResult,
      ] = await Promise.all([
        supabase.rpc(
          'get_company_profile',
          {
            p_company_id:
              companyId,
          }
        ),

        supabase.rpc(
          'get_company_team',
          {
            p_company_id:
              companyId,
          }
        ),
      ]);

      if (companyResult.error) {
        setMessage(
          companyResult.error
            .message
        );

        return;
      }

      const loadedCompany =
        companyResult.data?.[0] as
          | CompanyProfile
          | undefined;

      if (!loadedCompany) {
        setMessage(
          'Empresa não encontrada.'
        );

        return;
      }

      setCompany(
        loadedCompany
      );

      if (teamResult.error) {
        setMessage(
          teamResult.error.message
        );

        setTeam([]);
        return;
      }

      setTeam(
        (teamResult.data ??
          []) as TeamMember[]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar a equipe.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [companyId])
  );

  function startRoleEdit(
    member: TeamMember
  ) {
    setMessage('');

    setEditingUserId(
      member.user_id
    );

    setRoleDraft(
      member.role_title ||
        member.job_title ||
        ''
    );
  }

  function cancelRoleEdit() {
    setEditingUserId(null);
    setRoleDraft('');
    setMessage('');
  }

  async function saveCollaboratorRole(
    member: TeamMember
  ) {
    if (
      savingUserId ||
      !companyId
    ) {
      return;
    }

    const cleanedRole =
      roleDraft.trim();

    if (!cleanedRole) {
      setMessage(
        'Informe a função do profissional.'
      );

      return;
    }

    setSavingUserId(
      member.user_id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'update_company_collaborator_role',
          {
            p_company_id:
              companyId,

            p_user_id:
              member.user_id,

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

      setEditingUserId(null);
      setRoleDraft('');

      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível atualizar a função.'
      );
    } finally {
      setSavingUserId(null);
    }
  }

  function confirmRemoveCollaborator(
    member: TeamMember
  ) {
    Alert.alert(
      'Remover da equipe?',
      `${member.full_name} deixará de aparecer como colaborador desta empresa. O histórico do vínculo será preservado.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () =>
            removeCollaborator(
              member
            ),
        },
      ]
    );
  }

  async function removeCollaborator(
    member: TeamMember
  ) {
    if (
      savingUserId ||
      !companyId
    ) {
      return;
    }

    setSavingUserId(
      member.user_id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'remove_company_collaborator',
          {
            p_company_id:
              companyId,

            p_user_id:
              member.user_id,
          }
        );

      if (error) {
        setMessage(
          error.message
        );

        return;
      }

      if (
        editingUserId ===
        member.user_id
      ) {
        setEditingUserId(null);
        setRoleDraft('');
      }

      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível remover o colaborador.'
      );
    } finally {
      setSavingUserId(null);
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
          Carregando equipe...
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
      <View
        style={styles.topBar}
      >
        <View>
          <Text
            style={styles.brand}
          >
            FIO
          </Text>

          <Text
            style={
              styles.brandSubtitle
            }
          >
            GESTÃO DE OBRAS
          </Text>
        </View>

        <Pressable
          style={
            styles.profileButton
          }
          onPress={() =>
            router.push('/profile')
          }
        >
          <Text
            style={
              styles.profileButtonText
            }
          >
            Meu FIO
          </Text>
        </Pressable>
      </View>

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
          ‹ Perfil profissional
        </Text>
      </Pressable>

      <Text
        style={styles.eyebrow}
      >
        PERFIL PROFISSIONAL
      </Text>

      <Text style={styles.title}>
        Equipe
      </Text>

      {company && (
        <Text
          style={styles.subtitle}
        >
          {company.name}
        </Text>
      )}

      <View
        style={styles.summaryCard}
      >
        <Text
          style={styles.summaryValue}
        >
          {team.length}
        </Text>

        <Text
          style={styles.summaryLabel}
        >
          {team.length === 1
            ? 'pessoa na equipe'
            : 'pessoas na equipe'}
        </Text>
      </View>

<Pressable
  style={({ pressed }) => [
    styles.addProfessionalButton,
    pressed &&
      styles.buttonPressed,
  ]}
  onPress={() =>
    router.push({
      pathname: '/company-invite',
      params: {
        companyId,
      },
    })
  }
>
  <Text
    style={
      styles.addProfessionalButtonText
    }
  >
    + Adicionar profissional
  </Text>
</Pressable>

      {!!message && (
        <View
          style={styles.errorCard}
        >
          <Text
            style={styles.errorText}
          >
            {message}
          </Text>
        </View>
      )}

      {!message &&
        team.length === 0 && (
          <View
            style={styles.emptyCard}
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              Nenhuma pessoa na equipe
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Os membros e
              colaboradores aprovados
              aparecerão aqui.
            </Text>
          </View>
        )}

      {team.map((member) => {
        const roleLabel =
          getRoleLabel(member);

        const relationshipLabel =
          getRelationshipLabel(
            member
          );

        const isOwner =
          member.company_role ===
          'owner';

        const isInternalMember =
          member.relationship_type ===
          'member';

        const isCollaborator =
          member.relationship_type ===
          'collaborator';

        const isEditing =
          editingUserId ===
          member.user_id;

        const isSaving =
          savingUserId ===
          member.user_id;

        return (
          <View
            key={member.user_id}
            style={styles.memberCard}
          >
            <View
              style={styles.memberHeader}
            >
              {member.avatar_url ? (
                <Image
                  source={{
                    uri: member.avatar_url,
                  }}
                  style={styles.avatar}
                />
              ) : (
                <View
                  style={
                    styles.avatarPlaceholder
                  }
                >
                  <Text
                    style={
                      styles.avatarInitials
                    }
                  >
                    {getInitials(
                      member.full_name
                    )}
                  </Text>
                </View>
              )}

              <View
                style={
                  styles.memberInfo
                }
              >
                <View
                  style={
                    styles.memberTop
                  }
                >
                  <Text
                    style={
                      styles.memberName
                    }
                  >
                    {member.full_name}
                  </Text>

                  {isOwner && (
                    <View
                      style={
                        styles.ownerBadge
                      }
                    >
                      <Text
                        style={
                          styles.ownerBadgeText
                        }
                      >
                        Proprietário
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={
                    styles.memberRole
                  }
                >
                  {roleLabel}
                </Text>

                <Text
                  style={
                    styles.relationshipText
                  }
                >
                  {relationshipLabel}
                </Text>
              </View>
            </View>

            {isOwner && (
              <View
                style={
                  styles.protectedArea
                }
              >
                <Text
                  style={
                    styles.protectedTitle
                  }
                >
                  Perfil protegido
                </Text>

                <Text
                  style={
                    styles.protectedText
                  }
                >
                  A propriedade da
                  empresa não pode ser
                  alterada por esta
                  tela.
                </Text>
              </View>
            )}

            {isInternalMember &&
              !isOwner && (
                <View
                  style={
                    styles.internalArea
                  }
                >
                  <Text
                    style={
                      styles.internalText
                    }
                  >
                    Membro interno da
                    empresa
                  </Text>
                </View>
              )}

            {isCollaborator &&
              !isEditing && (
                <View
                  style={
                    styles.actionRow
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
                      startRoleEdit(
                        member
                      )
                    }
                    disabled={
                      savingUserId !==
                      null
                    }
                  >
                    <Text
                      style={
                        styles.editButtonText
                      }
                    >
                      Editar função
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
                      confirmRemoveCollaborator(
                        member
                      )
                    }
                    disabled={
                      savingUserId !==
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

            {isCollaborator &&
              isEditing && (
                <View
                  style={
                    styles.editorArea
                  }
                >
                  <Text
                    style={
                      styles.editorLabel
                    }
                  >
                    Função na empresa
                  </Text>

                  <TextInput
                    style={
                      styles.roleInput
                    }
                    value={
                      roleDraft
                    }
                    onChangeText={
                      setRoleDraft
                    }
                    placeholder="Ex.: Montador"
                    placeholderTextColor="#A0A5A8"
                    editable={
                      !isSaving
                    }
                    autoFocus
                  />

                  <View
                    style={
                      styles.editorActions
                    }
                  >
                    <Pressable
                      style={({
                        pressed,
                      }) => [
                        styles.cancelButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={
                        cancelRoleEdit
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
                      style={({
                        pressed,
                      }) => [
                        styles.saveButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        saveCollaboratorRole(
                          member
                        )
                      }
                      disabled={
                        isSaving
                      }
                    >
                      <Text
                        style={
                          styles.saveButtonText
                        }
                      >
                        {isSaving
                          ? 'Salvando...'
                          : 'Salvar função'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}
          </View>
        );
      })}

      <View
        style={styles.infoCard}
      >
        <Text
          style={styles.infoTitle}
        >
          Como a equipe funciona
        </Text>

        <Text
          style={styles.infoText}
        >
          Membros pertencem
          diretamente à empresa.
          Colaboradores profissionais
          possuem um vínculo aprovado
          e podem ter sua função
          atualizada ou ser
          desvinculados sem apagar o
          histórico.
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

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 18,
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
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 999,
      backgroundColor:
        '#FFFFFF',
    },

    profileButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
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
      marginTop: 5,
      marginBottom: 20,
      fontSize: 14,
      fontWeight: '700',
      color: '#70787D',
    },

    summaryCard: {
      marginBottom: 16,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    summaryValue: {
      fontSize: 28,
      fontWeight: '800',
      color: '#2C343A',
    },

    summaryLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: '#7C8387',
    },

    memberCard: {
      marginBottom: 12,
      padding: 15,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 16,
      backgroundColor:
        '#FFFFFF',
    },

    memberHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
    },

    avatar: {
      width: 50,
      height: 50,
      borderRadius: 15,
      backgroundColor:
        '#ECEEEC',
    },

    avatarPlaceholder: {
      width: 50,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor:
        '#2C343A',
    },

    avatarInitials: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    memberInfo: {
      flex: 1,
    },

    memberTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },

    memberName: {
      flex: 1,
      fontSize: 15,
      fontWeight: '800',
      color: '#2C343A',
    },

    memberRole: {
      marginTop: 4,
      fontSize: 12,
      fontWeight: '700',
      color: '#5F7567',
    },

    relationshipText: {
      marginTop: 3,
      fontSize: 10,
      color: '#8B9195',
    },

    ownerBadge: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        '#FFF4EC',
    },

    ownerBadgeText: {
      fontSize: 8,
      fontWeight: '800',
      color: '#A65B32',
    },

    protectedArea: {
      marginTop: 14,
      padding: 12,
      borderRadius: 12,
      backgroundColor:
        '#F5F5F2',
    },

    protectedTitle: {
      fontSize: 10,
      fontWeight: '800',
      color: '#626A6F',
    },

    protectedText: {
      marginTop: 3,
      fontSize: 10,
      lineHeight: 15,
      color: '#8B9195',
    },

    internalArea: {
      marginTop: 14,
      padding: 11,
      borderRadius: 12,
      backgroundColor:
        '#EEF1ED',
    },

    internalText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#506455',
    },

    actionRow: {
      marginTop: 14,
      flexDirection: 'row',
      gap: 8,
    },

    editButton: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 11,
      backgroundColor:
        '#FFFFFF',
    },

    editButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#2C343A',
    },

    removeButton: {
      minHeight: 42,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E6C8C3',
      borderRadius: 11,
      backgroundColor:
        '#FFF8F7',
    },

    removeButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#B42318',
    },

    editorArea: {
      marginTop: 14,
      padding: 13,
      borderRadius: 13,
      backgroundColor:
        '#F7F7F5',
    },

    editorLabel: {
      marginBottom: 7,
      fontSize: 10,
      fontWeight: '800',
      color: '#626A6F',
    },

    roleInput: {
      minHeight: 46,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 11,
      backgroundColor:
        '#FFFFFF',
      fontSize: 14,
      color: '#2C343A',
    },

    editorActions: {
      marginTop: 10,
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
      borderRadius: 11,
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
      borderRadius: 11,
      backgroundColor:
        '#E07A3A',
    },

    saveButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    buttonPressed: {
      opacity: 0.6,
    },

addProfessionalButton: {
  minHeight: 50,
  marginBottom: 16,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 14,
  backgroundColor: '#E07A3A',
},

addProfessionalButtonText: {
  fontSize: 12,
  fontWeight: '800',
  color: '#FFFFFF',
},

    infoCard: {
      marginTop: 10,
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

    emptyCard: {
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    emptyTitle: {
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
      color: '#2C343A',
    },

    emptyText: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 18,
      textAlign: 'center',
      color: '#858B8F',
    },

    errorCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#FFF2F0',
    },

    errorText: {
      fontSize: 13,
      color: '#B42318',
    },
  });