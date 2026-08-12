import {
  useFocusEffect,
  useRouter,
} from 'expo-router';

import {
  useCallback,
  useState,
} from 'react';

import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

type MyCompany = {
  membership_id: string;
  company_id: string;
  company_name: string;
  role: string;
  active: boolean;
};

type ProfessionalLink = {
  link_id: string;
  company_id: string;
  company_name: string;
  role_title: string;
  status: string;
  requested_at: string;
  reviewed_at: string | null;
};

type CompanyContext = {
  company_id: string;
  company_name: string;
  relationship_type:
    | 'member'
    | 'collaborator';
  company_role: string | null;
  role_title: string | null;
  is_active: boolean;
};

export default function ProfileScreen() {
  const router = useRouter();

  const [
    fullName,
    setFullName,
  ] = useState('');

  const [
    jobTitle,
    setJobTitle,
  ] = useState('');

  const [
    coverageArea,
    setCoverageArea,
  ] = useState('');

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState<string | null>(
    null
  );

  const [
    myCompanies,
    setMyCompanies,
  ] = useState<MyCompany[]>([]);

  const [
    professionalLinks,
    setProfessionalLinks,
  ] = useState<
    ProfessionalLink[]
  >([]);

  const [
    companyContexts,
    setCompanyContexts,
  ] = useState<CompanyContext[]>(
    []
  );

  const [
    activeCompanyId,
    setActiveCompanyId,
  ] = useState<string | null>(
    null
  );

  const [
    contextModalVisible,
    setContextModalVisible,
  ] = useState(false);

  const [
    changingContext,
    setChangingContext,
  ] = useState(false);

  const [
    hasAdminCompany,
    setHasAdminCompany,
  ] = useState(false);

  const [
    pendingLinkRequestsCount,
    setPendingLinkRequestsCount,
  ] = useState(0);

  const [
    companyInvitationsCount,
    setCompanyInvitationsCount,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState('');

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [])
  );

  async function loadProfile() {
    setLoading(true);
    setMessage('');

    const {
      data: { user },
      error: userError,
    } =
      await supabase.auth.getUser();

    if (
      userError ||
      !user
    ) {
      setLoading(false);
      return;
    }

    const [
      profileResult,
      adminResult,
      myCompaniesResult,
      professionalLinksResult,
      pendingRequestsResult,
      invitationsResult,
      contextsResult,
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select(
          'full_name, job_title, coverage_area, avatar_url'
        )
        .eq('id', user.id)
        .maybeSingle(),

      supabase.rpc(
        'has_admin_company'
      ),

      supabase.rpc(
        'get_my_companies'
      ),

      supabase.rpc(
        'get_my_professional_links'
      ),

      supabase.rpc(
        'get_pending_company_links'
      ),

      supabase.rpc(
        'get_my_company_invitations'
      ),

      supabase.rpc(
        'get_my_company_contexts'
      ),
    ]);

    if (
      profileResult.error
    ) {
      setMessage(
        profileResult.error.message
      );
    } else {
      setFullName(
        profileResult.data
          ?.full_name ?? ''
      );

      setJobTitle(
        profileResult.data
          ?.job_title ?? ''
      );

      setCoverageArea(
        profileResult.data
          ?.coverage_area ?? ''
      );

      setAvatarUrl(
        profileResult.data
          ?.avatar_url ?? null
      );
    }

    if (
      adminResult.error
    ) {
      setHasAdminCompany(false);
    } else {
      setHasAdminCompany(
        Boolean(
          adminResult.data
        )
      );
    }

    if (
      myCompaniesResult.error
    ) {
      setMessage(
        myCompaniesResult.error.message
      );

      setMyCompanies([]);
    } else {
      setMyCompanies(
        (myCompaniesResult.data ??
          []) as MyCompany[]
      );
    }

    if (
      professionalLinksResult.error
    ) {
      setMessage(
        professionalLinksResult.error
          .message
      );

      setProfessionalLinks([]);
    } else {
      setProfessionalLinks(
        (professionalLinksResult.data ??
          []) as ProfessionalLink[]
      );
    }

    if (
      pendingRequestsResult.error
    ) {
      setPendingLinkRequestsCount(
        0
      );
    } else {
      setPendingLinkRequestsCount(
        Array.isArray(
          pendingRequestsResult.data
        )
          ? pendingRequestsResult
              .data.length
          : 0
      );
    }

    if (
      invitationsResult.error
    ) {
      setCompanyInvitationsCount(
        0
      );
    } else {
      setCompanyInvitationsCount(
        Array.isArray(
          invitationsResult.data
        )
          ? invitationsResult
              .data.length
          : 0
      );
    }

    if (
      contextsResult.error
    ) {
      setMessage(
        contextsResult.error.message
      );

      setCompanyContexts([]);
      setActiveCompanyId(null);
    } else {
      const contexts =
        (contextsResult.data ??
          []) as CompanyContext[];

      setCompanyContexts(
        contexts
      );

      const activeContext =
        contexts.find(
          (context) =>
            context.is_active
        );

      setActiveCompanyId(
        activeContext
          ?.company_id ?? null
      );
    }

    setLoading(false);
  }

  async function changeCompanyContext(
    companyId: string | null
  ) {
    if (changingContext) {
      return;
    }

    setChangingContext(true);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'set_active_company_context',
          {
            p_company_id:
              companyId,
          }
        );

      if (error) {
        setMessage(
          error.message
        );

        return;
      }

      setActiveCompanyId(
        companyId
      );

      setCompanyContexts(
        (current) =>
          current.map(
            (context) => ({
              ...context,
              is_active:
                context.company_id ===
                companyId,
            })
          )
      );

      setContextModalVisible(
        false
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível alterar o contexto profissional.'
      );
    } finally {
      setChangingContext(false);
    }
  }

  async function handleLogout() {
    setLoggingOut(true);
    setMessage('');

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      setMessage(
        error.message
      );

      setLoggingOut(false);
      return;
    }

    /*
     * O RootLayout percebe que não existe mais sessão
     * e libera automaticamente a tela de Login.
     */
  }

  function getStatusLabel(
    status: string
  ) {
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

  function getStatusStyle(
    status: string
  ) {
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

  function getCompanyRoleLabel(
    role: string
  ) {
    switch (role) {
      case 'owner':
        return 'Proprietário';

      case 'admin':
        return 'Administrador';

      default:
        return role;
    }
  }

  function getContextSecondaryLabel(
    context: CompanyContext
  ) {
    if (
      context.company_role ===
      'owner'
    ) {
      return 'Proprietário';
    }

    if (
      context.company_role ===
      'admin'
    ) {
      return 'Administrador';
    }

    if (
      context.role_title
    ) {
      return context.role_title;
    }

    return 'Vínculo profissional';
  }

  const activeContext =
    companyContexts.find(
      (context) =>
        context.company_id ===
        activeCompanyId
    ) ?? null;

  const approvedLinks =
    professionalLinks.filter(
      (link) =>
        link.status ===
        'approved'
    );

  const pendingOrRejectedLinks =
    professionalLinks.filter(
      (link) =>
        link.status !==
        'approved'
    );

  const initial =
    fullName
      .trim()
      .charAt(0)
      .toUpperCase() || 'F';

  if (loading) {
    return (
      <View
        style={
          styles.loadingContainer
        }
      >
        <ActivityIndicator />

        <Text
          style={
            styles.loadingText
          }
        >
          Carregando Meu FIO...
        </Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.page}
        contentContainerStyle={
          styles.content
        }
        showsVerticalScrollIndicator={
          false
        }
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
        </View>

        <Text
          style={styles.pageTitle}
        >
          Meu FIO
        </Text>

        <View
          style={styles.profileCard}
        >
          {avatarUrl ? (
            <Image
              source={{
                uri: avatarUrl,
              }}
              style={styles.avatar}
            />
          ) : (
            <View
              style={
                styles.avatarFallback
              }
            >
              <Text
                style={
                  styles.avatarInitial
                }
              >
                {initial}
              </Text>
            </View>
          )}

          <View
            style={
              styles.profileInfo
            }
          >
            <Text
              style={styles.name}
            >
              {fullName ||
                'Usuário do FIO'}
            </Text>

            {!!jobTitle && (
              <Text
                style={
                  styles.profileDetail
                }
              >
                {jobTitle}
              </Text>
            )}

            {!!coverageArea && (
              <Text
                style={
                  styles.profileDetail
                }
              >
                {coverageArea}
              </Text>
            )}

            <Pressable
              style={
                styles.inlineAction
              }
              onPress={() =>
                router.push(
                  '/edit-profile'
                )
              }
            >
              <Text
                style={
                  styles.inlineActionText
                }
              >
                Editar perfil
              </Text>
            </Pressable>
          </View>
        </View>

        <Text
          style={styles.sectionTitle}
        >
          ATUANDO POR
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.contextRow,
            pressed &&
              styles.buttonPressed,
          ]}
          onPress={() =>
            setContextModalVisible(
              true
            )
          }
        >
          <View
            style={
              styles.contextTextArea
            }
          >
            <Text
              style={
                styles.contextName
              }
            >
              {activeContext
                ? activeContext.company_name
                : 'Sem empresa'}
            </Text>

            <Text
              style={
                styles.contextHint
              }
            >
              Toque para alterar
            </Text>
          </View>

          <Text
            style={styles.chevron}
          >
            ›
          </Text>
        </Pressable>

        <Text
          style={styles.sectionTitle}
        >
          ACESSOS
        </Text>

        <View
          style={styles.listGroup}
        >
          <Pressable
            style={styles.listRow}
            onPress={() =>
              router.push(
                '/works'
              )
            }
          >
            <View
              style={
                styles.listTextArea
              }
            >
              <Text
                style={
                  styles.listTitle
                }
              >
                Obras
              </Text>

              <Text
                style={
                  styles.listSubtitle
                }
              >
                Acompanhar minhas obras
              </Text>
            </View>

            <Text
              style={
                styles.chevron
              }
            >
              ›
            </Text>
          </Pressable>

          {hasAdminCompany && (
            <Pressable
              style={[
                styles.listRow,
                styles.listDivider,
              ]}
              onPress={() =>
                router.push(
                  '/company-link-requests'
                )
              }
            >
              <View
                style={
                  styles.listTextArea
                }
              >
                <Text
                  style={
                    styles.listTitle
                  }
                >
                  Solicitações de vínculo
                  {pendingLinkRequestsCount >
                  0
                    ? ` · ${pendingLinkRequestsCount}`
                    : ''}
                </Text>

                <Text
                  style={
                    styles.listSubtitle
                  }
                >
                  Aprovar ou recusar
                  profissionais
                </Text>
              </View>

              <Text
                style={
                  styles.chevron
                }
              >
                ›
              </Text>
            </Pressable>
          )}

          <Pressable
            style={[
              styles.listRow,
              styles.listDivider,
            ]}
            onPress={() =>
              router.push(
                '/company-invitations'
              )
            }
          >
            <View
              style={
                styles.listTextArea
              }
            >
              <Text
                style={
                  styles.listTitle
                }
              >
                Convites recebidos
                {companyInvitationsCount >
                0
                  ? ` · ${companyInvitationsCount}`
                  : ''}
              </Text>

              <Text
                style={
                  styles.listSubtitle
                }
              >
                Aceitar ou recusar
                convites de empresas
              </Text>
            </View>

            <Text
              style={
                styles.chevron
              }
            >
              ›
            </Text>
          </Pressable>
        </View>

        <Text
          style={styles.sectionTitle}
        >
          VIDA PROFISSIONAL
        </Text>

        <Text
          style={styles.subsectionTitle}
        >
          Minhas empresas
        </Text>

        {myCompanies.length ===
        0 ? (
          <View
            style={
              styles.emptyRow
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              Nenhuma empresa própria
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Empresas que você
              administra aparecerão
              aqui.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.listGroup
            }
          >
            {myCompanies.map(
              (
                company,
                index
              ) => (
                <Pressable
                  key={
                    company.membership_id
                  }
                  style={[
                    styles.listRow,
                    index > 0 &&
                      styles.listDivider,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname:
                        '/professional-profile',
                      params: {
                        companyId:
                          company.company_id,
                      },
                    })
                  }
                >
                  <View
                    style={
                      styles.listTextArea
                    }
                  >
                    <Text
                      style={
                        styles.listTitle
                      }
                    >
                      {
                        company.company_name
                      }
                    </Text>

                    <Text
                      style={
                        styles.listSubtitle
                      }
                    >
                      {getCompanyRoleLabel(
                        company.role
                      )}
                    </Text>
                  </View>

                  <Text
                    style={
                      styles.chevron
                    }
                  >
                    ›
                  </Text>
                </Pressable>
              )
            )}
          </View>
        )}

        <Text
          style={[
            styles.subsectionTitle,
            styles.subsectionSpacing,
          ]}
        >
          Meus vínculos
        </Text>

        {approvedLinks.length ===
        0 ? (
          <View
            style={
              styles.emptyRow
            }
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              Nenhum vínculo ativo
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Seus vínculos
              profissionais ativos
              aparecerão aqui.
            </Text>
          </View>
        ) : (
          <View
            style={
              styles.listGroup
            }
          >
            {approvedLinks.map(
              (
                link,
                index
              ) => (
                <View
                  key={
                    link.link_id
                  }
                >
                  <Pressable
                    style={[
                      styles.listRow,
                      index > 0 &&
                        styles.listDivider,
                    ]}
                    onPress={() =>
                      router.push({
                        pathname:
                          '/professional-profile',
                        params: {
                          companyId:
                            link.company_id,
                        },
                      })
                    }
                  >
                    <View
                      style={
                        styles.listTextArea
                      }
                    >
                      <Text
                        style={
                          styles.listTitle
                        }
                      >
                        {
                          link.company_name
                        }
                      </Text>

                      <Text
                        style={
                          styles.listSubtitle
                        }
                      >
                        {
                          link.role_title
                        }
                      </Text>
                    </View>

                    <Text
                      style={
                        styles.chevron
                      }
                    >
                      ›
                    </Text>
                  </Pressable>

                  <Pressable
                    style={
                      styles.leaveLinkAction
                    }
                    onPress={() => {
                      Alert.alert(
                        'Encerrar vínculo?',
                        `Você deixará de fazer parte da equipe de ${link.company_name}. O histórico do vínculo será preservado.`,
                        [
                          {
                            text:
                              'Cancelar',
                            style:
                              'cancel',
                          },
                          {
                            text:
                              'Encerrar vínculo',
                            style:
                              'destructive',
                            onPress:
                              async () => {
                                setMessage(
                                  ''
                                );

                                const {
                                  error,
                                } =
                                  await supabase.rpc(
                                    'leave_company_professional_link',
                                    {
                                      p_link_id:
                                        link.link_id,
                                    }
                                  );

                                if (
                                  error
                                ) {
                                  setMessage(
                                    error.message
                                  );

                                  return;
                                }

                                if (
                                  activeCompanyId ===
                                  link.company_id
                                ) {
                                  const {
                                    error:
                                      contextError,
                                  } =
                                    await supabase.rpc(
                                      'set_active_company_context',
                                      {
                                        p_company_id:
                                          null,
                                      }
                                    );

                                  if (
                                    contextError
                                  ) {
                                    setMessage(
                                      contextError.message
                                    );

                                    await loadProfile();
                                    return;
                                  }
                                }

                                setMessage(
                                  'Vínculo encerrado.'
                                );

                                await loadProfile();
                              },
                          },
                        ]
                      );
                    }}
                  >
                    <Text
                      style={
                        styles.leaveLinkActionText
                      }
                    >
                      Encerrar vínculo
                    </Text>
                  </Pressable>
                </View>
              )
            )}
          </View>
        )}

        {pendingOrRejectedLinks.length >
          0 && (
          <>
            <Text
              style={[
                styles.subsectionTitle,
                styles.subsectionSpacing,
              ]}
            >
              Outras solicitações
            </Text>

            <View
              style={
                styles.listGroup
              }
            >
              {pendingOrRejectedLinks.map(
                (
                  link,
                  index
                ) => (
                  <View
                    key={
                      link.link_id
                    }
                    style={[
                      styles.listRow,
                      index > 0 &&
                        styles.listDivider,
                    ]}
                  >
                    <View
                      style={
                        styles.listTextArea
                      }
                    >
                      <Text
                        style={
                          styles.listTitle
                        }
                      >
                        {
                          link.company_name
                        }
                      </Text>

                      <Text
                        style={
                          styles.listSubtitle
                        }
                      >
                        {
                          link.role_title
                        }
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        getStatusStyle(
                          link.status
                        ),
                      ]}
                    >
                      <Text
                        style={
                          styles.statusText
                        }
                      >
                        {getStatusLabel(
                          link.status
                        )}
                      </Text>
                    </View>
                  </View>
                )
              )}
            </View>
          </>
        )}

        <Pressable
          style={
            styles.companySearchButton
          }
          onPress={() =>
            router.push(
              '/company-link'
            )
          }
        >
          <Text
            style={
              styles.companySearchButtonText
            }
          >
            Buscar vínculo profissional
          </Text>
        </Pressable>

        {!!message && (
          <Text
            style={
              styles.message
            }
          >
            {message}
          </Text>
        )}

        <Pressable
          style={[
            styles.logoutButton,
            loggingOut &&
              styles.buttonDisabled,
          ]}
          onPress={
            handleLogout
          }
          disabled={
            loggingOut
          }
        >
          {loggingOut ? (
            <ActivityIndicator
              color="#A65B32"
            />
          ) : (
            <Text
              style={
                styles.logoutButtonText
              }
            >
              Sair do FIO
            </Text>
          )}
        </Pressable>

        <Text
          style={styles.footer}
        >
          Segue o fio da sua obra.
        </Text>
      </ScrollView>

      <Modal
        visible={
          contextModalVisible
        }
        transparent
        animationType="fade"
        onRequestClose={() =>
          setContextModalVisible(
            false
          )
        }
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() =>
            setContextModalVisible(
              false
            )
          }
        >
          <Pressable
            style={styles.modalCard}
            onPress={() => {}}
          >
            <Text
              style={styles.modalTitle}
            >
              Atuar por
            </Text>

            <Text
              style={
                styles.modalSubtitle
              }
            >
              Escolha o contexto
              profissional que o FIO
              deve usar.
            </Text>

            <Pressable
              style={[
                styles.contextOption,
                !activeCompanyId &&
                  styles.contextOptionSelected,
              ]}
              onPress={() =>
                changeCompanyContext(
                  null
                )
              }
              disabled={
                changingContext
              }
            >
              <View
                style={
                  styles.contextOptionTextArea
                }
              >
                <Text
                  style={
                    styles.contextOptionTitle
                  }
                >
                  Sem empresa
                </Text>

                <Text
                  style={
                    styles.contextOptionSubtitle
                  }
                >
                  Contexto pessoal
                </Text>
              </View>

              {!activeCompanyId && (
                <Text
                  style={
                    styles.contextCheck
                  }
                >
                  ✓
                </Text>
              )}
            </Pressable>

            {companyContexts.map(
              (context) => {
                const selected =
                  context.company_id ===
                  activeCompanyId;

                return (
                  <Pressable
                    key={
                      context.company_id
                    }
                    style={[
                      styles.contextOption,
                      styles.contextOptionDivider,
                      selected &&
                        styles.contextOptionSelected,
                    ]}
                    onPress={() =>
                      changeCompanyContext(
                        context.company_id
                      )
                    }
                    disabled={
                      changingContext
                    }
                  >
                    <View
                      style={
                        styles.contextOptionTextArea
                      }
                    >
                      <Text
                        style={
                          styles.contextOptionTitle
                        }
                      >
                        {
                          context.company_name
                        }
                      </Text>

                      <Text
                        style={
                          styles.contextOptionSubtitle
                        }
                      >
                        {getContextSecondaryLabel(
                          context
                        )}
                      </Text>
                    </View>

                    {selected && (
                      <Text
                        style={
                          styles.contextCheck
                        }
                      >
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              }
            )}

            {changingContext && (
              <View
                style={
                  styles.modalLoading
                }
              >
                <ActivityIndicator />
              </View>
            )}

            <Pressable
              style={
                styles.modalCloseButton
              }
              onPress={() =>
                setContextModalVisible(
                  false
                )
              }
              disabled={
                changingContext
              }
            >
              <Text
                style={
                  styles.modalCloseButtonText
                }
              >
                Fechar
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
      paddingBottom: 48,
    },

    loadingContainer: {
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
      marginBottom: 22,
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
      marginBottom: 16,
      fontSize: 32,
      fontWeight: '700',
      color: '#2C343A',
    },

    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 28,
      paddingVertical: 4,
    },

    avatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
    },

    avatarFallback: {
      width: 58,
      height: 58,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 29,
      backgroundColor:
        '#2C343A',
    },

    avatarInitial: {
      fontSize: 23,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    profileInfo: {
      flex: 1,
      marginLeft: 15,
    },

    name: {
      fontSize: 19,
      fontWeight: '800',
      color: '#2C343A',
    },

    profileDetail: {
      marginTop: 2,
      fontSize: 12,
      color: '#687177',
    },

    inlineAction: {
      alignSelf: 'flex-start',
      marginTop: 6,
    },

    inlineActionText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#E07A3A',
    },

    sectionTitle: {
      marginTop: 4,
      marginBottom: 9,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.3,
      color: '#5F7567',
    },

    contextRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 28,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: '#E7E9E6',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    contextTextArea: {
      flex: 1,
    },

    contextName: {
      fontSize: 15,
      fontWeight: '800',
      color: '#2C343A',
    },

    contextHint: {
      marginTop: 3,
      fontSize: 11,
      color: '#777D80',
    },

    listGroup: {
      marginBottom: 26,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: '#E7E9E6',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    listRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor:
        '#FFFFFF',
    },

    listDivider: {
      borderTopWidth: 1,
      borderTopColor: '#ECEEEC',
    },

    listTextArea: {
      flex: 1,
      paddingRight: 12,
    },

    listTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#2C343A',
    },

    listSubtitle: {
      marginTop: 3,
      fontSize: 11,
      color: '#777D80',
    },

    chevron: {
      marginLeft: 12,
      fontSize: 24,
      color: '#8A9094',
    },

    subsectionTitle: {
      marginBottom: 8,
      fontSize: 13,
      fontWeight: '800',
      color: '#2C343A',
    },

    subsectionSpacing: {
      marginTop: 2,
    },

    emptyRow: {
      marginBottom: 24,
      padding: 16,
      borderWidth: 1,
      borderColor: '#E7E9E6',
      borderRadius: 14,
      backgroundColor:
        '#FFFFFF',
    },

    emptyTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#2C343A',
    },

    emptyText: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 17,
      color: '#777D80',
    },

    leaveLinkAction: {
      minHeight: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: 1,
      borderTopColor: '#F0E4DF',
      backgroundColor:
        '#FFF8F7',
    },

    leaveLinkActionText: {
      fontSize: 10,
      fontWeight: '800',
      color: '#B42318',
    },

    statusBadge: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },

    statusApproved: {
      backgroundColor:
        '#E8EEE9',
    },

    statusPending: {
      backgroundColor:
        '#FFF1E6',
    },

    statusRejected: {
      backgroundColor:
        '#F2F2F0',
    },

    statusDefault: {
      backgroundColor:
        '#F2F2F0',
    },

    statusText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#2C343A',
    },

    companySearchButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 28,
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 12,
      backgroundColor:
        '#FFFFFF',
    },

    companySearchButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#2C343A',
    },

    message: {
      marginBottom: 16,
      textAlign: 'center',
      fontSize: 12,
      color: '#A65B32',
    },

    logoutButton: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E6D6CD',
      borderRadius: 12,
      backgroundColor:
        '#FFFFFF',
    },

    logoutButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#A65B32',
    },

    buttonPressed: {
      opacity: 0.65,
    },

    buttonDisabled: {
      opacity: 0.55,
    },

    footer: {
      marginTop: 24,
      textAlign: 'center',
      fontSize: 12,
      color: '#8A9094',
    },

    modalBackdrop: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      backgroundColor:
        'rgba(44, 52, 58, 0.35)',
    },

    modalCard: {
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
      padding: 18,
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    modalTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: '#2C343A',
    },

    modalSubtitle: {
      marginTop: 5,
      marginBottom: 14,
      fontSize: 12,
      lineHeight: 18,
      color: '#777D80',
    },

    contextOption: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 11,
    },

    contextOptionDivider: {
      borderTopWidth: 1,
      borderTopColor: '#ECEEEC',
    },

    contextOptionSelected: {
      backgroundColor:
        '#EEF1ED',
    },

    contextOptionTextArea: {
      flex: 1,
      paddingRight: 12,
    },

    contextOptionTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#2C343A',
    },

    contextOptionSubtitle: {
      marginTop: 2,
      fontSize: 10,
      color: '#777D80',
    },

    contextCheck: {
      fontSize: 18,
      fontWeight: '800',
      color: '#5F7567',
    },

    modalLoading: {
      paddingVertical: 10,
      alignItems: 'center',
    },

    modalCloseButton: {
      minHeight: 44,
      marginTop: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#D8DCDA',
      borderRadius: 11,
      backgroundColor:
        '#FFFFFF',
    },

    modalCloseButtonText: {
      fontSize: 12,
      fontWeight: '800',
      color: '#2C343A',
    },
  });
