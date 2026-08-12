import {
    useFocusEffect,
    useLocalSearchParams,
    useRouter,
} from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from 'react-native';

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
  category: string;
  identifier: string | null;
  custom_name: string | null;
  name: string;
  responsible_user_id: string | null;
  status: EnvironmentStatus;
  progress: number;
  weight: number;
  services_notes: string | null;
  missing_items_notes: string | null;
  notes: string | null;
  client_visible: boolean;
  preparation_min_photos: number;
};

type Work = {
  id: string;
  code: string;
  client_name: string;
};

type AssignmentParticipant = {
  participant_id: string;
  user_id: string;
  full_name: string;
  role_title: string | null;
  job_title: string | null;
  access_level: string;
  company_id: string | null;
};

const CATEGORY_OPTIONS = [
  { value: 'cozinha', label: 'Cozinha' },
  { value: 'sala_estar', label: 'Sala de estar' },
  { value: 'sala_jantar', label: 'Sala de jantar' },
  { value: 'lavabo', label: 'Lavabo' },
  { value: 'banheiro', label: 'Banheiro' },
  { value: 'suite', label: 'Suíte' },
  { value: 'dormitorio', label: 'Dormitório' },
  { value: 'closet', label: 'Closet' },
  { value: 'escritorio', label: 'Escritório' },
  { value: 'lavanderia', label: 'Lavanderia' },
  { value: 'area_servico', label: 'Área de serviço' },
  { value: 'varanda', label: 'Varanda' },
  { value: 'area_gourmet', label: 'Área gourmet' },
  { value: 'hall', label: 'Hall' },
  { value: 'corredor', label: 'Corredor' },
  { value: 'garagem', label: 'Garagem' },
  { value: 'deposito', label: 'Depósito' },
  { value: 'outro_ambiente', label: 'Outro ambiente' },
];

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

const QUICK_PROGRESS = [0, 25, 50, 75, 100];

export default function EditEnvironmentScreen() {
  const router = useRouter();

  const { id } =
    useLocalSearchParams<{
      id: string;
    }>();

  const [environment, setEnvironment] =
    useState<Environment | null>(null);

  const [work, setWork] =
    useState<Work | null>(null);

 const [
  participants,
  setParticipants,
] = useState<AssignmentParticipant[]>([]);

const [
  selectedResponsibleUserId,
  setSelectedResponsibleUserId,
] = useState<string | null>(null);

  const [category, setCategory] =
    useState('cozinha');

  const [identifier, setIdentifier] =
    useState('');

  const [customName, setCustomName] =
    useState('');

  const [status, setStatus] =
    useState<EnvironmentStatus>(
      'nao_iniciado'
    );

  const [progress, setProgress] =
    useState(0);

  const [weight, setWeight] =
    useState(1);

  const [servicesNotes, setServicesNotes] =
    useState('');

  const [
    missingItemsNotes,
    setMissingItemsNotes,
  ] = useState('');

  const [notes, setNotes] =
    useState('');

  const [clientVisible, setClientVisible] =
    useState(false);

  const [
    preparationMinPhotos,
    setPreparationMinPhotos,
  ] = useState(0);

  const [loading, setLoading] =
    useState(true);

  const [
    savingAction,
    setSavingAction,
  ] = useState<
    'back' | 'stay' | 'archive' | null
  >(null);

  const [errorMessage, setErrorMessage] =
    useState('');

  const [
    successMessage,
    setSuccessMessage,
  ] = useState('');

  async function loadData() {
    if (!id) {
      setErrorMessage(
        'Ambiente não encontrado.'
      );

      setLoading(false);

      return;
    }

    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const {
        data: environmentData,
        error: environmentError,
      } = await supabase
        .from('environments')
        .select(`
          id,
          work_id,
          category,
          identifier,
          custom_name,
          name,
          responsible_user_id,
          status,
          progress,
          weight,
          services_notes,
          missing_items_notes,
          notes,
          client_visible,
          preparation_min_photos
        `)
        .eq('id', id)
        .maybeSingle();

      if (environmentError) {
        setErrorMessage(
          environmentError.message
        );

        return;
      }

      if (!environmentData) {
        setErrorMessage(
          'Ambiente não encontrado.'
        );

        return;
      }

      const loadedEnvironment =
        environmentData as Environment;

      setEnvironment(loadedEnvironment);

      setCategory(
        loadedEnvironment.category
      );

      setIdentifier(
        loadedEnvironment.identifier ?? ''
      );

      setCustomName(
        loadedEnvironment.custom_name ?? ''
      );

      setStatus(
        loadedEnvironment.status
      );

      setProgress(
        loadedEnvironment.progress
      );

      setWeight(
        Number(
          loadedEnvironment.weight
        ) || 1
      );

      setServicesNotes(
        loadedEnvironment.services_notes ??
          ''
      );

      setMissingItemsNotes(
        loadedEnvironment.missing_items_notes ??
          ''
      );

      setNotes(
        loadedEnvironment.notes ?? ''
      );

      setClientVisible(
        loadedEnvironment.client_visible
      );

      setPreparationMinPhotos(
        loadedEnvironment.preparation_min_photos ??
          0
      );

      setSelectedResponsibleUserId(
         loadedEnvironment.responsible_user_id
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
          loadedEnvironment.work_id
        )
        .maybeSingle();

      if (workError) {
        setErrorMessage(
          workError.message
        );
      } else if (workData) {
        setWork(workData as Work);
      }

      const {
  data: participantsData,
  error: participantsError,
} = await supabase.rpc(
  'get_work_participants_for_assignment',
  {
    p_work_id:
      loadedEnvironment.work_id,
  }
);

if (participantsError) {
  setErrorMessage(
    participantsError.message
  );
} else {
  setParticipants(
    (participantsData ??
      []) as AssignmentParticipant[]
  );
}
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar o ambiente.'
      );
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [id])
  );

  function changeStatus(
    nextStatus: EnvironmentStatus
  ) {
    setStatus(nextStatus);

    if (
      nextStatus === 'nao_iniciado'
    ) {
      setProgress(0);
      return;
    }

    if (
      nextStatus === 'concluido'
    ) {
      setProgress(100);
      return;
    }

    if (
      nextStatus === 'em_andamento' &&
      progress === 0
    ) {
      setProgress(10);
    }
  }

  function changeProgress(
    value: number
  ) {
    const next = Math.max(
      0,
      Math.min(value, 100)
    );

    setProgress(next);

    if (next === 0) {
      setStatus('nao_iniciado');
      return;
    }

    if (next === 100) {
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

  function changeWeight(
    amount: number
  ) {
    const next =
      Math.round(
        (weight + amount) * 10
      ) / 10;

    setWeight(
      Math.max(0.5, next)
    );
  }

  function validate() {
    if (!category) {
      setErrorMessage(
        'Selecione uma categoria.'
      );

      return false;
    }

    if (
      category ===
        'outro_ambiente' &&
      !customName.trim()
    ) {
      setErrorMessage(
        'Informe o nome do ambiente.'
      );

      return false;
    }

    if (
      progress < 0 ||
      progress > 100
    ) {
      setErrorMessage(
        'O progresso deve ficar entre 0% e 100%.'
      );

      return false;
    }

    if (weight <= 0) {
      setErrorMessage(
        'O peso do ambiente deve ser maior que zero.'
      );

      return false;
    }

    if (
      preparationMinPhotos < 0
    ) {
      setErrorMessage(
        'O mínimo de fotos não pode ser negativo.'
      );

      return false;
    }

    return true;
  }

  async function handleSave(
    stayOnPage: boolean
  ) {
    if (
      !environment ||
      savingAction
    ) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');

    if (!validate()) {
      return;
    }

    setSavingAction(
      stayOnPage ? 'stay' : 'back'
    );

    try {
      const { error } =
        await supabase.rpc(
          'update_environment',
          {
            p_environment_id:
              environment.id,

            p_category:
              category,

            p_identifier:
              identifier.trim() ||
              null,

            p_custom_name:
              category ===
              'outro_ambiente'
                ? customName.trim() ||
                  null
                : null,

            p_responsible_user_id:
              selectedResponsibleUserId,

            p_status:
              status,

            p_progress:
              progress,

            p_weight:
              weight,

            p_services_notes:
              servicesNotes.trim() ||
              null,

            p_missing_items_notes:
              missingItemsNotes.trim() ||
              null,

            p_notes:
              notes.trim() ||
              null,

            p_client_visible:
              clientVisible,

            p_preparation_min_photos:
              preparationMinPhotos,
          }
        );

      if (error) {
        setErrorMessage(
          error.message
        );

        return;
      }

      if (stayOnPage) {
        setSuccessMessage(
          'Alterações salvas.'
        );

        await loadData();

        setSuccessMessage(
          'Alterações salvas.'
        );

        return;
      }

      router.replace({
        pathname:
          '/environment/[id]',
        params: {
          id: environment.id,
        },
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível salvar o ambiente.'
      );
    } finally {
      setSavingAction(null);
    }
  }

  function handleArchive() {
    if (
      !environment ||
      savingAction
    ) {
      return;
    }

    Alert.alert(
      'Arquivar ambiente?',
      `${environment.name} deixará de aparecer na lista ativa de ambientes.`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: async () => {
            setSavingAction(
              'archive'
            );

            setErrorMessage('');

            try {
              const { error } =
                await supabase.rpc(
                  'archive_environment',
                  {
                    p_environment_id:
                      environment.id,
                  }
                );

              if (error) {
                setErrorMessage(
                  error.message
                );

                return;
              }

              router.replace({
                pathname:
                  '/environments',
                params: {
                  workId:
                    environment.work_id,
                },
              });
            } catch (error) {
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : 'Não foi possível arquivar o ambiente.'
              );
            } finally {
              setSavingAction(
                null
              );
            }
          },
        },
      ]
    );
  }

  if (loading) {
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
          {errorMessage ||
            'Ambiente não encontrado.'}
        </Text>
      </View>
    );
  }

  const saving =
    savingAction !== null;

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
              router.push('/profile')
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

        {/* VOLTAR */}
        <Pressable
          style={styles.backButton}
          onPress={() =>
            router.back()
          }
          disabled={saving}
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

        {/* TÍTULO */}
        <View style={styles.header}>
          <Text
            style={styles.eyebrow}
          >
            EDITAR AMBIENTE
          </Text>

          <Text style={styles.title}>
            {environment.name}
          </Text>

          <Text
            style={styles.subtitle}
          >
            Atualize a preparação e o
            andamento deste ambiente.
          </Text>
        </View>

        {/* CATEGORIA */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            AMBIENTE
          </Text>

          <Text
            style={styles.fieldLabel}
          >
            Categoria
          </Text>

          <View
            style={
              styles.chipContainer
            }
          >
            {CATEGORY_OPTIONS.map(
              (option) => {
                const selected =
                  category ===
                  option.value;

                return (
                  <Pressable
                    key={option.value}
                    style={[
                      styles.chip,
                      selected &&
                        styles.chipSelected,
                    ]}
                    onPress={() =>
                      setCategory(
                        option.value
                      )
                    }
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selected &&
                          styles.chipTextSelected,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>

          {category ===
          'outro_ambiente' ? (
            <>
              <Text
                style={styles.fieldLabel}
              >
                Nome do ambiente
              </Text>

              <TextInput
                style={styles.input}
                value={customName}
                onChangeText={
                  setCustomName
                }
                placeholder="Ex.: Brinquedoteca"
                placeholderTextColor="#A3A8AB"
                editable={!saving}
              />
            </>
          ) : null}

          <Text
            style={styles.fieldLabel}
          >
            Identificação
          </Text>

          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={
              setIdentifier
            }
            placeholder="Opcional. Ex.: Filho, Casal, 02"
            placeholderTextColor="#A3A8AB"
            editable={!saving}
          />

          <Text style={styles.helper}>
            Use a identificação apenas
            quando houver ambientes
            semelhantes, como
            “Dormitório - Filho”.
          </Text>
        </View>

       {/* RESPONSÁVEL */}
<View style={styles.card}>
  <Text
    style={styles.sectionTitle}
  >
    RESPONSÁVEL
  </Text>

  <Text
    style={[
      styles.responsibleHint,
      {
        marginBottom: 12,
      },
    ]}
  >
    Selecione quem será o responsável
    por este ambiente.
  </Text>

  <View
    style={{
      gap: 10,
    }}
  >
    <Pressable
      style={({ pressed }) => [
        styles.responsibleCard,
        {
          borderWidth: 1,
          borderColor:
            selectedResponsibleUserId ===
            null
              ? '#E07A3A'
              : '#E4E7E4',

          backgroundColor:
            selectedResponsibleUserId ===
            null
              ? '#FFF7F1'
              : '#FFFFFF',
        },

        pressed && {
          opacity: 0.65,
        },
      ]}
      onPress={() =>
        setSelectedResponsibleUserId(
          null
        )
      }
      disabled={saving}
    >
      <Text
        style={
          styles.responsibleName
        }
      >
        Sem responsável
      </Text>

      <Text
        style={
          styles.responsibleHint
        }
      >
        {selectedResponsibleUserId ===
        null
          ? 'Selecionado'
          : 'Deixar o ambiente sem responsável'}
      </Text>
    </Pressable>

    {participants.map(
      (participant) => {
        const selected =
          selectedResponsibleUserId ===
          participant.user_id;

        const role =
          participant.role_title ||
          participant.job_title ||
          'Participante da obra';

        return (
          <Pressable
            key={
              participant.participant_id
            }
            style={({ pressed }) => [
              styles.responsibleCard,

              {
                borderWidth: 1,

                borderColor: selected
                  ? '#E07A3A'
                  : '#E4E7E4',

                backgroundColor:
                  selected
                    ? '#FFF7F1'
                    : '#FFFFFF',
              },

              pressed && {
                opacity: 0.65,
              },
            ]}
            onPress={() =>
              setSelectedResponsibleUserId(
                participant.user_id
              )
            }
            disabled={saving}
          >
            <Text
              style={
                styles.responsibleName
              }
            >
              {participant.full_name}
            </Text>

            <Text
              style={
                styles.responsibleHint
              }
            >
              {selected
                ? `${role} · Selecionado`
                : role}
            </Text>
          </Pressable>
        );
      }
    )}
  </View>
</View>

{/* STATUS */}

        {/* STATUS */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            STATUS
          </Text>

          <View
            style={
              styles.chipContainer
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
                      styles.chip,
                      selected &&
                        styles.statusSelected,
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
                        styles.chipText,
                        selected &&
                          styles.statusSelectedText,
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
              style={styles.sectionTitle}
            >
              PROGRESSO
            </Text>

            <Text
              style={styles.progressBig}
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
                    styles.quickButton,
                    progress === value &&
                      styles.quickButtonSelected,
                  ]}
                  onPress={() =>
                    changeProgress(value)
                  }
                  disabled={saving}
                >
                  <Text
                    style={[
                      styles.quickButtonText,
                      progress === value &&
                        styles.quickButtonTextSelected,
                    ]}
                  >
                    {value}%
                  </Text>
                </Pressable>
              )
            )}
          </View>

          <View
            style={styles.stepperRow}
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

            <Text
              style={
                styles.stepperValue
              }
            >
              {progress}%
            </Text>

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

        {/* PESO */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            PESO NO PROGRESSO DA OBRA
          </Text>

          <Text style={styles.helperTop}>
            Normalmente deixe em 1.
            Aumente apenas se este
            ambiente tiver peso maior
            no andamento geral.
          </Text>

          <View
            style={styles.stepperRow}
          >
            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                changeWeight(-0.5)
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                −
              </Text>
            </Pressable>

            <View
              style={
                styles.weightCenter
              }
            >
              <Text
                style={
                  styles.weightValue
                }
              >
                {weight}
              </Text>

              <Text
                style={
                  styles.weightLabel
                }
              >
                peso
              </Text>
            </View>

            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                changeWeight(0.5)
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                +
              </Text>
            </Pressable>
          </View>
        </View>

        {/* SERVIÇOS */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            ANDAMENTO DO AMBIENTE
          </Text>

          <Text
            style={styles.fieldLabel}
          >
            Serviços realizados
          </Text>

          <TextInput
            style={styles.textArea}
            value={servicesNotes}
            onChangeText={
              setServicesNotes
            }
            placeholder="Ex.: módulos inferiores instalados"
            placeholderTextColor="#A3A8AB"
            multiline
            textAlignVertical="top"
            editable={!saving}
          />

          <Text
            style={styles.fieldLabel}
          >
            Itens faltantes
          </Text>

          <TextInput
            style={styles.textArea}
            value={missingItemsNotes}
            onChangeText={
              setMissingItemsNotes
            }
            placeholder="Ex.: falta porta do aéreo"
            placeholderTextColor="#A3A8AB"
            multiline
            textAlignVertical="top"
            editable={!saving}
          />

          <Text
            style={styles.fieldLabel}
          >
            Observações
          </Text>

          <TextInput
            style={styles.textArea}
            value={notes}
            onChangeText={setNotes}
            placeholder="Outras informações do ambiente"
            placeholderTextColor="#A3A8AB"
            multiline
            textAlignVertical="top"
            editable={!saving}
          />
        </View>

        {/* PREPARAÇÃO */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            PREPARAÇÃO
          </Text>

          <View
            style={styles.settingRow}
          >
            <View
              style={
                styles.settingText
              }
            >
              <Text
                style={
                  styles.settingTitle
                }
              >
                Visível para o cliente
              </Text>

              <Text
                style={
                  styles.settingDescription
                }
              >
                Define se este ambiente
                poderá aparecer na
                camada do cliente.
              </Text>
            </View>

            <Switch
              value={clientVisible}
              onValueChange={
                setClientVisible
              }
              disabled={saving}
            />
          </View>

          <View
            style={styles.divider}
          />

          <Text
            style={styles.settingTitle}
          >
            Mínimo de fotos
          </Text>

          <Text
            style={
              styles.settingDescription
            }
          >
            Quantidade mínima de fotos
            desejada para considerar a
            preparação visual completa.
          </Text>

          <View
            style={styles.stepperRow}
          >
            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                setPreparationMinPhotos(
                  Math.max(
                    0,
                    preparationMinPhotos -
                      1
                  )
                )
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                −
              </Text>
            </Pressable>

            <View
              style={
                styles.weightCenter
              }
            >
              <Text
                style={
                  styles.weightValue
                }
              >
                {preparationMinPhotos}
              </Text>

              <Text
                style={
                  styles.weightLabel
                }
              >
                fotos
              </Text>
            </View>

            <Pressable
              style={
                styles.stepperButton
              }
              onPress={() =>
                setPreparationMinPhotos(
                  preparationMinPhotos +
                    1
                )
              }
              disabled={saving}
            >
              <Text
                style={
                  styles.stepperButtonText
                }
              >
                +
              </Text>
            </Pressable>
          </View>
        </View>

        {!!errorMessage && (
          <View
            style={styles.errorCard}
          >
            <Text
              style={styles.errorText}
            >
              {errorMessage}
            </Text>
          </View>
        )}

        {!!successMessage && (
          <View
            style={styles.successCard}
          >
            <Text
              style={
                styles.successText
              }
            >
              {successMessage}
            </Text>
          </View>
        )}

        {/* SALVAR */}
        <Pressable
          style={[
            styles.primaryButton,
            saving &&
              styles.disabledButton,
          ]}
          onPress={() =>
            handleSave(false)
          }
          disabled={saving}
        >
          <Text
            style={
              styles.primaryButtonText
            }
          >
            {savingAction === 'back'
              ? 'Salvando...'
              : 'Salvar e voltar'}
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.secondaryButton,
            saving &&
              styles.disabledButton,
          ]}
          onPress={() =>
            handleSave(true)
          }
          disabled={saving}
        >
          <Text
            style={
              styles.secondaryButtonText
            }
          >
            {savingAction === 'stay'
              ? 'Salvando...'
              : 'Salvar e continuar editando'}
          </Text>
        </Pressable>

        {/* ARQUIVAR */}
        <Pressable
          style={styles.archiveButton}
          onPress={handleArchive}
          disabled={saving}
        >
          <Text
            style={
              styles.archiveButtonText
            }
          >
            {savingAction === 'archive'
              ? 'Arquivando...'
              : 'Arquivar ambiente'}
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
    paddingBottom: 80,
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
    justifyContent: 'space-between',
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
    letterSpacing: 1.2,
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
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: '#747B80',
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
    marginBottom: 12,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#5F7567',
  },

  fieldLabel: {
    marginTop: 14,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: '800',
    color: '#687177',
  },

  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 999,
    backgroundColor: '#FAFAF8',
  },

  chipSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF4EC',
  },

  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#747B80',
  },

  chipTextSelected: {
    color: '#A65B32',
  },

  statusSelected: {
    borderColor: '#5F7567',
    backgroundColor: '#EEF1ED',
  },

  statusSelectedText: {
    color: '#44594B',
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DDE1DE',
    borderRadius: 12,
    backgroundColor: '#FAFAF8',
    fontSize: 14,
    color: '#2C343A',
  },

  textArea: {
    minHeight: 105,
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

  helperTop: {
    marginBottom: 14,
    fontSize: 12,
    lineHeight: 18,
    color: '#81878B',
  },

  responsibleCard: {
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F7F8F6',
  },

  responsibleName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C343A',
  },

  responsibleHint: {
    marginTop: 3,
    fontSize: 11,
    color: '#8B9195',
  },

  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  progressBig: {
    fontSize: 22,
    fontWeight: '800',
    color: '#2C343A',
  },

  progressTrack: {
    height: 9,
    marginTop: 8,
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

  quickButton: {
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

  quickButtonSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF4EC',
  },

  quickButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#747B80',
  },

  quickButtonTextSelected: {
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
    fontSize: 14,
    fontWeight: '800',
    color: '#526658',
  },

  stepperValue: {
    minWidth: 80,
    textAlign: 'center',
    fontSize: 19,
    fontWeight: '800',
    color: '#2C343A',
  },

  weightCenter: {
    minWidth: 88,
    alignItems: 'center',
  },

  weightValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2C343A',
  },

  weightLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '700',
    color: '#8B9195',
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  settingText: {
    flex: 1,
  },

  settingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2C343A',
  },

  settingDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: '#858B8F',
  },

  divider: {
    height: 1,
    marginVertical: 18,
    backgroundColor: '#ECEEEC',
  },

  errorCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FFF2F0',
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#B42318',
  },

  successCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#EEF4EE',
  },

  successText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#506455',
  },

  primaryButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#E07A3A',
  },

  primaryButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  secondaryButton: {
    minHeight: 52,
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2C343A',
  },

  archiveButton: {
    minHeight: 50,
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  archiveButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#B42318',
  },

  disabledButton: {
    opacity: 0.55,
  },
});