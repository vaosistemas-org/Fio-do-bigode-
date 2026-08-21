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
    View,
} from 'react-native';

import {
    useFocusEffect,
    useRouter,
} from 'expo-router';

import { supabase } from '@/lib/supabase';

type CompanyInvitation = {
  link_id: string;
  company_id: string;
  company_name: string;
  role_title: string;
  requested_at: string;
  invited_by: string;
  invited_by_name: string;
};

export default function CompanyInvitationsScreen() {
  const router = useRouter();

  const [
    invitations,
    setInvitations,
  ] =
    useState<CompanyInvitation[]>(
      []
    );

  const [loading, setLoading] =
    useState(true);

  const [
    respondingId,
    setRespondingId,
  ] = useState<string | null>(
    null
  );

  const [message, setMessage] =
    useState('');

  async function loadInvitations() {
    setLoading(true);
    setMessage('');

    try {
      const { data, error } =
        await supabase.rpc(
          'get_my_company_invitations'
        );

      if (error) {
        setMessage(
          error.message
        );

        setInvitations([]);
        return;
      }

      setInvitations(
        (data ??
          []) as CompanyInvitation[]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar seus convites.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadInvitations();
    }, [])
  );

  async function respondInvitation(
    invitation: CompanyInvitation,
    decision:
      | 'approved'
      | 'rejected'
  ) {
    if (respondingId) {
      return;
    }

    setRespondingId(
      invitation.link_id
    );

    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'respond_company_invitation',
          {
            p_link_id:
              invitation.link_id,

            p_decision:
              decision,
          }
        );

      if (error) {
        setMessage(
          error.message
        );

        return;
      }

      setInvitations(
        (current) =>
          current.filter(
            (item) =>
              item.link_id !==
              invitation.link_id
          )
      );

      if (
        decision === 'approved'
      ) {
        Alert.alert(
          'Convite aceito',
          `Agora você possui vínculo profissional com ${invitation.company_name}.`,
          [
            {
              text: 'Voltar aos Vínculos',
              onPress: () =>
                router.back(),
            },
          ]
        );

        return;
      }

      Alert.alert(
        'Convite recusado',
        `O convite de ${invitation.company_name} foi recusado.`,
        [
          {
            text: 'OK',
          },
        ]
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível responder ao convite.'
      );
    } finally {
      setRespondingId(null);
    }
  }

  function confirmAccept(
    invitation: CompanyInvitation
  ) {
    Alert.alert(
      'Aceitar convite?',
      `Você entrará na equipe de ${invitation.company_name} como ${invitation.role_title}.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Aceitar',
          onPress: () =>
            respondInvitation(
              invitation,
              'approved'
            ),
        },
      ]
    );
  }

  function confirmReject(
    invitation: CompanyInvitation
  ) {
    Alert.alert(
      'Recusar convite?',
      `Você quer recusar o convite de ${invitation.company_name}?`,
      [
        {
          text: 'Voltar',
          style: 'cancel',
        },
        {
          text: 'Recusar',
          style: 'destructive',
          onPress: () =>
            respondInvitation(
              invitation,
              'rejected'
            ),
        },
      ]
    );
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
          Carregando convites...
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
          ‹ Vínculos
        </Text>
      </Pressable>

      <Text
        style={styles.eyebrow}
      >
        MEU FIO
      </Text>

      <Text
        style={styles.title}
      >
        Convites recebidos
      </Text>

      <Text
        style={styles.subtitle}
      >
        Empresas podem convidar você
        para fazer parte da equipe
        profissional.
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

      {!message &&
        invitations.length ===
          0 && (
          <View
            style={styles.emptyCard}
          >
            <Text
              style={
                styles.emptyTitle
              }
            >
              Nenhum convite pendente
            </Text>

            <Text
              style={
                styles.emptyText
              }
            >
              Quando uma empresa
              convidar você para a
              equipe, o convite
              aparecerá aqui.
            </Text>
          </View>
        )}

      {invitations.map(
        (invitation) => {
          const isResponding =
            respondingId ===
            invitation.link_id;

          return (
            <View
              key={
                invitation.link_id
              }
              style={
                styles.invitationCard
              }
            >
              <Text
                style={
                  styles.companyName
                }
              >
                {
                  invitation.company_name
                }
              </Text>

              <View
                style={
                  styles.roleArea
                }
              >
                <Text
                  style={
                    styles.roleLabel
                  }
                >
                  FUNÇÃO
                </Text>

                <Text
                  style={
                    styles.roleValue
                  }
                >
                  {
                    invitation.role_title
                  }
                </Text>
              </View>

              <Text
                style={
                  styles.invitedBy
                }
              >
                Convite enviado por{' '}
                {
                  invitation.invited_by_name
                }
              </Text>

              <View
                style={
                  styles.actionRow
                }
              >
                <Pressable
                  style={({
                    pressed,
                  }) => [
                    styles.rejectButton,

                    pressed &&
                      styles.pressed,
                  ]}
                  onPress={() =>
                    confirmReject(
                      invitation
                    )
                  }
                  disabled={
                    respondingId !==
                    null
                  }
                >
                  <Text
                    style={
                      styles.rejectButtonText
                    }
                  >
                    Recusar
                  </Text>
                </Pressable>

                <Pressable
                  style={({
                    pressed,
                  }) => [
                    styles.acceptButton,

                    pressed &&
                      styles.pressed,

                    isResponding &&
                      styles.disabled,
                  ]}
                  onPress={() =>
                    confirmAccept(
                      invitation
                    )
                  }
                  disabled={
                    respondingId !==
                    null
                  }
                >
                  {isResponding ? (
                    <ActivityIndicator
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={
                        styles.acceptButtonText
                      }
                    >
                      Aceitar convite
                    </Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        }
      )}

      <View
        style={styles.infoCard}
      >
        <Text
          style={styles.infoTitle}
        >
          Vínculo profissional
        </Text>

        <Text
          style={styles.infoText}
        >
          Aceitar um convite cria seu
          vínculo com a empresa. Isso
          não libera automaticamente o
          acesso às obras da empresa.
        </Text>
      </View>
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
      marginBottom: 24,
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
      marginTop: 5,
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    subtitle: {
      marginTop: 8,
      marginBottom: 22,
      fontSize: 13,
      lineHeight: 19,
      color: '#C0C7C1',
    },

    invitationCard: {
      marginBottom: 12,
      padding: 17,
      borderWidth: 1,
      borderColor: '#4C534D',
      borderRadius: 16,
      backgroundColor: '#2E332F',
    },

    companyName: {
      fontSize: 17,
      fontWeight: '800',
      color: '#F2F3EF',
    },

    roleArea: {
      marginTop: 13,
      padding: 12,
      borderRadius: 12,
      backgroundColor: '#242824',
    },

    roleLabel: {
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 1,
      color: '#8A9093',
    },

    roleValue: {
      marginTop: 4,
      fontSize: 13,
      fontWeight: '800',
      color: '#74B892',
    },

    invitedBy: {
      marginTop: 10,
      fontSize: 10,
      color: '#8B9195',
    },

    actionRow: {
      marginTop: 16,
      flexDirection: 'row',
      gap: 8,
    },

    rejectButton: {
      minHeight: 46,
      paddingHorizontal: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: '#E6C8C3',
      borderRadius: 12,
      backgroundColor:
        '#4A2F2D',
    },

    rejectButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FF8D83',
    },

    acceptButton: {
      flex: 1,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor:
        '#E07A3A',
    },

    acceptButtonText: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FFFFFF',
    },

    pressed: {
      opacity: 0.65,
    },

    disabled: {
      opacity: 0.55,
    },

    emptyCard: {
      padding: 24,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#4C534D',
      borderRadius: 16,
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
      fontSize: 11,
      lineHeight: 17,
      textAlign: 'center',
      color: '#858B8F',
    },

    infoCard: {
      marginTop: 18,
      padding: 16,
      borderRadius: 14,
      backgroundColor: '#383E39',
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
        '#4A2F2D',
    },

    errorText: {
      fontSize: 12,
      lineHeight: 17,
      color: '#FF8D83',
    },
  });
