import {
    useCallback,
    useState,
} from 'react';

import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';

import { supabase } from '@/lib/supabase';

type CompanyProfile = {
  id: string;
  name: string;
  legal_name: string | null;
  business_type: string | null;
  description: string | null;
  logo_path: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  coverage_area: string | null;
  services: string[];
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  can_manage: boolean;
};

function hasContactInfo(
  company: CompanyProfile
) {
  return Boolean(
    company.phone ||
      company.whatsapp ||
      company.email ||
      company.website ||
      company.instagram
  );
}

function hasLocationInfo(
  company: CompanyProfile
) {
  return Boolean(
    company.address_line ||
      company.city ||
      company.state ||
      company.postal_code ||
      company.coverage_area
  );
}

export default function ProfessionalProfileScreen() {
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

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState('');

  async function loadCompany() {
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
      const {
        data,
        error,
      } = await supabase.rpc(
        'get_company_profile',
        {
          p_company_id:
            companyId,
        }
      );

      if (error) {
        setMessage(error.message);
        setCompany(null);
        return;
      }

      const loadedCompany =
        data?.[0] as
          | CompanyProfile
          | undefined;

      if (!loadedCompany) {
        setMessage(
          'Perfil profissional não encontrado.'
        );

        setCompany(null);
        return;
      }

      setCompany(
        loadedCompany
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o perfil profissional.'
      );

      setCompany(null);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadCompany();
    }, [companyId])
  );

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
          Carregando perfil
          profissional...
        </Text>
      </View>
    );
  }

  if (!company) {
    return (
      <View
        style={styles.loading}
      >
        <Text
          style={styles.errorText}
        >
          {message ||
            'Empresa não encontrada.'}
        </Text>

        <Pressable
          style={
            styles.returnButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.returnButtonText
            }
          >
            Voltar
          </Text>
        </Pressable>
      </View>
    );
  }

  const contactsAvailable =
    hasContactInfo(company);

  const locationAvailable =
    hasLocationInfo(company);

  return (
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

        <Pressable
          style={
            styles.profileButton
          }
          onPress={() =>
            router.push(
              '/profile'
            )
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
          ‹ Voltar
        </Text>
      </Pressable>

      <View
        style={
          styles.identityCard
        }
      >
        <View
          style={styles.logoPlaceholder}
        >
          <Text
            style={
              styles.logoInitial
            }
          >
            {company.name
              .trim()
              .charAt(0)
              .toUpperCase() ||
              'F'}
          </Text>
        </View>

        <View
          style={
            styles.identityInfo
          }
        >
          <View
            style={
              styles.identityTop
            }
          >
            <Text
              style={
                styles.companyName
              }
            >
              {company.name}
            </Text>

            <View
              style={[
                styles.statusBadge,
                !company.active &&
                  styles.statusBadgeInactive,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  !company.active &&
                    styles.statusTextInactive,
                ]}
              >
                {company.active
                  ? 'Ativa'
                  : 'Inativa'}
              </Text>
            </View>
          </View>

          <Text
            style={
              styles.businessType
            }
          >
            {company.business_type ||
              'Perfil profissional'}
          </Text>

          {company.legal_name ? (
            <Text
              style={
                styles.legalName
              }
            >
              {company.legal_name}
            </Text>
          ) : null}
        </View>
      </View>

      {company.can_manage && (
  <View
    style={
      styles.adminNotice
    }
  >
    <Text
      style={
        styles.adminNoticeTitle
      }
    >
      Você administra este perfil
    </Text>

    <Text
      style={
        styles.adminNoticeText
      }
    >
      Atualize as informações
      profissionais da empresa.
    </Text>

    <Pressable
      style={({ pressed }) => [
        styles.editProfileButton,
        pressed &&
          styles.editProfileButtonPressed,
      ]}
      onPress={() =>
        router.push({
          pathname:
            '/edit-professional-profile',
          params: {
            companyId:
              company.id,
          },
        })
      }
    >
      <Text
        style={
          styles.editProfileButtonText
        }
      >
        Editar perfil profissional
      </Text>
    </Pressable>
  </View>
)}

      <View style={styles.card}>
        <Text
          style={
            styles.sectionTitle
          }
        >
          SOBRE
        </Text>

        {company.description ? (
          <Text
            style={
              styles.description
            }
          >
            {company.description}
          </Text>
        ) : (
          <Text
            style={
              styles.emptyText
            }
          >
            Nenhuma descrição
            adicionada ainda.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text
          style={
            styles.sectionTitle
          }
        >
          SERVIÇOS
        </Text>

        {company.services.length >
        0 ? (
          <View
            style={
              styles.servicesWrap
            }
          >
            {company.services.map(
              (
                service,
                index
              ) => (
                <View
                  key={`${service}-${index}`}
                  style={
                    styles.serviceChip
                  }
                >
                  <Text
                    style={
                      styles.serviceText
                    }
                  >
                    {service}
                  </Text>
                </View>
              )
            )}
          </View>
        ) : (
          <Text
            style={
              styles.emptyText
            }
          >
            Nenhum serviço
            cadastrado ainda.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text
          style={
            styles.sectionTitle
          }
        >
          CONTATO
        </Text>

        {!contactsAvailable ? (
          <Text
            style={
              styles.emptyText
            }
          >
            Nenhuma informação de
            contato cadastrada.
          </Text>
        ) : (
          <>
            {company.whatsapp ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  WhatsApp
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {company.whatsapp}
                </Text>
              </View>
            ) : null}

            {company.phone ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Telefone
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {company.phone}
                </Text>
              </View>
            ) : null}

            {company.email ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  E-mail
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {company.email}
                </Text>
              </View>
            ) : null}

            {company.website ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Site
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {company.website}
                </Text>
              </View>
            ) : null}

            {company.instagram ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Instagram
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {company.instagram}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.card}>
        <Text
          style={
            styles.sectionTitle
          }
        >
          LOCALIZAÇÃO E ATENDIMENTO
        </Text>

        {!locationAvailable ? (
          <Text
            style={
              styles.emptyText
            }
          >
            Nenhuma localização
            cadastrada.
          </Text>
        ) : (
          <>
            {company.address_line ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Endereço
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {
                    company.address_line
                  }
                </Text>
              </View>
            ) : null}

            {company.city ||
            company.state ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Cidade
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {[
                    company.city,
                    company.state,
                  ]
                    .filter(Boolean)
                    .join(' / ')}
                </Text>
              </View>
            ) : null}

            {company.postal_code ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  CEP
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {
                    company.postal_code
                  }
                </Text>
              </View>
            ) : null}

            {company.coverage_area ? (
              <View
                style={
                  styles.infoRow
                }
              >
                <Text
                  style={
                    styles.infoLabel
                  }
                >
                  Área de atendimento
                </Text>

                <Text
                  style={
                    styles.infoValue
                  }
                >
                  {
                    company.coverage_area
                  }
                </Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {company.can_manage ? (
  <Pressable
    style={({ pressed }) => [
      styles.card,
      pressed &&
        styles.teamCardPressed,
    ]}
    onPress={() =>
      router.push({
        pathname: '/company-team',
        params: {
          companyId: company.id,
        },
      })
    }
  >
    <Text
      style={styles.sectionTitle}
    >
      EQUIPE
    </Text>

    <Text
      style={styles.teamCardTitle}
    >
      Gerenciar equipe
    </Text>

    <Text
      style={styles.emptyText}
    >
      Veja membros e colaboradores
      profissionais vinculados a esta
      empresa.
    </Text>

    <Text
      style={styles.teamOpenText}
    >
      Abrir equipe ›
    </Text>
  </Pressable>
) : (
  <View style={styles.card}>
    <Text
      style={styles.sectionTitle}
    >
      EQUIPE
    </Text>

    <Text
      style={styles.emptyText}
    >
      A equipe é administrada pelos
      responsáveis da empresa.
    </Text>
  </View>
)}
      {!!message && (
        <View
          style={
            styles.messageCard
          }
        >
          <Text
            style={
              styles.messageText
            }
          >
            {message}
          </Text>
        </View>
      )}
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
      paddingHorizontal: 30,
      backgroundColor:
        '#F7F7F5',
    },

    loadingText: {
      marginTop: 10,
      fontSize: 13,
      color: '#777D80',
    },

    errorText: {
      fontSize: 13,
      lineHeight: 19,
      textAlign: 'center',
      color: '#B42318',
    },

    returnButton: {
      marginTop: 18,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor:
        '#2C343A',
    },

    returnButtonText: {
      fontSize: 13,
      fontWeight: '800',
      color: '#FFFFFF',
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

    identityCard: {
      marginBottom: 14,
      padding: 18,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    logoPlaceholder: {
      width: 66,
      height: 66,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      backgroundColor:
        '#2C343A',
    },

    logoInitial: {
      fontSize: 26,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    identityInfo: {
      flex: 1,
    },

    identityTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent:
        'space-between',
      gap: 8,
    },

    companyName: {
      flex: 1,
      fontSize: 21,
      lineHeight: 26,
      fontWeight: '800',
      color: '#2C343A',
    },

    businessType: {
      marginTop: 5,
      fontSize: 13,
      fontWeight: '700',
      color: '#5F7567',
    },

    legalName: {
      marginTop: 3,
      fontSize: 11,
      color: '#898F93',
    },

    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor:
        '#EEF1ED',
    },

    statusBadgeInactive: {
      backgroundColor:
        '#F0ECE8',
    },

    statusText: {
      fontSize: 9,
      fontWeight: '800',
      color: '#506455',
    },

    statusTextInactive: {
      color: '#846D60',
    },

    adminNotice: {
      marginBottom: 14,
      padding: 15,
      borderWidth: 1,
      borderColor: '#F1D6C5',
      borderRadius: 14,
      backgroundColor:
        '#FFF7F1',
    },

    adminNoticeTitle: {
      fontSize: 13,
      fontWeight: '800',
      color: '#A65B32',
    },

    adminNoticeText: {
      marginTop: 4,
      fontSize: 11,
      lineHeight: 16,
      color: '#7C6B61',
    },

    card: {
      marginBottom: 14,
      padding: 18,
      borderWidth: 1,
      borderColor: '#E4E7E4',
      borderRadius: 18,
      backgroundColor:
        '#FFFFFF',
    },

    sectionTitle: {
      marginBottom: 12,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      color: '#5F7567',
    },

    description: {
      fontSize: 14,
      lineHeight: 21,
      color: '#2C343A',
    },

    emptyText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#898F93',
    },

    servicesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },

    serviceChip: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor:
        '#EEF1ED',
    },

    serviceText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#506455',
    },

    infoRow: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor:
        '#ECEEEC',
    },

    infoLabel: {
      marginBottom: 3,
      fontSize: 10,
      fontWeight: '800',
      color: '#898F93',
    },

    infoValue: {
      fontSize: 14,
      lineHeight: 20,
      color: '#2C343A',
    },

    messageCard: {
      marginBottom: 14,
      padding: 14,
      borderRadius: 12,
      backgroundColor:
        '#FFF2F0',
    },

    messageText: {
      fontSize: 13,
      lineHeight: 19,
      color: '#B42318',
    },

    editProfileButton: {
  minHeight: 46,
  marginTop: 13,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  backgroundColor: '#E07A3A',
},

editProfileButtonPressed: {
  opacity: 0.65,
},

editProfileButtonText: {
  fontSize: 13,
  fontWeight: '800',
  color: '#FFFFFF',
},

teamCardPressed: {
  opacity: 0.65,
},

teamCardTitle: {
  marginBottom: 5,
  fontSize: 15,
  fontWeight: '800',
  color: '#2C343A',
},

teamOpenText: {
  marginTop: 12,
  fontSize: 11,
  fontWeight: '800',
  color: '#E07A3A',
},
  });