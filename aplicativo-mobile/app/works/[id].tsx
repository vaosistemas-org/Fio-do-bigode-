import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

type Work = {
  id: string;
  code: string;
  client_name: string;
  client_phone: string;
  address: string;
  project_order: string | null;
  status: string;
  progress: number;
  next_visit_at: string | null;
  notes: string | null;
  updated_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  aguardando_peca: 'Aguardando peça',
  aguardando_cliente: 'Aguardando cliente',
  finalizada: 'Finalizada',
};

export default function WorkDetailsScreen() {
  const router = useRouter();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [work, setWork] =
    useState<Work | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState('');

  async function loadWork() {
    if (!id) {
      setMessage('Obra não encontrada.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } =
      await supabase
        .from('works')
        .select(`
          id,
          code,
          client_name,
          client_phone,
          address,
          project_order,
          status,
          progress,
          next_visit_at,
          notes,
          updated_at
        `)
        .eq('id', id)
        .maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setMessage(
        'Você não possui acesso a esta obra.'
      );
      setLoading(false);
      return;
    }

    setWork(data);
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadWork();
    }, [id])
  );

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text style={styles.loadingText}>
          Carregando obra...
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
      {/* TOPO */}
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
          style={
            styles.profileButton
          }
          onPress={() =>
            router.replace('/profile')
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

      {/* VOLTAR */}
      <Pressable
        style={
          styles.worksBackButton
        }
        onPress={() =>
          router.replace('/works')
        }
      >
        <Text
          style={
            styles.worksBackText
          }
        >
          ‹ Minhas obras
        </Text>
      </Pressable>

      {!!message && !work && (
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

      {work && (
        <>
          {/* CABEÇALHO DA OBRA */}
          <View
            style={styles.workHeader}
          >
            <Text style={styles.code}>
              {work.code}
            </Text>

            <Text style={styles.title}>
              {work.client_name}
            </Text>

            {!!work.project_order && (
              <Text
                style={styles.project}
              >
                {work.project_order}
              </Text>
            )}
          </View>

          {/* STATUS */}
          <View
            style={styles.statusRow}
          >
            <View
              style={styles.statusBadge}
            >
              <Text
                style={styles.statusText}
              >
                {STATUS_LABELS[
                  work.status
                ] ?? work.status}
              </Text>
            </View>

            <Text
              style={
                styles.progressText
              }
            >
              {work.progress}% concluída
            </Text>
          </View>

          <View
            style={
              styles.progressBackground
            }
          >
            <View
              style={[
                styles.progressValue,
                {
                  width:
                    `${Math.max(
                      0,
                      Math.min(
                        work.progress,
                        100
                      )
                    )}%` as `${number}%`,
                },
              ]}
            />
          </View>

          {/* INFORMAÇÕES */}
          <View style={styles.infoCard}>
            <Text
              style={
                styles.sectionTitle
              }
            >
              INFORMAÇÕES DA OBRA
            </Text>

            <Text style={styles.label}>
              Cliente
            </Text>

            <Text style={styles.value}>
              {work.client_name}
            </Text>

            <Text style={styles.label}>
              Telefone
            </Text>

            <Text style={styles.value}>
              {work.client_phone}
            </Text>

            <Text style={styles.label}>
              Endereço
            </Text>

            <Text style={styles.value}>
              {work.address}
            </Text>

            {!!work.project_order && (
              <>
                <Text
                  style={styles.label}
                >
                  Projeto / pedido
                </Text>

                <Text
                  style={styles.value}
                >
                  {
                    work.project_order
                  }
                </Text>
              </>
            )}

            <Text style={styles.label}>
              Próxima visita
            </Text>

            <Text style={styles.value}>
              {work.next_visit_at
                ? new Date(
                    work.next_visit_at
                  ).toLocaleString(
                    'pt-BR',
                    {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }
                  )
                : 'Não definida'}
            </Text>

            {!!work.notes && (
              <>
                <Text
                  style={styles.label}
                >
                  Observações
                </Text>

                <Text
                  style={styles.value}
                >
                  {work.notes}
                </Text>
              </>
            )}
          </View>

          {/* MÓDULOS */}
          <View
            style={styles.modulesHeader}
          >
            <Text
              style={
                styles.sectionHeading
              }
            >
              Gestão da obra
            </Text>

            <Text
              style={
                styles.modulesHint
              }
            >
              Acesse os módulos de
              acompanhamento desta obra.
            </Text>
          </View>

          <View
            style={styles.moduleGrid}
          >
            {/* AMBIENTES */}
            <Pressable
              style={styles.moduleCard}
              onPress={() =>
                router.push({
                  pathname:
                    '/environments',
                  params: {
                    workId: work.id,
                  },
                })
              }
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Ambientes
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Acompanhe ambientes,
                responsáveis e andamento
                da obra
              </Text>

              <Text
                style={
                  styles.moduleOpen
                }
              >
                Abrir ambientes ›
              </Text>
            </Pressable>

            {/* PENDÊNCIAS */}
            <View
              style={styles.moduleCard}
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Pendências
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Controle de itens e
                problemas
              </Text>

              <Text
                style={
                  styles.moduleStatus
                }
              >
                Em breve
              </Text>
            </View>

            {/* FOTOS */}
            <View
              style={styles.moduleCard}
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Fotos
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Registro fotográfico da
                obra
              </Text>

              <Text
                style={
                  styles.moduleStatus
                }
              >
                Em breve
              </Text>
            </View>

            {/* DIÁRIO */}
            <View
              style={styles.moduleCard}
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Diário
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Linha do tempo completa
              </Text>

              <Text
                style={
                  styles.moduleStatus
                }
              >
                Em breve
              </Text>
            </View>

            {/* VISITAS */}
            <View
              style={styles.moduleCard}
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Visitas
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Histórico de visitas
                técnicas
              </Text>

              <Text
                style={
                  styles.moduleStatus
                }
              >
                Em breve
              </Text>
            </View>

            {/* DOCUMENTOS */}
            <View
              style={styles.moduleCard}
            >
              <Text
                style={
                  styles.moduleTitle
                }
              >
                Documentos
              </Text>

              <Text
                style={
                  styles.moduleText
                }
              >
                Projetos, arquivos e
                versões
              </Text>

              <Text
                style={
                  styles.moduleStatus
                }
              >
                Em breve
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
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
    paddingBottom: 60,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F7F5',
  },

  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#777D80',
  },

  topBar: {
    flexDirection: 'row',
    justifyContent:
      'space-between',
    alignItems: 'center',
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

  worksBackButton: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  worksBackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  workHeader: {
    marginBottom: 8,
  },

  code: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#5F7567',
  },

  title: {
    marginTop: 6,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    color: '#2C343A',
  },

  project: {
    marginTop: 5,
    fontSize: 15,
    color: '#687177',
  },

  statusRow: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  statusBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#EEF1ED',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F7567',
  },

  progressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#596269',
  },

  progressBackground: {
    height: 8,
    marginTop: 12,
    marginBottom: 28,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#E5E7E4',
  },

  progressValue: {
    height: '100%',
    borderRadius: 20,
    backgroundColor: '#5F7567',
  },

  infoCard: {
    padding: 20,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  sectionTitle: {
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.3,
    color: '#5F7567',
  },

  label: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#8A9094',
  },

  value: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: '#2C343A',
  },

  modulesHeader: {
    marginTop: 30,
    marginBottom: 14,
  },

  sectionHeading: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C343A',
  },

  modulesHint: {
    marginTop: 5,
    fontSize: 12,
    lineHeight: 17,
    color: '#8A9094',
  },

  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },

  moduleCard: {
    width: '48%',
    minHeight: 130,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E7E9E6',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },

  moduleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#2C343A',
  },

  moduleText: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 17,
    color: '#777D80',
  },

  moduleStatus: {
    marginTop: 'auto',
    paddingTop: 12,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: '#8A9094',
  },

  moduleOpen: {
    marginTop: 'auto',
    paddingTop: 12,
    fontSize: 11,
    fontWeight: '800',
    color: '#E07A3A',
  },

  errorCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#FFF2F0',
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },
});