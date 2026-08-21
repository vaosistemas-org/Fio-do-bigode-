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

type TeamMember = {
  user_id: string;
  full_name: string;
  job_title: string | null;
  avatar_url: string | null;
  relationship_type: 'member' | 'collaborator';
  company_role: string | null;
  role_title: string | null;
  status: string;
  joined_at: string | null;
};

type CompanyProfile = {
  id: string;
  name: string;
};

function getRoleLabel(member: TeamMember) {
  if (member.company_role === 'owner') {
    return 'Proprietário';
  }

  if (member.company_role === 'admin') {
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

function getRelationshipLabel(member: TeamMember) {
  if (member.relationship_type === 'member') {
    return 'Membro da empresa';
  }

  return 'Colaborador profissional';
}

export default function CompanyTeamScreen() {
  const router = useRouter();

  const { companyId } =
    useLocalSearchParams<{
      companyId: string;
    }>();

  const [company, setCompany] =
    useState<CompanyProfile | null>(null);

  const [team, setTeam] =
    useState<TeamMember[]>([]);

  const [currentUserId, setCurrentUserId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState('');

  const [editingUserId, setEditingUserId] =
    useState<string | null>(null);

  const [roleDraft, setRoleDraft] =
    useState('');

  const [savingUserId, setSavingUserId] =
    useState<string | null>(null);

  async function loadData() {
    if (!companyId) {
      setMessage('Empresa não encontrada.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const [
        userResult,
        companyResult,
        teamResult,
      ] = await Promise.all([
        supabase.auth.getUser(),

        supabase.rpc(
          'get_company_profile',
          {
            p_company_id: companyId,
          }
        ),

        supabase.rpc(
          'get_company_team',
          {
            p_company_id: companyId,
          }
        ),
      ]);

      if (
        userResult.error ||
        !userResult.data.user
      ) {
        setMessage(
          userResult.error?.message ??
            'Usuário não autenticado.'
        );
        return;
      }

      setCurrentUserId(
        userResult.data.user.id
      );

      if (companyResult.error) {
        setMessage(
          companyResult.error.message
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

      setCompany(loadedCompany);

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
    setEditingUserId(member.user_id);
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

    setSavingUserId(member.user_id);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'update_company_collaborator_role',
          {
            p_company_id: companyId,
            p_user_id: member.user_id,
            p_role_title: cleanedRole,
          }
        );

      if (error) {
        setMessage(error.message);
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
            removeCollaborator(member),
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

    setSavingUserId(member.user_id);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'remove_company_collaborator',
          {
            p_company_id: companyId,
            p_user_id: member.user_id,
          }
        );

      if (error) {
        setMessage(error.message);
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

  function confirmPromoteToAdmin(
    member: TeamMember
  ) {
    Alert.alert(
      'Tornar administrador?',
      `${member.full_name} poderá editar o perfil profissional, gerenciar colaboradores, convites e solicitações desta empresa.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Tornar administrador',
          onPress: () =>
            promoteToAdmin(member),
        },
      ]
    );
  }

  async function promoteToAdmin(
    member: TeamMember
  ) {
    if (
      savingUserId ||
      !companyId
    ) {
      return;
    }

    setSavingUserId(member.user_id);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'promote_company_collaborator_to_admin',
          {
            p_company_id: companyId,
            p_user_id: member.user_id,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      setEditingUserId(null);
      setRoleDraft('');
      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível tornar o profissional administrador.'
      );
    } finally {
      setSavingUserId(null);
    }
  }

  function confirmDemoteAdmin(
    member: TeamMember
  ) {
    Alert.alert(
      'Remover permissão de administrador?',
      `${member.full_name} continuará na equipe como colaborador profissional, mas perderá as permissões administrativas da empresa.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Remover permissão',
          style: 'destructive',
          onPress: () =>
            demoteAdmin(member),
        },
      ]
    );
  }

  async function demoteAdmin(
    member: TeamMember
  ) {
    if (
      savingUserId ||
      !companyId
    ) {
      return;
    }

    setSavingUserId(member.user_id);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'demote_company_admin_to_collaborator',
          {
            p_company_id: companyId,
            p_user_id: member.user_id,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      await loadData();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível remover a permissão de administrador.'
      );
    } finally {
      setSavingUserId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text
          style={styles.loadingText}
        >
          Carregando equipe...
        </Text>
      </View>
    );
  }

  const currentUserMember =
    team.find(
      (member) =>
        member.user_id ===
          currentUserId &&
        member.relationship_type ===
          'member'
    );

  const currentUserIsOwner =
    currentUserMember?.company_role ===
    'owner';

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
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>
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
          style={styles.profileButton}
          onPress={() =>
            router.push('/company')
          }
        >
          <Text
            style={
              styles.profileButtonText
            }
          >
            Empresa
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

      <Text style={styles.eyebrow}>
        PERFIL PROFISSIONAL
      </Text>

      <Text style={styles.title}>
        Equipe
      </Text>

      {company && (
        <Text style={styles.subtitle}>
          {company.name}
        </Text>
      )}

      <View style={styles.summaryCard}>
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
        <View style={styles.errorCard}>
          <Text
            style={styles.errorText}
          >
            {message}
          </Text>
        </View>
      )}

      {!message &&
        team.length === 0 && (
          <View style={styles.emptyCard}>
            <Text
              style={styles.emptyTitle}
            >
              Nenhuma pessoa na equipe
            </Text>

            <Text
              style={styles.emptyText}
            >
              Os membros e colaboradores
              aprovados aparecerão aqui.
            </Text>
          </View>
        )}

      {team.map((member) => {
        const roleLabel =
          getRoleLabel(member);

        const relationshipLabel =
          getRelationshipLabel(member);

        const isOwner =
          member.company_role ===
          'owner';

        const isAdmin =
          member.company_role ===
          'admin';

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
              <ProfessionalMiniProfile
                name={member.full_name}
                avatarUrl={
                  member.avatar_url
                }
                role={roleLabel}
                detail={
                  relationshipLabel
                }
              />
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
                  A propriedade da empresa
                  não pode ser alterada por
                  esta tela.
                </Text>
              </View>
            )}

            {isAdmin && (
              <View
                style={styles.adminArea}
              >
                <Text
                  style={styles.adminTitle}
                >
                  Administrador da empresa
                </Text>

                <Text
                  style={styles.adminText}
                >
                  Pode administrar perfil,
                  equipe, convites e
                  solicitações.
                </Text>

                {currentUserIsOwner && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.demoteAdminButton,
                      pressed &&
                        styles.buttonPressed,
                    ]}
                    onPress={() =>
                      confirmDemoteAdmin(
                        member
                      )
                    }
                    disabled={
                      savingUserId !== null
                    }
                  >
                    <Text
                      style={
                        styles.demoteAdminButtonText
                      }
                    >
                      {isSaving
                        ? 'Processando...'
                        : 'Remover permissão de administrador'}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {isCollaborator &&
              !isEditing && (
                <>
                  <View
                    style={
                      styles.actionRow
                    }
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.editButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        startRoleEdit(member)
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
                      style={({ pressed }) => [
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
                          ? 'Processando...'
                          : 'Remover'}
                      </Text>
                    </Pressable>
                  </View>

                  {currentUserIsOwner && (
                    <Pressable
                      style={({ pressed }) => [
                        styles.promoteAdminButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        confirmPromoteToAdmin(
                          member
                        )
                      }
                      disabled={
                        savingUserId !== null
                      }
                    >
                      <Text
                        style={
                          styles.promoteAdminButtonText
                        }
                      >
                        {isSaving
                          ? 'Processando...'
                          : 'Tornar administrador'}
                      </Text>
                    </Pressable>
                  )}
                </>
              )}

            {isCollaborator &&
              isEditing && (
                <View
                  style={styles.editorArea}
                >
                  <Text
                    style={
                      styles.editorLabel
                    }
                  >
                    Função na empresa
                  </Text>

                  <TextInput
                    style={styles.roleInput}
                    value={roleDraft}
                    onChangeText={
                      setRoleDraft
                    }
                    placeholder="Ex.: Montador"
                    placeholderTextColor="#A0A5A8"
                    editable={!isSaving}
                    autoFocus
                  />

                  <View
                    style={
                      styles.editorActions
                    }
                  >
                    <Pressable
                      style={({ pressed }) => [
                        styles.cancelButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={cancelRoleEdit}
                      disabled={isSaving}
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
                      style={({ pressed }) => [
                        styles.saveButton,
                        pressed &&
                          styles.buttonPressed,
                      ]}
                      onPress={() =>
                        saveCollaboratorRole(
                          member
                        )
                      }
                      disabled={isSaving}
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

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>
          Como a equipe funciona
        </Text>

        <Text style={styles.infoText}>
          O proprietário controla as
          permissões administrativas.
          Administradores podem gerenciar
          o perfil e a equipe. Colaboradores
          possuem vínculo profissional com
          a empresa. O acesso às obras é
          controlado separadamente.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },

  brand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#F2F3EF',
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: '#74B892',
  },

  profileButton: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    backgroundColor: '#2E332F',
  },

  profileButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
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
    marginTop: 5,
    marginBottom: 20,
    fontSize: 14,
    fontWeight: '700',
    color: '#C0C7C1',
  },

  summaryCard: {
    marginBottom: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 18,
    backgroundColor: '#2E332F',
  },

  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  summaryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C8387',
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

  memberCard: {
    marginBottom: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 16,
    backgroundColor: '#2E332F',
  },

  memberHeader: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  protectedArea: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#292E2A',
  },

  protectedTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#C0C7C1',
  },

  protectedText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: '#929A93',
  },

  adminArea: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#30483A',
  },

  adminTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#506455',
  },

  adminText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: '#66736B',
  },

  demoteAdminButton: {
    minHeight: 40,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6C8C3',
    borderRadius: 10,
    backgroundColor: '#4A2F2D',
  },

  demoteAdminButtonText: {
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    color: '#FF8D83',
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
    borderColor: '#687069',
    borderRadius: 11,
    backgroundColor: '#2E332F',
  },

  editButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  removeButton: {
    minHeight: 42,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E6C8C3',
    borderRadius: 11,
    backgroundColor: '#4A2F2D',
  },

  removeButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FF8D83',
  },

  promoteAdminButton: {
    minHeight: 42,
    marginTop: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 11,
    backgroundColor: '#2E332F',
  },

  promoteAdminButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#74B892',
  },

  editorArea: {
    marginTop: 14,
    padding: 13,
    borderRadius: 13,
    backgroundColor: '#242824',
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
    borderColor: '#687069',
    borderRadius: 11,
    backgroundColor: '#2E332F',
    fontSize: 14,
    color: '#F2F3EF',
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
    borderColor: '#687069',
    borderRadius: 11,
    backgroundColor: '#2E332F',
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
    backgroundColor: '#E07A3A',
  },

  saveButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  buttonPressed: {
    opacity: 0.6,
  },

  infoCard: {
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#30483A',
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
    borderColor: '#4C534D',
    borderRadius: 18,
    backgroundColor: '#2E332F',
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    color: '#F2F3EF',
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
    backgroundColor: '#4A2F2D',
  },

  errorText: {
    fontSize: 13,
    color: '#FF8D83',
  },
});
