import {
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type CategoryOption = {
  value: string;
  label: string;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

const CATEGORIES: CategoryOption[] = [
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'sala_estar', label: 'Sala de estar' },
  { value: 'sala_jantar', label: 'Sala de jantar' },
  { value: 'lavabo', label: 'Lavabo' },
  { value: 'banheiro', label: 'Banheiro' },
  { value: 'suite', label: 'SuÃ­te' },
  { value: 'dormitorio', label: 'DormitÃ³rio' },
  { value: 'closet', label: 'Closet' },
  { value: 'escritorio', label: 'EscritÃ³rio' },
  { value: 'lavanderia', label: 'Lavanderia' },
  { value: 'area_servico', label: 'Ãrea de serviÃ§o' },
  { value: 'varanda', label: 'Varanda' },
  { value: 'area_gourmet', label: 'Ãrea gourmet' },
  { value: 'hall', label: 'Hall' },
  { value: 'corredor', label: 'Corredor' },
  { value: 'garagem', label: 'Garagem' },
  { value: 'deposito', label: 'DepÃ³sito' },
  { value: 'outro_ambiente', label: 'Outro ambiente' },
];

export default function NewEnvironmentScreen() {
  const router = useRouter();

  const { workId } =
    useLocalSearchParams<{
      workId: string;
    }>();

  const {
    canWrite,
    loadingAccess,
    accessError,
  } = useWorkAccess(workId);

  const [work, setWork] =
    useState<Work | null>(null);

  const [category, setCategory] =
    useState('');

  const [identifier, setIdentifier] =
    useState('');

  const [customName, setCustomName] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  async function loadWork() {
    if (!workId) {
      setMessage('Obra nÃ£o encontrada.');
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
          client_name
        `)
        .eq('id', workId)
        .maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (!data) {
      setMessage(
        'VocÃª nÃ£o possui acesso a esta obra.'
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
    }, [workId])
  );

  async function handleCreate() {
    if (saving) {
      return;
    }

    setMessage('');

    if (!canWrite) {
      setMessage(
        'Seu acesso a esta obra Ã© somente para visualizaÃ§Ã£o.'
      );
      return;
    }

    if (!workId) {
      setMessage('Obra nÃ£o encontrada.');
      return;
    }

    if (!category) {
      setMessage(
        'Escolha o tipo de ambiente.'
      );
      return;
    }

    if (
      category === 'outro_ambiente' &&
      !customName.trim()
    ) {
      setMessage(
        'Informe o nome do ambiente.'
      );
      return;
    }

    setSaving(true);

    try {
      const { data, error } =
        await supabase.rpc(
          'create_environment',
          {
            p_work_id: workId,
            p_category: category,

            p_identifier:
              category ===
              'outro_ambiente'
                ? null
                : identifier.trim() ||
                  null,

            p_custom_name:
              category ===
              'outro_ambiente'
                ? customName.trim()
                : null,

            p_responsible_user_id:
              null,

            p_status:
              'nao_iniciado',

            p_progress: 0,

            p_weight: 1,

            p_services_notes: null,

            p_missing_items_notes:
              null,

            p_notes: null,

            p_client_visible: false,

            p_preparation_min_photos:
              0,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      const result =
        Array.isArray(data)
          ? data[0]
          : data;

      const environmentId =
        result?.environment_id;

      if (!environmentId) {
        setMessage(
          'O ambiente foi criado, mas nÃ£o foi possÃ­vel abrir o cadastro.'
        );
        return;
      }

      router.replace({
        pathname:
          '/environment/[id]',
        params: {
          id: environmentId,
        },
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'NÃ£o foi possÃ­vel criar o ambiente.'
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text style={styles.loadingText}>
          Carregando...
        </Text>
      </View>
    );
  }

  if (accessError || !canWrite) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>
          Seu acesso a esta obra Ã© somente para visualizaÃ§Ã£o.
        </Text>

        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.replace({
              pathname:
                '/environments',
              params: {
                workId,
              },
            })
          }
        >
          <Text
            style={
              styles.backButtonText
            }
          >
            â€¹ Voltar para ambientes
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.keyboard}
      behavior={
        Platform.OS === 'ios'
          ? 'padding'
          : undefined
      }
    >
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
              GESTÃƒO DE OBRAS
            </Text>
          </View>

          <Pressable
            style={styles.topButton}
            onPress={() =>
              router.replace('/profile')
            }
          >
            <Text
              style={
                styles.topButtonText
              }
            >
              Meu FIO
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.replace({
              pathname:
                '/environments',
              params: {
                workId,
              },
            })
          }
        >
          <Text
            style={
              styles.backButtonText
            }
          >
            â€¹ Ambientes
          </Text>
        </Pressable>

        {work && (
          <>
            <Text
              style={styles.workCode}
            >
              {work.code}
            </Text>

            <Text
              style={styles.workName}
            >
              {work.client_name}
            </Text>
          </>
        )}

        {/* CABEÃ‡ALHO */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            NOVO AMBIENTE
          </Text>

          <Text style={styles.title}>
            Qual Ã© o ambiente?
          </Text>

          <Text
            style={styles.subtitle}
          >
            Escolha o ambiente. Se
            houver mais de um do mesmo
            tipo, adicione uma
            identificaÃ§Ã£o.
          </Text>
        </View>

        {/* CATEGORIAS */}
        <View style={styles.card}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            TIPO DE AMBIENTE
          </Text>

          <View
            style={
              styles.categoryGrid
            }
          >
            {CATEGORIES.map(
              (option) => {
                const selected =
                  category ===
                  option.value;

                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.categoryButton,
                      selected &&
                        styles.categoryButtonSelected,
                    ]}
                    onPress={() => {
                      setCategory(
                        option.value
                      );

                      setMessage('');
                    }}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        selected &&
                          styles.categoryTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>

          {!!category &&
            category !==
              'outro_ambiente' && (
              <>
                <Text
                  style={styles.label}
                >
                  IdentificaÃ§Ã£o
                </Text>

                <TextInput
                  style={styles.input}
                  value={identifier}
                  onChangeText={
                    setIdentifier
                  }
                  placeholder="Ex.: Filho, Casal, Social..."
                  placeholderTextColor="#A3A8AB"
                  autoCapitalize="words"
                  editable={!saving}
                />

                <Text
                  style={styles.helper}
                >
                  Opcional. Use apenas
                  para diferenciar
                  ambientes do mesmo
                  tipo.
                </Text>
              </>
            )}

          {category ===
            'outro_ambiente' && (
            <>
              <Text
                style={styles.label}
              >
                Nome do ambiente *
              </Text>

              <TextInput
                style={styles.input}
                value={customName}
                onChangeText={
                  setCustomName
                }
                placeholder="Nome do ambiente"
                placeholderTextColor="#A3A8AB"
                autoCapitalize="words"
                editable={!saving}
              />
            </>
          )}
        </View>

        {!!message && (
          <View
            style={styles.messageCard}
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

        {/* CRIAR */}
        <Pressable
          style={[
            styles.createButton,
            (!category || saving) &&
              styles.createButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={
            !category || saving
          }
        >
          {saving ? (
            <View
              style={
                styles.loadingRow
              }
            >
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />

              <Text
                style={
                  styles.createButtonText
                }
              >
                Criando...
              </Text>
            </View>
          ) : (
            <Text
              style={
                styles.createButtonText
              }
            >
              Criar ambiente
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.cancelButton}
          onPress={() =>
            router.replace({
              pathname:
                '/environments',
              params: {
                workId,
              },
            })
          }
          disabled={saving}
        >
          <Text
            style={
              styles.cancelButtonText
            }
          >
            Cancelar
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

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
    paddingBottom: 70,
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

  topButton: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  topButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  workCode: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#5F7567',
  },

  workName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#70787D',
  },

  header: {
    marginTop: 22,
    marginBottom: 20,
  },

  eyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
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
    fontSize: 14,
    lineHeight: 21,
    color: '#71787D',
  },

  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4E7E4',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  sectionTitle: {
    marginBottom: 14,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#5F7567',
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  categoryButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 999,
    backgroundColor: '#FAFAF8',
  },

  categoryButtonSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF4EC',
  },

  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#697177',
  },

  categoryTextSelected: {
    color: '#A65B32',
  },

  label: {
    marginTop: 20,
    marginBottom: 7,
    fontSize: 12,
    fontWeight: '700',
    color: '#555E64',
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 12,
    backgroundColor: '#FAFAF8',
    fontSize: 15,
    color: '#2C343A',
  },

  helper: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: '#919699',
  },

  messageCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF2F0',
  },

  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },

  createButton: {
    minHeight: 52,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#E07A3A',
  },

  createButtonDisabled: {
    opacity: 0.5,
  },

  createButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#697177',
  },
});