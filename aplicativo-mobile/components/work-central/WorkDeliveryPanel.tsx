import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  WorkEnvironment,
  WorkParticipant,
} from '@/components/work-central/types';
import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type DeliveryStatus = 'preparing' | 'ready';
type ChecklistStatus = 'open' | 'completed';
type PhotoSource = 'camera' | 'gallery';
type PhotoVisibility = 'internal' | 'shared';

type DeliveryState = {
  notes: string | null;
  status: DeliveryStatus;
  ready_by: string | null;
  ready_at: string | null;
};

type ChecklistItem = {
  id: string;
  work_id: string;
  environment_id: string | null;
  title: string;
  description: string | null;
  required: boolean;
  responsible_user_id: string | null;
  status: ChecklistStatus;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
};

type BlockingPending = {
  id: string;
  environment_id: string | null;
  title: string;
};

type FinalPhoto = {
  id: string;
  environment_id: string | null;
};

type EnvironmentDeliverySummary = {
  minimum: number;
  photos: number;
  missingPhotos: number;
  pending: number;
  checklist: number;
  blockers: number;
};

const EMPTY_STATE: DeliveryState = {
  notes: null,
  status: 'preparing',
  ready_by: null,
  ready_at: null,
};

function makeFileName() {
  return `fio-entrega-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.jpg`;
}

function formatDate(value: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function plural(value: number, singular: string, pluralLabel: string) {
  return `${value} ${value === 1 ? singular : pluralLabel}`;
}

export function WorkDeliveryPanel({
  workId,
  environments,
  participants,
  canWrite,
  canManage,
  userId,
  environmentFilterId,
  onSummaryChange,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  canWrite: boolean;
  canManage: boolean;
  userId: string | null;
  environmentFilterId?: string;
  onSummaryChange?: (blockers: number, ready: boolean) => void;
  onChanged?: () => void;
}) {
  const [deliveryState, setDeliveryState] =
    useState<DeliveryState>(EMPTY_STATE);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [blockingPending, setBlockingPending] =
    useState<BlockingPending[]>([]);
  const [finalPhotos, setFinalPhotos] = useState<FinalPhoto[]>([]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingEnvironmentId, setUploadingEnvironmentId] =
    useState<string | null>(null);
  const [changingItemId, setChangingItemId] = useState<string | null>(null);
  const [changingMinimumId, setChangingMinimumId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [openEnvironmentId, setOpenEnvironmentId] =
    useState<string | null>(environmentFilterId ?? null);
  const [photoVisibility, setPhotoVisibility] =
    useState<PhotoVisibility>('shared');

  const [formVisible, setFormVisible] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemTitle, setItemTitle] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemEnvironmentId, setItemEnvironmentId] =
    useState<string | null>(null);
  const [itemResponsibleId, setItemResponsibleId] =
    useState<string | null>(null);
  const [itemRequired, setItemRequired] = useState(true);

  const activeEnvironments = useMemo(
    () => environments.filter((environment) => environment.status !== 'cancelado'),
    [environments]
  );

  const operationalParticipants = useMemo(
    () =>
      participants.filter(
        (participant) => participant.access_level !== 'viewer'
      ),
    [participants]
  );

  const participantNames = useMemo(
    () =>
      Object.fromEntries(
        participants.map((participant) => [
          participant.user_id,
          participant.full_name,
        ])
      ),
    [participants]
  );

  const loadDelivery = useCallback(async () => {
    if (!canWrite) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    const [stateResult, itemsResult, pendingResult, photosResult] =
      await Promise.all([
        supabase
          .from('work_delivery_states')
          .select('notes, status, ready_by, ready_at')
          .eq('work_id', workId)
          .maybeSingle(),
        supabase
          .from('work_delivery_checklist_items')
          .select(`
            id, work_id, environment_id, title, description,
            required, responsible_user_id, status,
            completed_by, completed_at, created_at
          `)
          .eq('work_id', workId)
          .eq('active', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('work_pending_items')
          .select('id, environment_id, title')
          .eq('work_id', workId)
          .eq('status', 'open')
          .eq('blocks_delivery', true)
          .order('created_at', { ascending: true }),
        supabase
          .from('work_photos')
          .select('id, environment_id')
          .eq('work_id', workId)
          .eq('collection', 'work')
          .eq('photo_type', 'delivery_final'),
      ]);

    const firstError =
      stateResult.error ??
      itemsResult.error ??
      pendingResult.error ??
      photosResult.error;

    if (firstError) {
      setMessage(firstError.message);
      setLoading(false);
      return;
    }

    const nextState = (stateResult.data as DeliveryState | null) ?? EMPTY_STATE;
    setDeliveryState(nextState);
    setNotes(nextState.notes ?? '');
    setItems((itemsResult.data ?? []) as ChecklistItem[]);
    setBlockingPending((pendingResult.data ?? []) as BlockingPending[]);
    setFinalPhotos((photosResult.data ?? []) as FinalPhoto[]);
    setLoading(false);
  }, [canWrite, workId]);

  useEffect(() => {
    void loadDelivery();
  }, [loadDelivery]);

  useEffect(() => {
    if (environmentFilterId) setOpenEnvironmentId(environmentFilterId);
  }, [environmentFilterId]);

  const summaryByEnvironment = useMemo(() => {
    const summaries: Record<string, EnvironmentDeliverySummary> = {};

    for (const environment of activeEnvironments) {
      const minimum = environment.preparation_min_photos ?? 0;
      const photos = finalPhotos.filter(
        (photo) => photo.environment_id === environment.id
      ).length;
      const pending = blockingPending.filter(
        (item) => item.environment_id === environment.id
      ).length;
      const checklist = items.filter(
        (item) =>
          item.environment_id === environment.id &&
          item.required &&
          item.status === 'open'
      ).length;
      const missingPhotos = Math.max(minimum - photos, 0);
      const photoBlocker = minimum < 1 || missingPhotos > 0 ? 1 : 0;

      summaries[environment.id] = {
        minimum,
        photos,
        missingPhotos,
        pending,
        checklist,
        blockers: photoBlocker + pending + checklist,
      };
    }

    return summaries;
  }, [activeEnvironments, blockingPending, finalPhotos, items]);

  const generalPendingCount = blockingPending.filter(
    (item) => !item.environment_id
  ).length;
  const generalChecklistCount = items.filter(
    (item) => !item.environment_id && item.required && item.status === 'open'
  ).length;
  const environmentBlockerCount = Object.values(summaryByEnvironment).reduce(
    (total, summary) => total + summary.blockers,
    0
  );
  const totalBlockers =
    generalPendingCount +
    generalChecklistCount +
    environmentBlockerCount +
    (activeEnvironments.length === 0 ? 1 : 0);
  const ready = deliveryState.status === 'ready' && totalBlockers === 0;

  useEffect(() => {
    onSummaryChange?.(totalBlockers, ready);
  }, [onSummaryChange, ready, totalBlockers]);

  const visibleEnvironments = environmentFilterId
    ? activeEnvironments.filter(
        (environment) => environment.id === environmentFilterId
      )
    : activeEnvironments;

  function clearFeedback() {
    setMessage('');
    setSuccessMessage('');
  }

  async function saveNotes() {
    if (!canManage || saving) return;
    setSaving(true);
    clearFeedback();
    const { error } = await supabase.rpc('save_work_delivery_notes', {
      p_work_id: workId,
      p_notes: notes || null,
    });
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Orientações da entrega salvas.');
      await loadDelivery();
      onChanged?.();
    }
    setSaving(false);
  }

  function openItemForm(
    environmentId: string | null,
    item?: ChecklistItem
  ) {
    setEditingItemId(item?.id ?? null);
    setItemTitle(item?.title ?? '');
    setItemDescription(item?.description ?? '');
    setItemEnvironmentId(item?.environment_id ?? environmentId);
    setItemResponsibleId(item?.responsible_user_id ?? null);
    setItemRequired(item?.required ?? true);
    setFormVisible(true);
    clearFeedback();
  }

  async function saveItem() {
    if (!canManage || saving) return;
    if (!itemTitle.trim()) {
      setMessage('Informe o item do checklist.');
      return;
    }

    setSaving(true);
    clearFeedback();
    const { error } = await supabase.rpc(
      'save_work_delivery_checklist_item',
      {
        p_work_id: workId,
        p_title: itemTitle,
        p_item_id: editingItemId,
        p_environment_id: itemEnvironmentId,
        p_description: itemDescription || null,
        p_responsible_user_id: itemResponsibleId,
        p_required: itemRequired,
      }
    );

    if (error) setMessage(error.message);
    else {
      setFormVisible(false);
      setSuccessMessage(
        editingItemId ? 'Item atualizado.' : 'Item adicionado ao checklist.'
      );
      await loadDelivery();
      onChanged?.();
    }
    setSaving(false);
  }

  async function toggleItem(item: ChecklistItem) {
    const canToggle =
      canManage ||
      (!!userId && item.responsible_user_id === userId && canWrite);
    if (!canToggle || changingItemId) return;

    setChangingItemId(item.id);
    clearFeedback();
    const { error } = await supabase.rpc(
      'set_work_delivery_item_completed',
      {
        p_item_id: item.id,
        p_completed: item.status !== 'completed',
      }
    );
    if (error) setMessage(error.message);
    else {
      await loadDelivery();
      onChanged?.();
    }
    setChangingItemId(null);
  }

  function confirmArchive(item: ChecklistItem) {
    if (!canManage || saving) return;
    Alert.alert(
      'Remover item?',
      'O item sairá do checklist, mas o registro permanecerá no Diário/FIO.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: () => void archiveItem(item),
        },
      ]
    );
  }

  async function archiveItem(item: ChecklistItem) {
    setSaving(true);
    clearFeedback();
    const { error } = await supabase.rpc(
      'archive_work_delivery_checklist_item',
      { p_item_id: item.id }
    );
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Item removido do checklist.');
      await loadDelivery();
      onChanged?.();
    }
    setSaving(false);
  }

  async function changeMinimum(
    environment: WorkEnvironment,
    nextValue: number
  ) {
    if (!canManage || changingMinimumId) return;
    const safeValue = Math.max(0, Math.min(nextValue, 100));
    setChangingMinimumId(environment.id);
    clearFeedback();
    const { error } = await supabase.rpc(
      'set_environment_delivery_min_photos',
      {
        p_environment_id: environment.id,
        p_min_photos: safeValue,
      }
    );
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Quantidade de fotos finais atualizada.');
      onChanged?.();
    }
    setChangingMinimumId(null);
  }

  async function uploadAsset(
    asset: ImagePicker.ImagePickerAsset,
    environmentId: string,
    source: PhotoSource
  ) {
    if (!asset.base64) {
      throw new Error('Não foi possível ler a imagem selecionada.');
    }

    const { data: authData, error: authError } =
      await supabase.auth.getUser();
    if (authError || !authData.user) {
      throw new Error('Usuário não autenticado.');
    }

    const fileName = makeFileName();
    const storagePath = `${workId}/${environmentId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('work-photos')
      .upload(storagePath, decode(asset.base64), {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase
      .from('work_photos')
      .insert({
        work_id: workId,
        environment_id: environmentId,
        collection: 'work',
        photo_type: 'delivery_final',
        storage_path: storagePath,
        file_name: asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: asset.fileSize ?? null,
        caption: 'Foto final de entrega',
        visibility: photoVisibility,
        taken_at: source === 'camera' ? new Date().toISOString() : null,
        created_by: authData.user.id,
      });

    if (insertError) {
      await supabase.storage.from('work-photos').remove([storagePath]);
      throw insertError;
    }
  }

  async function addFinalPhotos(
    environmentId: string,
    source: PhotoSource
  ) {
    if (!canWrite || uploadingEnvironmentId) return;
    clearFeedback();

    let assets: ImagePicker.ImagePickerAsset[] = [];
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Câmera não autorizada',
          'Permita o acesso à câmera para registrar as fotos finais.'
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        base64: true,
        allowsEditing: false,
      });
      if (result.canceled) return;
      assets = result.assets;
    } else {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Fotos não autorizadas',
          'Permita o acesso às fotos para selecionar as imagens finais.'
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 20,
        orderedSelection: true,
        allowsEditing: false,
        quality: 0.75,
        base64: true,
      });
      if (result.canceled) return;
      assets = result.assets;
    }

    setUploadingEnvironmentId(environmentId);
    try {
      for (const asset of assets) {
        await uploadAsset(asset, environmentId, source);
      }
      setSuccessMessage(
        assets.length === 1
          ? 'Foto final adicionada.'
          : `${assets.length} fotos finais adicionadas.`
      );
      await loadDelivery();
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar as fotos finais.'
      );
    } finally {
      setUploadingEnvironmentId(null);
    }
  }

  async function setDeliveryReady() {
    if (!canManage || saving || totalBlockers > 0) return;
    setSaving(true);
    clearFeedback();
    const { error } = await supabase.rpc(
      'confirm_work_ready_for_delivery',
      { p_work_id: workId }
    );
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Obra marcada como pronta para entrega.');
      await loadDelivery();
      onChanged?.();
    }
    setSaving(false);
  }

  async function reopenDelivery() {
    if (!canManage || saving) return;
    setSaving(true);
    clearFeedback();
    const { error } = await supabase.rpc('reopen_work_delivery', {
      p_work_id: workId,
    });
    if (error) setMessage(error.message);
    else {
      setSuccessMessage('Preparação para entrega reaberta.');
      await loadDelivery();
      onChanged?.();
    }
    setSaving(false);
  }

  function renderChecklist(scopeEnvironmentId: string | null) {
    const scopedItems = items.filter(
      (item) => item.environment_id === scopeEnvironmentId
    );

    return (
      <View style={styles.checklistBlock}>
        <View style={styles.blockHeading}>
          <Text style={styles.blockTitle}>Checklist</Text>
          {canManage && (
            <Pressable
              accessibilityLabel="Adicionar item ao checklist"
              style={styles.smallAddButton}
              onPress={() => openItemForm(scopeEnvironmentId)}
            >
              <Ionicons name="add-outline" size={19} color="#FFFFFF" />
              <Text style={styles.smallAddText}>Adicionar</Text>
            </Pressable>
          )}
        </View>

        {scopedItems.length === 0 ? (
          <Text style={styles.emptyText}>Nenhum item cadastrado.</Text>
        ) : (
          scopedItems.map((item) => {
            const completed = item.status === 'completed';
            const canToggle =
              canManage ||
              (!!userId && item.responsible_user_id === userId && canWrite);

            return (
              <View key={item.id} style={styles.itemCard}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: completed, disabled: !canToggle }}
                  style={[
                    styles.checkButton,
                    completed && styles.checkButtonCompleted,
                    !canToggle && styles.disabled,
                  ]}
                  onPress={() => void toggleItem(item)}
                  disabled={!canToggle || changingItemId !== null}
                >
                  {changingItemId === item.id ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name={completed ? 'checkmark-outline' : 'ellipse-outline'}
                      size={21}
                      color={completed ? '#FFFFFF' : FioColors.green}
                    />
                  )}
                </Pressable>

                <View style={styles.itemIdentity}>
                  <View style={styles.itemTitleRow}>
                    <Text
                      style={[
                        styles.itemTitle,
                        completed && styles.itemTitleCompleted,
                      ]}
                    >
                      {item.title}
                    </Text>
                    <View
                      style={[
                        styles.requirementTag,
                        !item.required && styles.optionalTag,
                      ]}
                    >
                      <Text
                        style={[
                          styles.requirementText,
                          !item.required && styles.optionalText,
                        ]}
                      >
                        {item.required ? 'Obrigatório' : 'Opcional'}
                      </Text>
                    </View>
                  </View>
                  {!!item.description && (
                    <Text style={styles.itemDescription}>{item.description}</Text>
                  )}
                  <Text style={styles.itemMeta}>
                    {item.responsible_user_id
                      ? `Responsável: ${
                          participantNames[item.responsible_user_id] ?? 'Participante'
                        }`
                      : 'Sem responsável definido'}
                  </Text>
                  {completed && !!item.completed_at && (
                    <Text style={styles.itemCompletedAt}>
                      Concluído em {formatDate(item.completed_at)}
                    </Text>
                  )}
                </View>

                {canManage && (
                  <View style={styles.itemActions}>
                    <Pressable
                      accessibilityLabel="Editar item"
                      style={styles.iconAction}
                      onPress={() => openItemForm(scopeEnvironmentId, item)}
                    >
                      <Ionicons name="create-outline" size={18} color={FioColors.green} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="Remover item"
                      style={styles.iconAction}
                      onPress={() => confirmArchive(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#B42318" />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    );
  }

  if (!canWrite) {
    return (
      <View style={styles.readOnlyCard}>
        <Ionicons name="lock-closed-outline" size={20} color={FioColors.green} />
        <Text style={styles.readOnlyText}>
          A preparação para entrega é visível para a equipe operacional.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.green} />
        <Text style={styles.muted}>Carregando preparação para entrega...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.statusCard, ready && styles.statusCardReady]}>
        <View style={[styles.statusIcon, ready && styles.statusIconReady]}>
          <Ionicons
            name={ready ? 'checkmark-done-outline' : 'clipboard-outline'}
            size={25}
            color={ready ? '#FFFFFF' : FioColors.green}
          />
        </View>
        <View style={styles.statusIdentity}>
          <Text style={styles.statusEyebrow}>PREPARAÇÃO PARA ENTREGA</Text>
          <Text style={styles.statusTitle}>
            {ready ? 'Pronta para entrega' : 'Em preparação'}
          </Text>
          <Text style={styles.statusDetail}>
            {ready
              ? `Confirmada em ${formatDate(deliveryState.ready_at)}`
              : totalBlockers === 0
              ? 'Tudo conferido. A obra pode ser confirmada.'
              : plural(totalBlockers, 'bloqueio pendente', 'bloqueios pendentes')}
          </Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{totalBlockers}</Text>
          <Text style={styles.summaryLabel}>Bloqueios</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>
            {items.filter((item) => item.status === 'completed').length}/
            {items.length}
          </Text>
          <Text style={styles.summaryLabel}>Itens concluídos</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{finalPhotos.length}</Text>
          <Text style={styles.summaryLabel}>Fotos finais</Text>
        </View>
      </View>

      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}
      {!!successMessage && (
        <View style={styles.successCard}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}

      {!environmentFilterId && (
        <View style={styles.generalCard}>
          <View style={styles.blockHeading}>
            <View style={styles.headingIdentity}>
              <Text style={styles.blockTitle}>Orientações gerais</Text>
              <Text style={styles.blockSubtitle}>
                Informações importantes para preparar e realizar a entrega.
              </Text>
            </View>
          </View>
          <TextInput
            style={[styles.notesInput, !canManage && styles.inputDisabled]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Ex.: conferir limpeza, chaves, manuais e acesso do cliente."
            placeholderTextColor="#9299A6"
            multiline
            editable={canManage}
          />
          {canManage && (
            <Pressable
              style={styles.saveNotesButton}
              onPress={() => void saveNotes()}
              disabled={saving}
            >
              <Text style={styles.saveNotesText}>
                {saving ? 'Salvando...' : 'Salvar orientações'}
              </Text>
            </Pressable>
          )}

          {(generalPendingCount > 0 || generalChecklistCount > 0) && (
            <View style={styles.blockerNotice}>
              <Ionicons name="alert-circle-outline" size={19} color="#B54708" />
              <Text style={styles.blockerNoticeText}>
                {plural(
                  generalPendingCount + generalChecklistCount,
                  'bloqueio geral precisa ser resolvido.',
                  'bloqueios gerais precisam ser resolvidos.'
                )}
              </Text>
            </View>
          )}

          {renderChecklist(null)}
        </View>
      )}

      <View style={styles.environmentsHeading}>
        <Text style={styles.blockTitle}>
          {environmentFilterId ? 'Entrega do ambiente' : 'Ambientes'}
        </Text>
        <Text style={styles.blockSubtitle}>
          Cada ambiente possui seu próprio mínimo de fotos finais.
        </Text>
      </View>

      {visibleEnvironments.length === 0 ? (
        <Text style={styles.emptyEnvironmentText}>
          Nenhum ambiente ativo para preparar.
        </Text>
      ) : (
        visibleEnvironments.map((environment) => {
          const summary = summaryByEnvironment[environment.id];
          const open = openEnvironmentId === environment.id;
          const uploadInProgress = uploadingEnvironmentId === environment.id;

          return (
            <View key={environment.id} style={styles.environmentCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                style={styles.environmentHeader}
                onPress={() =>
                  setOpenEnvironmentId(open ? null : environment.id)
                }
              >
                <View
                  style={[
                    styles.environmentStatusIcon,
                    summary.blockers === 0 && styles.environmentStatusIconReady,
                  ]}
                >
                  <Ionicons
                    name={
                      summary.blockers === 0
                        ? 'checkmark-outline'
                        : 'alert-outline'
                    }
                    size={19}
                    color={summary.blockers === 0 ? '#FFFFFF' : '#B54708'}
                  />
                </View>
                <View style={styles.environmentIdentity}>
                  <Text style={styles.environmentName}>{environment.name}</Text>
                  <Text style={styles.environmentMeta}>
                    {summary.minimum < 1
                      ? 'Mínimo de fotos não definido'
                      : `${summary.photos}/${summary.minimum} fotos finais`}
                    {' · '}
                    {summary.blockers === 0
                      ? 'Pronto'
                      : plural(summary.blockers, 'bloqueio', 'bloqueios')}
                  </Text>
                </View>
                <Ionicons
                  name={open ? 'chevron-up-outline' : 'chevron-down-outline'}
                  size={21}
                  color="#34405A"
                />
              </Pressable>

              {open && (
                <View style={styles.environmentBody}>
                  <View style={styles.photoRequirementCard}>
                    <View style={styles.headingIdentity}>
                      <Text style={styles.photoRequirementTitle}>Fotos finais obrigatórias</Text>
                      <Text style={styles.photoRequirementDetail}>
                        {summary.minimum < 1
                          ? 'Defina o mínimo necessário para este ambiente.'
                          : summary.missingPhotos > 0
                          ? `Ainda faltam ${summary.missingPhotos}.`
                          : 'Quantidade mínima atendida.'}
                      </Text>
                    </View>

                    {canManage ? (
                      <View style={styles.stepper}>
                        <Pressable
                          accessibilityLabel="Diminuir fotos obrigatórias"
                          style={styles.stepperButton}
                          onPress={() =>
                            void changeMinimum(environment, summary.minimum - 1)
                          }
                          disabled={changingMinimumId !== null || summary.minimum === 0}
                        >
                          <Ionicons name="remove-outline" size={20} color={FioColors.green} />
                        </Pressable>
                        <Text style={styles.stepperValue}>{summary.minimum}</Text>
                        <Pressable
                          accessibilityLabel="Aumentar fotos obrigatórias"
                          style={styles.stepperButton}
                          onPress={() =>
                            void changeMinimum(environment, summary.minimum + 1)
                          }
                          disabled={changingMinimumId !== null}
                        >
                          <Ionicons name="add-outline" size={20} color={FioColors.green} />
                        </Pressable>
                      </View>
                    ) : (
                      <Text style={styles.minimumReadOnly}>{summary.minimum}</Text>
                    )}
                  </View>

                  <View style={styles.visibilityRow}>
                    <Text style={styles.visibilityLabel}>Visibilidade das próximas fotos:</Text>
                    <View style={styles.visibilityOptions}>
                      <Pressable
                        style={[
                          styles.visibilityButton,
                          photoVisibility === 'shared' && styles.visibilityButtonActive,
                        ]}
                        onPress={() => setPhotoVisibility('shared')}
                      >
                        <Ionicons name="eye-outline" size={15} color={FioColors.green} />
                        <Text style={styles.visibilityButtonText}>Compartilhada</Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.visibilityButton,
                          photoVisibility === 'internal' && styles.visibilityButtonActive,
                        ]}
                        onPress={() => setPhotoVisibility('internal')}
                      >
                        <Ionicons name="lock-closed-outline" size={14} color={FioColors.green} />
                        <Text style={styles.visibilityButtonText}>Interna</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.photoActions}>
                    <Pressable
                      style={styles.cameraButton}
                      onPress={() => void addFinalPhotos(environment.id, 'camera')}
                      disabled={uploadingEnvironmentId !== null}
                    >
                      {uploadInProgress ? (
                        <ActivityIndicator color="#FFFFFF" />
                      ) : (
                        <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
                      )}
                      <Text style={styles.cameraText}>Foto final</Text>
                    </Pressable>
                    <Pressable
                      style={styles.galleryButton}
                      onPress={() => void addFinalPhotos(environment.id, 'gallery')}
                      disabled={uploadingEnvironmentId !== null}
                    >
                      <Ionicons name="images-outline" size={19} color={FioColors.green} />
                      <Text style={styles.galleryText}>Selecionar várias</Text>
                    </Pressable>
                  </View>

                  {(summary.pending > 0 || summary.checklist > 0) && (
                    <View style={styles.blockerNotice}>
                      <Ionicons name="alert-circle-outline" size={19} color="#B54708" />
                      <Text style={styles.blockerNoticeText}>
                        {summary.pending > 0
                          ? plural(
                              summary.pending,
                              'pendência bloqueadora aberta',
                              'pendências bloqueadoras abertas'
                            )
                          : ''}
                        {summary.pending > 0 && summary.checklist > 0 ? ' · ' : ''}
                        {summary.checklist > 0
                          ? plural(
                              summary.checklist,
                              'item obrigatório aberto',
                              'itens obrigatórios abertos'
                            )
                          : ''}
                      </Text>
                    </View>
                  )}

                  {renderChecklist(environment.id)}
                </View>
              )}
            </View>
          );
        })
      )}

      {canManage && !environmentFilterId && (
        <View style={styles.finalActionCard}>
          <View style={styles.headingIdentity}>
            <Text style={styles.finalActionTitle}>
              {ready ? 'Entrega confirmada' : 'Concluir preparação'}
            </Text>
            <Text style={styles.finalActionDetail}>
              {ready
                ? 'Reabra caso seja necessário corrigir ou complementar algo.'
                : totalBlockers === 0
                ? 'Todos os requisitos estão atendidos.'
                : 'Resolva os bloqueios antes de confirmar.'}
            </Text>
          </View>
          <Pressable
            style={[
              styles.finalActionButton,
              !ready && totalBlockers > 0 && styles.finalActionButtonDisabled,
            ]}
            onPress={() =>
              ready ? void reopenDelivery() : void setDeliveryReady()
            }
            disabled={saving || (!ready && totalBlockers > 0)}
          >
            <Ionicons
              name={ready ? 'refresh-outline' : 'checkmark-done-outline'}
              size={20}
              color="#FFFFFF"
            />
            <Text style={styles.finalActionButtonText}>
              {ready ? 'Reabrir preparação' : 'Marcar pronta para entrega'}
            </Text>
          </Pressable>
        </View>
      )}

      <Text style={styles.futureNote}>
        A confirmação do cliente e o aceite formal serão adicionados no Portal do Cliente.
      </Text>

      <Modal
        visible={formVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headingIdentity}>
                <Text style={styles.modalTitle}>
                  {editingItemId ? 'Editar item' : 'Novo item'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  Checklist geral ou de um ambiente.
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setFormVisible(false)}
              >
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>ITEM *</Text>
              <TextInput
                style={styles.input}
                value={itemTitle}
                onChangeText={setItemTitle}
                placeholder="Ex.: conferir portas e alinhamentos"
                placeholderTextColor="#9299A6"
                maxLength={160}
              />

              <Text style={styles.fieldLabel}>DETALHES</Text>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                value={itemDescription}
                onChangeText={setItemDescription}
                placeholder="Orientações para concluir este item"
                placeholderTextColor="#9299A6"
                multiline
              />

              <Text style={styles.fieldLabel}>LOCAL</Text>
              <Pressable
                style={[
                  styles.optionButton,
                  itemEnvironmentId === null && styles.optionButtonActive,
                ]}
                onPress={() => setItemEnvironmentId(null)}
              >
                <Ionicons name="home-outline" size={18} color={FioColors.green} />
                <Text style={styles.optionText}>Geral da obra</Text>
                {itemEnvironmentId === null && (
                  <Ionicons name="checkmark-circle" size={19} color={FioColors.green} />
                )}
              </Pressable>
              {activeEnvironments.map((environment) => (
                <Pressable
                  key={environment.id}
                  style={[
                    styles.optionButton,
                    itemEnvironmentId === environment.id && styles.optionButtonActive,
                  ]}
                  onPress={() => setItemEnvironmentId(environment.id)}
                >
                  <Ionicons name="grid-outline" size={18} color={FioColors.green} />
                  <Text style={styles.optionText}>{environment.name}</Text>
                  {itemEnvironmentId === environment.id && (
                    <Ionicons name="checkmark-circle" size={19} color={FioColors.green} />
                  )}
                </Pressable>
              ))}

              <Text style={styles.fieldLabel}>RESPONSÁVEL</Text>
              <Pressable
                style={[
                  styles.optionButton,
                  itemResponsibleId === null && styles.optionButtonActive,
                ]}
                onPress={() => setItemResponsibleId(null)}
              >
                <Ionicons name="people-outline" size={18} color={FioColors.green} />
                <Text style={styles.optionText}>Sem responsável</Text>
                {itemResponsibleId === null && (
                  <Ionicons name="checkmark-circle" size={19} color={FioColors.green} />
                )}
              </Pressable>
              {operationalParticipants.map((participant) => (
                <Pressable
                  key={participant.user_id}
                  style={[
                    styles.optionButton,
                    itemResponsibleId === participant.user_id && styles.optionButtonActive,
                  ]}
                  onPress={() => setItemResponsibleId(participant.user_id)}
                >
                  <Ionicons name="person-outline" size={18} color={FioColors.green} />
                  <Text style={styles.optionText}>{participant.full_name}</Text>
                  {itemResponsibleId === participant.user_id && (
                    <Ionicons name="checkmark-circle" size={19} color={FioColors.green} />
                  )}
                </Pressable>
              ))}

              <View style={styles.switchRow}>
                <View style={styles.headingIdentity}>
                  <Text style={styles.switchTitle}>Item obrigatório</Text>
                  <Text style={styles.switchDetail}>
                    Quando aberto, impede a confirmação da entrega.
                  </Text>
                </View>
                <Switch
                  value={itemRequired}
                  onValueChange={setItemRequired}
                  trackColor={{ false: '#D8DCE3', true: '#9DBBA7' }}
                  thumbColor={itemRequired ? FioColors.green : '#FFFFFF'}
                />
              </View>

              <Pressable
                style={styles.saveItemButton}
                onPress={() => void saveItem()}
                disabled={saving}
              >
                <Text style={styles.saveItemText}>
                  {saving ? 'Salvando...' : 'Salvar item'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: '#7A8394' },
  readOnlyCard: { minHeight: 80, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, backgroundColor: '#F4F6F4' },
  readOnlyText: { flex: 1, fontSize: 11, lineHeight: 17, color: '#596675' },
  statusCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E0E3E9', borderRadius: 14, backgroundColor: '#FBFAF7' },
  statusCardReady: { borderColor: '#B8D5C0', backgroundColor: '#EFF8F1' },
  statusIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#E7F1E8' },
  statusIconReady: { backgroundColor: FioColors.green },
  statusIdentity: { flex: 1, minWidth: 0 },
  statusEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: FioColors.gold },
  statusTitle: { marginTop: 3, fontSize: 16, fontWeight: '900', color: '#172033' },
  statusDetail: { marginTop: 3, fontSize: 10, lineHeight: 15, color: '#687386' },
  summaryRow: { marginTop: 9, flexDirection: 'row', gap: 7 },
  summaryCard: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: '#F8F6F1' },
  summaryNumber: { fontSize: 18, fontWeight: '900', color: FioColors.green },
  summaryLabel: { marginTop: 2, fontSize: 8, color: '#6F736F' },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#FFF0EE' },
  errorText: { fontSize: 11, lineHeight: 16, color: '#B42318' },
  successCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: '#EEF8F1' },
  successText: { fontSize: 11, color: '#267A48' },
  generalCard: { marginTop: 11, padding: 12, borderWidth: 1, borderColor: '#E0E3E9', borderRadius: 14, backgroundColor: '#FFFFFF' },
  blockHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIdentity: { flex: 1, minWidth: 0 },
  blockTitle: { fontSize: 13, fontWeight: '900', color: '#202B3D' },
  blockSubtitle: { marginTop: 2, fontSize: 9, lineHeight: 14, color: '#778194' },
  notesInput: { minHeight: 88, marginTop: 10, padding: 11, borderWidth: 1, borderColor: '#DDE1E7', borderRadius: 11, backgroundColor: '#FFFFFF', textAlignVertical: 'top', fontSize: 11, lineHeight: 17, color: '#273247' },
  inputDisabled: { backgroundColor: '#F7F8F9', color: '#697386' },
  saveNotesButton: { minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  saveNotesText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
  blockerNotice: { marginTop: 9, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: '#FFF4E8' },
  blockerNoticeText: { flex: 1, fontSize: 9, lineHeight: 14, color: '#8A3D0A' },
  checklistBlock: { marginTop: 12 },
  smallAddButton: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, backgroundColor: FioColors.green },
  smallAddText: { fontSize: 9, fontWeight: '900', color: '#FFFFFF' },
  emptyText: { marginTop: 9, padding: 12, textAlign: 'center', fontSize: 10, color: '#7D8697' },
  itemCard: { minHeight: 70, marginTop: 8, padding: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: '#E2E5EA', borderRadius: 11, backgroundColor: '#FFFFFF' },
  checkButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFD0C3', borderRadius: 12, backgroundColor: '#F3F8F4' },
  checkButtonCompleted: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  disabled: { opacity: 0.45 },
  itemIdentity: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  itemTitle: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: '#273247' },
  itemTitleCompleted: { textDecorationLine: 'line-through', color: '#7A8394' },
  requirementTag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: '#FFF0E6' },
  optionalTag: { backgroundColor: '#EEF1F5' },
  requirementText: { fontSize: 7, fontWeight: '900', color: '#B54708' },
  optionalText: { color: '#687386' },
  itemDescription: { marginTop: 4, fontSize: 9, lineHeight: 14, color: '#697386' },
  itemMeta: { marginTop: 5, fontSize: 8, color: '#778194' },
  itemCompletedAt: { marginTop: 2, fontSize: 7, color: '#43835A' },
  itemActions: { gap: 4 },
  iconAction: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F4F5F7' },
  environmentsHeading: { marginTop: 16, paddingHorizontal: 2 },
  emptyEnvironmentText: { marginTop: 9, padding: 14, textAlign: 'center', fontSize: 10, color: '#7D8697' },
  environmentCard: { marginTop: 9, overflow: 'hidden', borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 13, backgroundColor: '#FFFFFF' },
  environmentHeader: { minHeight: 68, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  environmentStatusIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFF0E6' },
  environmentStatusIconReady: { backgroundColor: FioColors.green },
  environmentIdentity: { flex: 1, minWidth: 0 },
  environmentName: { fontSize: 12, fontWeight: '900', color: '#202B3D' },
  environmentMeta: { marginTop: 3, fontSize: 9, color: '#778194' },
  environmentBody: { padding: 11, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#ECEEF2' },
  photoRequirementCard: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, backgroundColor: '#F8F6F1' },
  photoRequirementTitle: { fontSize: 11, fontWeight: '900', color: '#273247' },
  photoRequirementDetail: { marginTop: 2, fontSize: 8, color: '#737D8E' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFD0C3', borderRadius: 12, backgroundColor: '#FFFFFF' },
  stepperValue: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '900', color: FioColors.green },
  minimumReadOnly: { minWidth: 42, textAlign: 'center', fontSize: 18, fontWeight: '900', color: FioColors.green },
  visibilityRow: { marginTop: 10 },
  visibilityLabel: { fontSize: 8, fontWeight: '800', color: '#687386' },
  visibilityOptions: { marginTop: 6, flexDirection: 'row', gap: 6 },
  visibilityButton: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 10 },
  visibilityButtonActive: { borderColor: '#BFD0C3', backgroundColor: '#F3F8F4' },
  visibilityButtonText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  photoActions: { marginTop: 8, flexDirection: 'row', gap: 7 },
  cameraButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, backgroundColor: FioColors.green },
  cameraText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  galleryButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BFD0C3', borderRadius: 11 },
  galleryText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  finalActionCard: { marginTop: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: '#D8DFD9', borderRadius: 14, backgroundColor: '#F4F8F4' },
  finalActionTitle: { fontSize: 13, fontWeight: '900', color: '#202B3D' },
  finalActionDetail: { marginTop: 3, fontSize: 9, lineHeight: 14, color: '#687386' },
  finalActionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: FioColors.green },
  finalActionButtonDisabled: { backgroundColor: '#9DA5A0' },
  finalActionButtonText: { fontSize: 10, fontWeight: '900', color: '#FFFFFF' },
  futureNote: { marginTop: 12, paddingHorizontal: 8, textAlign: 'center', fontSize: 8, lineHeight: 13, color: '#8A91A0' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(17, 25, 43, 0.42)' },
  modalCard: { maxHeight: '90%', padding: 18, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#172033' },
  modalSubtitle: { marginTop: 3, fontSize: 10, color: '#727C8E' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F2F5' },
  fieldLabel: { marginTop: 10, marginBottom: 6, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, color: '#687386' },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: '#DDE1E7', borderRadius: 11, fontSize: 11, color: '#273247' },
  descriptionInput: { minHeight: 82, paddingTop: 11, textAlignVertical: 'top' },
  optionButton: { minHeight: 48, marginBottom: 6, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#DFE2E8', borderRadius: 11 },
  optionButtonActive: { borderColor: '#BFD0C3', backgroundColor: '#F4FAF5' },
  optionText: { flex: 1, fontSize: 10, fontWeight: '800', color: '#34405A' },
  switchRow: { minHeight: 64, marginTop: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, backgroundColor: '#F8F6F1' },
  switchTitle: { fontSize: 11, fontWeight: '900', color: '#273247' },
  switchDetail: { marginTop: 2, fontSize: 8, lineHeight: 13, color: '#737D8E' },
  saveItemButton: { minHeight: 50, marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.green },
  saveItemText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
});
