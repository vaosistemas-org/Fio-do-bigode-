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

type EnvironmentStatus =
  | 'nao_iniciado'
  | 'em_andamento'
  | 'aguardando'
  | 'concluido'
  | 'cancelado';

type Environment = {
  id: string;
  work_id: string;
  name: string;
  status: EnvironmentStatus;
  progress: number;
  responsible_user_id: string | null;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

const STATUS_OPTIONS: {
  value: EnvironmentStatus;
  label: string;
}[] = [
  {
    value: 'nao_iniciado',
    label: 'Não iniciado',
  },
  {
    value: 'em_andamento',
    label: 'Em andamento',
  },
  {
    value: 'aguardando',
    label: 'Aguardando',
  },
  {
    value: 'concluido',
    label: 'Concluído',
  },
  {
    value: 'cancelado',
    label: 'Cancelado',
  },
];

const QUICK_PROGRESS = [
  0,
  25,
  50,
  75,
  100,
];

export default function EnvironmentProgressScreen() {
  const router = useRouter();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [
    environment,
    setEnvironment,
  ] = useState<Environment | null>(
    null
  );

  const [work, setWork] =
    useState<Work | null>(null);

  const [
    status,
    setStatus,
  ] =
    useState<EnvironmentStatus>(
      'nao_iniciado'
    );

  const [progress, setProgress] =
    useState(0);

  const [
    observation,
    setObservation,
  ] = useState('');

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const {
    userId,
    canManage,
    canWrite,
    accessLevel,
    loadingAccess,
    accessError,
  } = useWorkAccess(
    environment?.work_id
  );

  async function loadData() {
    if (!id) {
      setMessage(
        'Ambiente não encontrado.'
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const {
      data: environmentData,
      error: environmentError,
    } = await supabase
      .from('environments')
      .select(`
        id,
        work_id,
        name,
        status,
        progress,
        responsible_user_id
      `)
      .eq('id', id)
      .maybeSingle();

    if (environmentError) {
      setMessage(
        environmentError.message
      );
      setLoading(false);
      return;
    }

    if (!environmentData) {
      setMessage(
        'Ambiente não encontrado.'
      );
      setLoading(false);
      return;
    }

    const typedEnvironment =
      environmentData as Environment;

    setEnvironment(
      typedEnvironment
    );

    setStatus(
      typedEnvironment.status
    );

    setProgress(
      typedEnvironment.progress
    );

    const {
      data: workData,
      error: workError,
    } = await supabase
      .from('works')
      .select(`
        id,
        code,
        client_name
      `)
      .eq(
        'id',
        typedEnvironment.work_id
      )
      .maybeSingle();

    if (workError) {
      setMessage(
        workError.message
      );
    }

    if (workData) {
      setWork(workData);
    }

    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  const isResponsible =
    !!environment &&
    !!userId &&
    environment.responsible_user_id ===
      userId;

  const canRegisterProgress =
    canManage ||
    (
      canWrite &&
      isResponsible
    );

  function goBack() {
    if (!environment) {
      router.back();
      return;
    }

    router.replace({
      pathname:
        '/environment/[id]',
      params: {
        id: environment.id,
      },
    });
  }

  function changeStatus(
    newStatus: EnvironmentStatus
  ) {
    if (!canRegisterProgress) {
      return;
    }

    setStatus(newStatus);

    if (
      newStatus === 'nao_iniciado'
    ) {
      setProgress(0);
      return;
    }

    if (
      newStatus === 'concluido'
    ) {
      setProgress(100);
      return;
    }

    if (
      newStatus === 'em_andamento' &&
      progress === 0
    ) {
      setProgress(10);
    }
  }

  function changeProgress(
    value: number
  ) {
    if (!canRegisterProgress) {
      return;
    }

    const nextValue = Math.max(
      0,
      Math.min(value, 100)
    );

    setProgress(nextValue);

    if (nextValue === 0) {
      setStatus('nao_iniciado');
      return;
    }

    if (nextValue === 100) {
      setStatus('concluido');
      return;
    }

    if (
      status === 'nao_iniciado' ||
      status === 'concluido'
    ) {
      setStatus('em_andamento');
    }
  }

  async function handleSave() {
    if (
      saving ||
      !environment ||
      !canRegisterProgress
    ) {
      return;
    }

    setSaving(true);
    setMessage('');

    try {
      const { error } =
        await supabase.rpc(
          'record_environment_progress',
          {
            p_environment_id:
              environment.id,

            p_status: status,

            p_progress:
              progress,

            p_observation:
              observation.trim() ||
              null,
          }
        );

      if (error) {
        setMessage(error.message);
        return;
      }

      goBack();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível registrar o avanço.'
      );
    } finally {
      setSaving(false);
    }
  }

  const waitingForAccess =
    !!environment &&
    !accessLevel &&
    !accessError;

  if (
    loading ||
    loadingAccess ||
    waitingForAccess
  ) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />

        <Text
          style={styles.loadingText}
        >
          Carregando ambiente...
        </Text>
      </View>
    );
  }

  if (!environment) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>
          {message ||
            'Ambiente não encontrado.'}
        </Text>

        <Pressable
          style={
            styles.deniedBackButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Text
            style={
              styles.deniedBackButtonText
            }
          >
            Voltar
          </Text>
        </Pressable>
      </View>
    );
  }

  if (
    accessError ||
    !canRegisterProgress
  ) {
    return (
      <View
        style={styles.deniedPage}
      >
        <Text
          style={styles.deniedEyebrow}
        >
          REGISTRAR AVANÇO
        </Text>

        <Text
          style={styles.deniedTitle}
        >
          Sem permissão para alterar
        </Text>

        <Text
          style={styles.deniedText}
        >
          {accessError ||
            'Somente o proprietário, um gestor ou o colaborador responsável por este ambiente pode registrar o andamento.'}
        </Text>

        <Pressable
          style={
            styles.deniedBackButton
          }
          onPress={goBack}
        >
          <Text
            style={
              styles.deniedBackButtonText
            }
          >
            Voltar ao ambiente
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
              GESTÃO DE OBRAS
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
          onPress={goBack}
        >
          <Text
            style={
              styles.backButtonText
            }
          >
            ‹ {environment.name}
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

        {/* CABEÇALHO */}
        <View style={styles.header}>
          <Text
            style={styles.eyebrow}
          >
            REGISTRAR AVANÇO
          </Text>

          <Text style={styles.title}>
            {environment.name}
          </Text>

          <Text
            style={styles.subtitle}
          >
            Atualize o andamento sem
            precisar editar toda a
            ficha do ambiente.
          </Text>
        </View>

        {/* STATUS */}
        <View style={styles.card}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            STATUS
          </Text>

          <View
            style={
              styles.statusContainer
            }
          >
            {STATUS_OPTIONS.map(
              (option) => {
                const selected =
                  status ===
                  option.value;

                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.statusButton,
                      selected &&
                        styles.statusButtonSelected,
                    ]}
                    onPress={() =>
                      changeStatus(
                        option.value
                      )
                    }
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.statusButtonText,
                        selected &&
                          styles.statusButtonTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>
        </View>

        {/* PROGRESSO */}
        <View style={styles.card}>
          <View
            style={
              styles.progressHeader
            }
          >
            <Text
              style={
                styles.sectionTitle
              }
            >
              ANDAMENTO
            </Text>

            <Text
              style={
                styles.progressBig
              }
            >
              {progress}%
            </Text>
          </View>

          <View
            style={
              styles.progressTrack
            }
          >
            <View
              style={[
                styles.progressFill,
                {
                  width:
                    `${progress}%` as `${number}%`,
                },
              ]}
            />
          </View>

          {/* ATALHOS */}
          <View
            style={
              styles.quickProgressRow
            }
          >
            {QUICK_PROGRESS.map(
              (value) => (
                <Pressable
                  key={value}
                  style={[
                    styles.quickProgressButton,
                    progress === value &&
                      styles.quickProgressButtonSelected,
                  ]}
                  onPress={() =>
                    changeProgress(value)
                  }
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.quickProgressText,
                      progress === value &&
                        styles.quickProgressTextSelected,
                    ]}
                  >
                    {value}%
                  </Text>
                </Pressable>
              )
            )}
          </View>

          {/* AJUSTE RAPIDO */}
          <View
            style={
              styles.stepperRow
            }
          >
            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                changeProgress(
                  progress - 10
                )
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                − 10
              </Text>
            </Pressable>

            <View
              style={
                styles.currentProgress
              }
            >
              <Text
                style={
                  styles.currentProgressValue
                }
              >
                {progress}%
              </Text>

              <Text
                style={
                  styles.currentProgressLabel
                }
              >
                concluído
              </Text>
            </View>

            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                changeProgress(
                  progress + 10
                )
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                + 10
              </Text>
            </Pressable>
          </View>
        </View>

        {/* OBSERVAÇÃO */}
        <View style={styles.card}>
          <Text
            style={
              styles.sectionTitle
            }
          >
            O QUE MUDOU?
          </Text>

          <TextInput
            style={
              styles.observationInput
            }
            value={observation}
            onChangeText={
              setObservation
            }
            placeholder="Ex.: instalação dos módulos inferiores concluída"
            placeholderTextColor="#A3A8AB"
            multiline
            textAlignVertical="top"
            editable={!saving}
          />

          <Text
            style={styles.helper}
          >
            Opcional. Se preenchida,
            esta observação entra no
            histórico do ambiente.
          </Text>
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

        {/* REGISTRAR */}
        <Pressable
          style={[
            styles.saveButton,
            saving &&
              styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
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
                  styles.saveButtonText
                }
              >
                Registrando...
              </Text>
            </View>
          ) : (
            <Text
              style={
                styles.saveButtonText
              }
            >
              Registrar avanço
            </Text>
          )}
        </Pressable>

        <Pressable
          style={styles.cancelButton}
          onPress={goBack}
          disabled={saving}
        >
          <Text
            style={
              styles.cancelButtonText
            }
          >
            Voltar sem alterar
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
    paddingHorizontal: 30,
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
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E4E7E4',
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#5F7567',
  },

  statusContainer: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  statusButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 999,
    backgroundColor: '#FAFAF8',
  },

  statusButtonSelected: {
    borderColor: '#5F7567',
    backgroundColor: '#EEF1ED',
  },

  statusButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#747B80',
  },

  statusButtonTextSelected: {
    color: '#44594B',
  },

  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent:
      'space-between',
  },

  progressBig: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2C343A',
  },

  progressTrack: {
    height: 9,
    marginTop: 14,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E7E9E7',
  },

  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#5F7567',
  },

  quickProgressRow: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },

  quickProgressButton: {
    flex: 1,
    minWidth: 52,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 999,
    backgroundColor: '#FAFAF8',
  },

  quickProgressButtonSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF4EC',
  },

  quickProgressText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#747B80',
  },

  quickProgressTextSelected: {
    color: '#A65B32',
  },

  stepperRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  stepperButton: {
    flex: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },

  stepperButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#526658',
  },

  currentProgress: {
    minWidth: 88,
    alignItems: 'center',
  },

  currentProgressValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2C343A',
  },

  currentProgressLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '700',
    color: '#8B9195',
  },

  observationInput: {
    minHeight: 110,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 12,
    backgroundColor: '#FAFAF8',
    fontSize: 14,
    lineHeight: 20,
    color: '#2C343A',
  },

  helper: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    color: '#919699',
  },

  messageCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF2F0',
  },

  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },

  saveButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#E07A3A',
  },

  saveButtonDisabled: {
    opacity: 0.6,
  },

  saveButtonText: {
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

  deniedPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: '#F7F7F5',
  },

  deniedEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#E07A3A',
  },

  deniedTitle: {
    marginTop: 7,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '800',
    textAlign: 'center',
    color: '#2C343A',
  },

  deniedText: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    color: '#747B80',
  },

  deniedBackButton: {
    marginTop: 20,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#2C343A',
  },

  deniedBackButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  errorText: {
    fontSize: 13,
    textAlign: 'center',
    color: '#B42318',
  },
});
