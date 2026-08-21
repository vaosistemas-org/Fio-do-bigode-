import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

type PendingLink = {
  link_id: string;
  company_id: string;
  company_name: string;
  user_id: string;
  full_name: string | null;
  role_title: string;
  status: string;
  requested_at: string;
};

export default function CompanyLinkRequestsScreen() {
  const router = useRouter();

  const [requests, setRequests] = useState<PendingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.rpc(
      'get_pending_company_links'
    );

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    setRequests(data ?? []);
    setLoading(false);
  }

  async function handleReview(
    linkId: string,
    decision: 'approved' | 'rejected'
  ) {
    setReviewingId(linkId);
    setMessage('');

    const { error } = await supabase.rpc(
      'review_company_link',
      {
        p_link_id: linkId,
        p_decision: decision,
      }
    );

    if (error) {
      setMessage(error.message);
      setReviewingId(null);
      return;
    }

    setRequests((current) =>
      current.filter((request) => request.link_id !== linkId)
    );

    setMessage(
      decision === 'approved'
        ? 'Vínculo aprovado com sucesso.'
        : 'Solicitação recusada.'
    );

    setReviewingId(null);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>
          Carregando solicitações...
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

        <Pressable
          style={styles.profileButton}
          onPress={() => router.replace('/links')}
        >
          <Text style={styles.profileButtonText}>
            Vínculos
          </Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>
          Solicitações de vínculo
        </Text>

        <Text style={styles.subtitle}>
          Aprove ou recuse profissionais que solicitaram vínculo
          com suas empresas.
        </Text>
      </View>

      <Pressable
        style={styles.refreshButton}
        onPress={loadRequests}
      >
        <Text style={styles.refreshButtonText}>
          Atualizar solicitações
        </Text>
      </Pressable>

      {!!message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}

      {requests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            Nenhuma solicitação pendente
          </Text>

          <Text style={styles.emptyText}>
            Quando um profissional solicitar vínculo, ele aparecerá
            aqui para análise.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {requests.map((request) => {
            const reviewing =
              reviewingId === request.link_id;

            return (
              <View
                key={request.link_id}
                style={styles.requestCard}
              >
                <Text style={styles.companyName}>
                  {request.company_name}
                </Text>

                <View style={styles.divider} />

                <Text style={styles.label}>
                  Profissional
                </Text>

                <Text style={styles.value}>
                  {request.full_name || 'Usuário do FIO'}
                </Text>

                <Text style={styles.label}>
                  Função solicitada
                </Text>

                <Text style={styles.value}>
                  {request.role_title}
                </Text>

                <Text style={styles.label}>
                  Solicitação enviada em
                </Text>

                <Text style={styles.value}>
                  {new Date(
                    request.requested_at
                  ).toLocaleDateString('pt-BR')}
                </Text>

                <View style={styles.actions}>
                  <Pressable
                    style={[
                      styles.approveButton,
                      reviewing && styles.buttonDisabled,
                    ]}
                    onPress={() =>
                      handleReview(
                        request.link_id,
                        'approved'
                      )
                    }
                    disabled={reviewing}
                  >
                    {reviewing ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <Text style={styles.approveButtonText}>
                        Aprovar
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    style={[
                      styles.rejectButton,
                      reviewing && styles.buttonDisabled,
                    ]}
                    onPress={() =>
                      handleReview(
                        request.link_id,
                        'rejected'
                      )
                    }
                    disabled={reviewing}
                  >
                    <Text style={styles.rejectButtonText}>
                      Recusar
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.footer}>
        Segue o fio da sua obra.
      </Text>
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
    paddingBottom: 48,
  },

  loadingContainer: {
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
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
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  profileButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  header: {
    marginBottom: 20,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F2F3EF',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#687177',
  },

  refreshButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  refreshButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  message: {
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 13,
    color: '#74B892',
  },

  emptyCard: {
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    backgroundColor: '#2E332F',
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  emptyText: {
    marginTop: 7,
    fontSize: 13,
    lineHeight: 19,
    color: '#C0C7C1',
  },

  list: {
    gap: 14,
  },

  requestCard: {
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    backgroundColor: '#2E332F',
  },

  companyName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  divider: {
    height: 1,
    marginVertical: 16,
    backgroundColor: '#383E39',
  },

  label: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8A9094',
  },

  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F2F3EF',
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },

  approveButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#5F7567',
  },

  approveButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  rejectButton: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#687069',
    backgroundColor: '#2E332F',
  },

  rejectButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#C0C7C1',
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
