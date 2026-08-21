import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

import DateTimePicker, {
    DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type WorkStatus =
  | 'agendada'
  | 'em_andamento'
  | 'aguardando_peca'
  | 'aguardando_cliente'
  | 'finalizada';

type IOSPickerStep = 'date' | 'time';

const STATUS_OPTIONS: {
  value: WorkStatus;
  label: string;
}[] = [
  {
    value: 'agendada',
    label: 'Agendada',
  },
  {
    value: 'em_andamento',
    label: 'Em andamento',
  },
  {
    value: 'aguardando_peca',
    label: 'Aguardando peça',
  },
  {
    value: 'aguardando_cliente',
    label: 'Aguardando cliente',
  },
  {
    value: 'finalizada',
    label: 'Finalizada',
  },
];

function createSuggestedVisitDate() {
  const date = new Date(
    Date.now() + 60 * 60 * 1000
  );

  date.setSeconds(0, 0);

  const minutes = date.getMinutes();

  const roundedMinutes =
    Math.ceil(minutes / 15) * 15;

  if (roundedMinutes >= 60) {
    date.setHours(
      date.getHours() + 1,
      0,
      0,
      0
    );
  } else {
    date.setMinutes(roundedMinutes);
  }

  return date;
}

function formatVisitDate(date: Date) {
  const formattedDate =
    date.toLocaleDateString('pt-BR');

  const formattedTime =
    date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });

  return `${formattedDate} às ${formattedTime}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString(
    'pt-BR',
    {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }
  );
}

export default function NewWorkScreen() {
  const router = useRouter();

  const [clientName, setClientName] =
    useState('');

  const [clientPhone, setClientPhone] =
    useState('');

  const [address, setAddress] =
    useState('');

  const [projectOrder, setProjectOrder] =
    useState('');

  const [status, setStatus] =
    useState<WorkStatus>('agendada');

  const [progress, setProgress] =
    useState('0');

  const [nextVisit, setNextVisit] =
    useState<Date | null>(null);

  const [
    iosDraftVisit,
    setIosDraftVisit,
  ] = useState<Date>(
    createSuggestedVisitDate()
  );

  const [
    showIOSVisitPicker,
    setShowIOSVisitPicker,
  ] = useState(false);

  const [
    iosPickerStep,
    setIOSPickerStep,
  ] =
    useState<IOSPickerStep>('date');

  const [notes, setNotes] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  function openNextVisitPicker() {
    if (saving) {
      return;
    }

    setMessage('');

    const initialDate = nextVisit
      ? new Date(nextVisit.getTime())
      : createSuggestedVisitDate();

    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'date',
        display: 'calendar',
        minimumDate: new Date(),

        onChange: (
          dateEvent,
          selectedDate
        ) => {
          if (
            dateEvent.type !== 'set' ||
            !selectedDate
          ) {
            return;
          }

          DateTimePickerAndroid.open({
            value: initialDate,
            mode: 'time',
            display: 'clock',
            is24Hour: true,

            onChange: (
              timeEvent,
              selectedTime
            ) => {
              if (
                timeEvent.type !== 'set' ||
                !selectedTime
              ) {
                return;
              }

              const combinedDate =
                new Date(
                  selectedDate.getTime()
                );

              combinedDate.setHours(
                selectedTime.getHours(),
                selectedTime.getMinutes(),
                0,
                0
              );

              if (
                combinedDate.getTime() <
                Date.now()
              ) {
                setMessage(
                  'Escolha uma data e horário futuros.'
                );

                return;
              }

              setNextVisit(
                combinedDate
              );
            },
          });
        },
      });

      return;
    }

    setIosDraftVisit(initialDate);
    setIOSPickerStep('date');
    setShowIOSVisitPicker(true);
  }

  function setQuickDay(
    daysFromToday: number
  ) {
    const now = new Date();

    const baseDate = nextVisit
      ? new Date(nextVisit.getTime())
      : createSuggestedVisitDate();

    baseDate.setFullYear(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() +
        daysFromToday
    );

    if (
      baseDate.getTime() <
      Date.now()
    ) {
      setIosDraftVisit(
        createSuggestedVisitDate()
      );
    } else {
      setIosDraftVisit(baseDate);
    }

    setIOSPickerStep('time');
  }

  function handleIOSDateChange(
    selectedDate?: Date
  ) {
    if (!selectedDate) {
      return;
    }

    const updated = new Date(
      iosDraftVisit.getTime()
    );

    updated.setFullYear(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate()
    );

    if (
      updated.getTime() <
      Date.now()
    ) {
      const suggested =
        createSuggestedVisitDate();

      updated.setHours(
        suggested.getHours(),
        suggested.getMinutes(),
        0,
        0
      );
    }

    setIosDraftVisit(updated);

    setIOSPickerStep('time');
  }

  function handleIOSTimeChange(
    selectedTime?: Date
  ) {
    if (!selectedTime) {
      return;
    }

    const updated = new Date(
      iosDraftVisit.getTime()
    );

    updated.setHours(
      selectedTime.getHours(),
      selectedTime.getMinutes(),
      0,
      0
    );

    setIosDraftVisit(updated);
  }

  function confirmIOSVisit() {
    if (
      iosDraftVisit.getTime() <
      Date.now()
    ) {
      setMessage(
        'Escolha uma data e horário futuros.'
      );

      return;
    }

    setNextVisit(
      new Date(
        iosDraftVisit.getTime()
      )
    );

    setShowIOSVisitPicker(false);
  }

  function removeNextVisit() {
    setNextVisit(null);
    setMessage('');
  }

  async function handleCreateWork() {
    if (saving) {
      return;
    }

    setMessage('');

    if (!clientName.trim()) {
      setMessage(
        'Informe o nome do cliente.'
      );

      return;
    }

    if (!clientPhone.trim()) {
      setMessage(
        'Informe o telefone do cliente.'
      );

      return;
    }

    if (!address.trim()) {
      setMessage(
        'Informe o endereço da obra.'
      );

      return;
    }

    const parsedProgress =
      Number(progress);

    if (
      !Number.isFinite(
        parsedProgress
      ) ||
      parsedProgress < 0 ||
      parsedProgress > 100
    ) {
      setMessage(
        'O percentual deve ser um número entre 0 e 100.'
      );

      return;
    }

    setSaving(true);

    try {
      const { data, error } =
        await supabase.rpc(
          'create_work',
          {
            p_client_name:
              clientName.trim(),

            p_client_phone:
              clientPhone.trim(),

            p_address:
              address.trim(),

            p_project_order:
              projectOrder.trim() ||
              null,

            p_status: status,

            p_progress:
              Math.round(
                parsedProgress
              ),

            p_next_visit_at:
              nextVisit
                ? nextVisit.toISOString()
                : null,

            p_notes:
              notes.trim() || null,

            p_company_id: null,

            p_role_title: null,
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

      const workId =
        result?.work_id;

      if (!workId) {
        setMessage(
          'A obra foi processada, mas não foi possível localizar o identificador criado.'
        );

        return;
      }

      router.replace({
        pathname: '/works/[id]',
        params: {
          id: workId,
          newWork: '1',
        },
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível criar a obra.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
                router.replace(
                  '/profile'
                )
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
              router.replace('/works')
            }
          >
            <Text
              style={
                styles.backButtonText
              }
            >
              ‹ Minhas obras
            </Text>
          </Pressable>

          {/* TITULO */}
          <View style={styles.header}>
            <Text
              style={styles.eyebrow}
            >
              NOVA OBRA
            </Text>

            <Text style={styles.title}>
              Cadastrar obra
            </Text>

            <Text
              style={styles.subtitle}
            >
              Preencha as informações
              principais. Depois você
              poderá complementar a obra
              com ambientes,
              participantes, fotos,
              pendências e documentos.
            </Text>
          </View>

          {/* CLIENTE E OBRA */}
          <View style={styles.card}>
            <Text
              style={
                styles.sectionTitle
              }
            >
              CLIENTE E OBRA
            </Text>

            <Text style={styles.label}>
              Cliente *
            </Text>

            <TextInput
              style={styles.input}
              value={clientName}
              onChangeText={
                setClientName
              }
              placeholder="Nome do cliente"
              placeholderTextColor="#A3A8AB"
              autoCapitalize="words"
              editable={!saving}
            />

            <Text style={styles.label}>
              Telefone *
            </Text>

            <TextInput
              style={styles.input}
              value={clientPhone}
              onChangeText={
                setClientPhone
              }
              placeholder="(00) 00000-0000"
              placeholderTextColor="#A3A8AB"
              keyboardType="phone-pad"
              editable={!saving}
            />

            <Text style={styles.label}>
              Endereço *
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.multilineInput,
              ]}
              value={address}
              onChangeText={setAddress}
              placeholder="Endereço da obra"
              placeholderTextColor="#A3A8AB"
              autoCapitalize="words"
              multiline
              editable={!saving}
            />

            <Text style={styles.label}>
              Projeto / pedido
            </Text>

            <TextInput
              style={styles.input}
              value={projectOrder}
              onChangeText={
                setProjectOrder
              }
              placeholder="Número ou identificação"
              placeholderTextColor="#A3A8AB"
              editable={!saving}
            />
          </View>

          {/* SITUACAO INICIAL */}
          <View style={styles.card}>
            <Text
              style={
                styles.sectionTitle
              }
            >
              SITUAÇÃO INICIAL
            </Text>

            <Text style={styles.label}>
              Status
            </Text>

            <View
              style={
                styles.statusContainer
              }
            >
              {STATUS_OPTIONS.map(
                (option) => {
                  const selected =
                    option.value ===
                    status;

                  return (
                    <Pressable
                      key={option.value}
                      style={[
                        styles.statusButton,
                        selected &&
                          styles.statusButtonSelected,
                      ]}
                      onPress={() =>
                        setStatus(
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

            <Text style={styles.label}>
              Percentual concluído
            </Text>

            <View
              style={
                styles.progressInputRow
              }
            >
              <TextInput
                style={
                  styles.progressInput
                }
                value={progress}
                onChangeText={
                  setProgress
                }
                placeholder="0"
                placeholderTextColor="#A3A8AB"
                keyboardType="number-pad"
                maxLength={3}
                editable={!saving}
              />

              <Text
                style={
                  styles.percentSymbol
                }
              >
                %
              </Text>
            </View>

            <Text style={styles.helper}>
              De 0 a 100.
            </Text>

            {/* PROXIMA VISITA */}
            <View
              style={
                styles.visitLabelRow
              }
            >
              <Text style={styles.label}>
                Próxima visita
              </Text>

              {nextVisit && (
                <Pressable
                  onPress={
                    removeNextVisit
                  }
                  disabled={saving}
                >
                  <Text
                    style={
                      styles.removeVisitText
                    }
                  >
                    Remover
                  </Text>
                </Pressable>
              )}
            </View>

            <Pressable
              style={[
                styles.dateSelector,
                nextVisit &&
                  styles.dateSelectorSelected,
              ]}
              onPress={
                openNextVisitPicker
              }
              disabled={saving}
            >
              <View
                style={
                  styles.dateSelectorText
                }
              >
                <Text
                  style={[
                    styles.dateMainText,
                    !nextVisit &&
                      styles.datePlaceholder,
                  ]}
                >
                  {nextVisit
                    ? formatVisitDate(
                        nextVisit
                      )
                    : 'Selecionar data e hora'}
                </Text>

                <Text
                  style={
                    styles.dateHelperText
                  }
                >
                  {nextVisit
                    ? 'Toque para alterar'
                    : 'Escolha no calendário'}
                </Text>
              </View>

              <View
                style={
                  styles.calendarButton
                }
              >
                <Text
                  style={
                    styles.calendarButtonText
                  }
                >
                  Calendário
                </Text>
              </View>
            </Pressable>
          </View>

          {/* OBSERVACOES */}
          <View style={styles.card}>
            <Text
              style={
                styles.sectionTitle
              }
            >
              OBSERVAÇÕES
            </Text>

            <TextInput
              style={[
                styles.input,
                styles.notesInput,
              ]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Informações importantes sobre a obra"
              placeholderTextColor="#A3A8AB"
              multiline
              textAlignVertical="top"
              editable={!saving}
            />
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
              saving &&
                styles.createButtonDisabled,
            ]}
            onPress={
              handleCreateWork
            }
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
                  color={FioColors.textOnAccent}
                />

                <Text
                  style={
                    styles.createButtonText
                  }
                >
                  Criando obra...
                </Text>
              </View>
            ) : (
              <Text
                style={
                  styles.createButtonText
                }
              >
                Criar obra
              </Text>
            )}
          </Pressable>

          <Pressable
            style={
              styles.cancelButton
            }
            onPress={() =>
              router.replace('/works')
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

      {/* SELETOR IOS */}
      {Platform.OS === 'ios' && (
        <Modal
          visible={
            showIOSVisitPicker
          }
          transparent
          animationType="fade"
          onRequestClose={() =>
            setShowIOSVisitPicker(
              false
            )
          }
        >
          <View
            style={
              styles.modalBackdrop
            }
          >
            <View
              style={
                styles.pickerModal
              }
            >
              <View
                style={
                  styles.pickerHeader
                }
              >
                <View>
                  <Text
                    style={
                      styles.pickerEyebrow
                    }
                  >
                    PRÓXIMA VISITA
                  </Text>

                  <Text
                    style={
                      styles.pickerTitle
                    }
                  >
                    {iosPickerStep ===
                    'date'
                      ? 'Escolha o dia'
                      : 'Escolha o horário'}
                  </Text>
                </View>

                <Pressable
                  style={
                    styles.modalCloseButton
                  }
                  onPress={() =>
                    setShowIOSVisitPicker(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.modalCloseText
                    }
                  >
                    Cancelar
                  </Text>
                </Pressable>
              </View>

              {iosPickerStep ===
              'date' ? (
                <>
                  <View
                    style={
                      styles.quickDates
                    }
                  >
                    <Pressable
                      style={
                        styles.quickDateButton
                      }
                      onPress={() =>
                        setQuickDay(0)
                      }
                    >
                      <Text
                        style={
                          styles.quickDateText
                        }
                      >
                        Hoje
                      </Text>
                    </Pressable>

                    <Pressable
                      style={
                        styles.quickDateButton
                      }
                      onPress={() =>
                        setQuickDay(1)
                      }
                    >
                      <Text
                        style={
                          styles.quickDateText
                        }
                      >
                        Amanhã
                      </Text>
                    </Pressable>
                  </View>

                  <DateTimePicker
                    value={
                      iosDraftVisit
                    }
                    mode="date"
                    display="inline"
                    locale="pt-BR"
                    minimumDate={
                      new Date()
                    }
                    onChange={(
                      _event,
                      selectedDate
                    ) =>
                      handleIOSDateChange(
                        selectedDate
                      )
                    }
                    style={
                      styles.datePicker
                    }
                  />
                </>
              ) : (
                <>
                  <View
                    style={
                      styles.selectedDateCard
                    }
                  >
                    <Text
                      style={
                        styles.selectedDateLabel
                      }
                    >
                      DATA ESCOLHIDA
                    </Text>

                    <Text
                      style={
                        styles.selectedDateText
                      }
                    >
                      {formatLongDate(
                        iosDraftVisit
                      )}
                    </Text>

                    <Pressable
                      onPress={() =>
                        setIOSPickerStep(
                          'date'
                        )
                      }
                    >
                      <Text
                        style={
                          styles.changeDateText
                        }
                      >
                        Alterar dia
                      </Text>
                    </Pressable>
                  </View>

                  <DateTimePicker
                    value={
                      iosDraftVisit
                    }
                    mode="time"
                    display="spinner"
                    locale="pt-BR"
                    minuteInterval={5}
                    onChange={(
                      _event,
                      selectedTime
                    ) =>
                      handleIOSTimeChange(
                        selectedTime
                      )
                    }
                    style={
                      styles.datePicker
                    }
                  />

                  <Text
                    style={
                      styles.selectedVisitPreview
                    }
                  >
                    {formatVisitDate(
                      iosDraftVisit
                    )}
                  </Text>

                  <Pressable
                    style={
                      styles.confirmVisitButton
                    }
                    onPress={
                      confirmIOSVisit
                    }
                  >
                    <Text
                      style={
                        styles.confirmVisitButtonText
                      }
                    >
                      Confirmar visita
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },

  page: {
    flex: 1,
    backgroundColor: FioColors.canvas,
  },

  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 70,
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
    color: FioColors.text,
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: FioColors.green,
  },

  topButton: {
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: FioColors.surface,
  },

  topButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: FioColors.text,
  },

  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: FioColors.surface,
  },

  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: FioColors.text,
  },

  header: {
    marginBottom: 24,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    color: FioColors.orange,
  },

  title: {
    marginTop: 7,
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '800',
    color: FioColors.text,
  },

  subtitle: {
    marginTop: 9,
    fontSize: 14,
    lineHeight: 21,
    color: FioColors.textMuted,
  },

  card: {
    marginBottom: 14,
    padding: 19,
    borderWidth: 2,
    borderColor: FioColors.lineStrong,
    borderRadius: 18,
    backgroundColor: FioColors.surface,
  },

  sectionTitle: {
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: FioColors.green,
  },

  label: {
    marginTop: 15,
    marginBottom: 7,
    fontSize: 12,
    fontWeight: '700',
    color: FioColors.textMuted,
  },

  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 12,
    backgroundColor: FioColors.surfaceRaised,
    fontSize: 15,
    color: FioColors.text,
  },

  multilineInput: {
    minHeight: 72,
  },

  notesInput: {
    minHeight: 120,
  },

  helper: {
    marginTop: 6,
    fontSize: 11,
    color: FioColors.textSoft,
  },

  statusContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  statusButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 999,
    backgroundColor: FioColors.surfaceRaised,
  },

  statusButtonSelected: {
    borderColor: FioColors.green,
    backgroundColor: FioColors.greenSoft,
  },

  statusButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: FioColors.textMuted,
  },

  statusButtonTextSelected: {
    color: FioColors.green,
  },

  progressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  progressInput: {
    width: 90,
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 12,
    backgroundColor: FioColors.surfaceRaised,
    fontSize: 15,
    color: FioColors.text,
  },

  percentSymbol: {
    marginLeft: 9,
    fontSize: 15,
    fontWeight: '700',
    color: FioColors.textMuted,
  },

  visitLabelRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },

  removeVisitText: {
    marginBottom: 7,
    fontSize: 11,
    fontWeight: '700',
    color: FioColors.orange,
  },

  dateSelector: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 12,
    backgroundColor: FioColors.surfaceRaised,
  },

  dateSelectorSelected: {
    borderColor: FioColors.green,
    backgroundColor: FioColors.greenSoft,
  },

  dateSelectorText: {
    flex: 1,
  },

  dateMainText: {
    fontSize: 14,
    fontWeight: '700',
    color: FioColors.text,
  },

  datePlaceholder: {
    fontWeight: '600',
    color: FioColors.textSoft,
  },

  dateHelperText: {
    marginTop: 4,
    fontSize: 10,
    color: FioColors.textSoft,
  },

  calendarButton: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: FioColors.greenSoft,
  },

  calendarButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: FioColors.green,
  },

  messageCard: {
    marginBottom: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: FioColors.dangerSoft,
  },

  messageText: {
    fontSize: 13,
    lineHeight: 19,
    color: FioColors.danger,
  },

  createButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: FioColors.orange,
  },

  createButtonDisabled: {
    opacity: 0.65,
  },

  createButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: FioColors.textOnAccent,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  cancelButton: {
    minHeight: 48,
    marginTop: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: FioColors.textMuted,
  },

  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor:
      'rgba(12, 15, 12, 0.68)',
  },

  pickerModal: {
    width: '100%',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 34,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderColor: FioColors.lineStrong,
    backgroundColor: FioColors.surface,
  },

  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },

  pickerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: FioColors.orange,
  },

  pickerTitle: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: '800',
    color: FioColors.text,
  },

  modalCloseButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: FioColors.surfaceRaised,
  },

  modalCloseText: {
    fontSize: 11,
    fontWeight: '700',
    color: FioColors.textMuted,
  },

  quickDates: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },

  quickDateButton: {
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 999,
    backgroundColor: FioColors.surfaceRaised,
  },

  quickDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: FioColors.green,
  },

  datePicker: {
    marginTop: 10,
    alignSelf: 'center',
  },

  selectedDateCard: {
    marginTop: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: 14,
    backgroundColor: FioColors.surfaceRaised,
  },

  selectedDateLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: FioColors.textSoft,
  },

  selectedDateText: {
    marginTop: 5,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: FioColors.text,
  },

  changeDateText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '800',
    color: FioColors.orange,
  },

  selectedVisitPreview: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    color: FioColors.text,
  },

  confirmVisitButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: FioColors.green,
  },

  confirmVisitButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: FioColors.textOnAccent,
  },
});
