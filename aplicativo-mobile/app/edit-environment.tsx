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
  installation_priority: boolean;
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

  const [servicesNotes, setServicesNotes] =
    useState('');

  const [
    installationPriority,
    setInstallationPriority,
  ] = useState(false);

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

  const [photoCount, setPhotoCount] =
    useState(0);

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
          installation_priority,
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

      setInstallationPriority(
        loadedEnvironment.installation_priority ??
          false
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

      const {
        count: loadedPhotoCount,
        error: photoCountError,
      } = await supabase
        .from('work_photos')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('collection', 'work')
        .eq(
          'environment_id',
          loadedEnvironment.id
        );

      if (photoCountError) {
        setErrorMessage(
          photoCountError.message
        );
      } else {
        setPhotoCount(
          loadedPhotoCount ?? 0
        );
      }

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
              1,

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

      const {
        error: priorityError,
      } = await supabase.rpc(
        'set_environment_installation_priority',
        {
          p_environment_id:
            environment.id,
          p_priority:
            installationPriority,
        }
      );

      if (priorityError) {
        setErrorMessage(
          priorityError.message
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

  const hasResponsible =
    selectedResponsibleUserId !== null;

  const hasInformation =
    servicesNotes.trim().length > 0 ||
    missingItemsNotes.trim().length > 0 ||
    notes.trim().length > 0;

  const photosReady =
    preparationMinPhotos === 0 ||
    photoCount >= preparationMinPhotos;

  const preparationItems = [
    {
      label: 'Responsável definido',
      ready: hasResponsible,
    },
    {
      label: 'Informações registradas',
      ready: hasInformation,
    },
    {
      label:
        preparationMinPhotos > 0
          ? `Fotos (${photoCount}/${preparationMinPhotos})`
          : `Fotos (${photoCount}) · sem mínimo obrigatório`,
      ready: photosReady,
    },
  ];

  const missingPreparationCount =
    preparationItems.filter(
      (item) => !item.ready
    ).length;

  const preparationReady =
    missingPreparationCount === 0;

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
              : '#4C534D',

          backgroundColor:
            selectedResponsibleUserId ===
            null
              ? '#4B3B25'
              : '#383E39',
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
                  : '#4C534D',

                backgroundColor:
                  selected
                    ? '#4B3B25'
                    : '#383E39',
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

        {/* PRIORIDADE */}
        <View style={styles.card}>
          <Text
            style={styles.sectionTitle}
          >
            PRIORIDADE DE MONTAGEM
          </Text>

          <Text style={styles.helperTop}>
            Marque quando este ambiente
            precisar ser montado antes
            dos demais, como áreas
            molhadas ou pontos críticos.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.priorityButton,
              installationPriority &&
                styles.priorityButtonSelected,
              pressed &&
                styles.priorityButtonPressed,
            ]}
            onPress={() =>
              setInstallationPriority(
                (current) => !current
              )
            }
            disabled={saving}
          >
            <View style={styles.priorityText}>
              <Text
                style={[
                  styles.priorityTitle,
                  installationPriority &&
                    styles.priorityTitleSelected,
                ]}
              >
                {installationPriority
                  ? 'Montar primeiro'
                  : 'Prioridade normal'}
              </Text>

              <Text
                style={styles.priorityDescription}
              >
                {installationPriority
                  ? 'Este ambiente aparecerá primeiro na lista.'
                  : 'Toque para marcar como prioridade.'}
              </Text>
            </View>

            <View
              style={[
                styles.priorityMarker,
                installationPriority &&
                  styles.priorityMarkerSelected,
              ]}
            >
              <Text
                style={[
                  styles.priorityMarkerText,
                  installationPriority &&
                    styles.priorityMarkerTextSelected,
                ]}
              >
                {installationPriority
                  ? 'ATIVA'
                  : 'NORMAL'}
              </Text>
            </View>
          </Pressable>
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
            style={[
              styles.preparationSummary,
              preparationReady &&
                styles.preparationSummaryReady,
            ]}
          >
            <Text
              style={[
                styles.preparationSummaryTitle,
                preparationReady &&
                  styles.preparationSummaryTitleReady,
              ]}
            >
              {preparationReady
                ? 'Preparação básica completa'
                : `${missingPreparationCount} ${
                    missingPreparationCount === 1
                      ? 'item pendente'
                      : 'itens pendentes'
                  }`}
            </Text>

            <Text
              style={
                styles.preparationSummaryText
              }
            >
              Conferência automática com
              base no responsável, nas
              informações e nas fotos deste
              ambiente.
            </Text>
          </View>

          <View
            style={styles.preparationList}
          >
            {preparationItems.map(
              (item) => (
                <View
                  key={item.label}
                  style={
                    styles.preparationItem
                  }
                >
                  <Text
                    style={
                      styles.preparationItemLabel
                    }
                  >
                    {item.label}
                  </Text>

                  <Text
                    style={[
                      styles.preparationItemStatus,
                      item.ready &&
                        styles.preparationItemStatusReady,
                    ]}
                  >
                    {item.ready
                      ? 'Pronto'
                      : 'Pendente'}
                  </Text>
                </View>
              )
            )}
          </View>

          <View style={styles.divider} />

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
            Atualmente há {photoCount}{' '}
            {photoCount === 1
              ? 'foto'
              : 'fotos'} neste ambiente.
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
                {preparationMinPhotos ===
                1
                  ? 'foto'
                  : 'fotos'}
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
    backgroundColor: '#242824',
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

  topButton: {
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  topButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 22,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#2E332F',
  },

  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  workCode: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#74B892',
  },

  workName: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#C0C7C1',
  },

  header: {
    marginTop: 22,
    marginBottom: 20,
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
    marginTop: 7,
    fontSize: 14,
    lineHeight: 20,
    color: '#C0C7C1',
  },

  card: {
    marginBottom: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 18,
    backgroundColor: '#2E332F',
  },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#74B892',
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
    borderColor: '#687069',
    borderRadius: 999,
    backgroundColor: '#383E39',
  },

  chipSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#4B3B25',
  },

  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#C0C7C1',
  },

  chipTextSelected: {
    color: '#A65B32',
  },

  statusSelected: {
    borderColor: '#5F7567',
    backgroundColor: '#30483A',
  },

  statusSelectedText: {
    color: '#44594B',
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 12,
    backgroundColor: '#383E39',
    fontSize: 14,
    color: '#F2F3EF',
  },

  textArea: {
    minHeight: 105,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 12,
    backgroundColor: '#383E39',
    fontSize: 14,
    lineHeight: 20,
    color: '#F2F3EF',
  },

  helper: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 16,
    color: '#929A93',
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
    backgroundColor: '#383E39',
  },

  responsibleName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F2F3EF',
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
    color: '#F2F3EF',
  },

  progressTrack: {
    height: 9,
    marginTop: 8,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#383E39',
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
    borderColor: '#687069',
    borderRadius: 999,
    backgroundColor: '#383E39',
  },

  quickButtonSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#4B3B25',
  },

  quickButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C0C7C1',
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
    borderColor: '#687069',
    borderRadius: 12,
    backgroundColor: '#2E332F',
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
    color: '#F2F3EF',
  },

  weightCenter: {
    minWidth: 88,
    alignItems: 'center',
  },

  weightValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  weightLabel: {
    marginTop: 1,
    fontSize: 9,
    fontWeight: '700',
    color: '#8B9195',
  },

  priorityButton: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 14,
    backgroundColor: '#383E39',
  },

  priorityButtonSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#4B3B25',
  },

  priorityButtonPressed: {
    opacity: 0.68,
  },

  priorityText: {
    flex: 1,
  },

  priorityTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  priorityTitleSelected: {
    color: '#A65B32',
  },

  priorityDescription: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: '#858B8F',
  },

  priorityMarker: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#383E39',
  },

  priorityMarkerSelected: {
    backgroundColor: '#E07A3A',
  },

  priorityMarkerText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#C0C7C1',
  },

  priorityMarkerTextSelected: {
    color: '#FFFFFF',
  },

  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  preparationSummary: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1C7AA',
    borderRadius: 14,
    backgroundColor: '#4B3B25',
  },

  preparationSummaryReady: {
    borderColor: '#C8D8CB',
    backgroundColor: '#30483A',
  },

  preparationSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#A65B32',
  },

  preparationSummaryTitleReady: {
    color: '#74B892',
  },

  preparationSummaryText: {
    marginTop: 5,
    fontSize: 11,
    lineHeight: 16,
    color: '#C0C7C1',
  },

  preparationList: {
    marginTop: 12,
    gap: 8,
  },

  preparationItem: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E7E9E7',
    borderRadius: 12,
    backgroundColor: '#383E39',
  },

  preparationItemLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#596167',
  },

  preparationItemStatus: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A65B32',
  },

  preparationItemStatusReady: {
    color: '#506455',
  },

  settingText: {
    flex: 1,
  },

  settingTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F2F3EF',
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
    backgroundColor: '#383E39',
  },

  errorCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#4A2F2D',
  },

  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#FF8D83',
  },

  successCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#294536',
  },

  successText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8AD4A8',
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
    borderColor: '#687069',
    borderRadius: 14,
    backgroundColor: '#2E332F',
  },

  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F2F3EF',
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
    color: '#FF8D83',
  },

  disabledButton: {
    opacity: 0.55,
  },
});
