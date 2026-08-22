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
type AcceptanceStatus = 'pending' | 'accepted' | 'accepted_with_reservations';
type ChecklistStatus = 'open' | 'completed';
type PhotoSource = 'camera' | 'gallery';
type PhotoVisibility = 'internal' | 'shared';

type DeliveryState = {
  notes: string | null;
  status: DeliveryStatus;
  ready_by: string | null;
  ready_at: string | null;
  acceptance_status: AcceptanceStatus;
  acceptance_name: string | null;
  acceptance_role: string | null;
  acceptance_notes: string | null;
  accepted_at: string | null;
};

type ChecklistItem = {
  id: string;
  work_id: string;
  environment_id: string | null;
  default_key: string | null;
  sort_order: number;
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
  delivery_checklist_item_id: string | null;
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
  acceptance_status: 'pending',
  acceptance_name: null,
  acceptance_role: null,
  acceptance_notes: null,
  accepted_at: null,
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
  onOpenPending,
  onReadyForReport,
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
  onOpenPending?: (environmentId: string | null) => void;
  onReadyForReport?: () => void;
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
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
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
  const [observationItemId, setObservationItemId] = useState<string | null>(null);
  const [itemObservation, setItemObservation] = useState('');
  const [savingObservation, setSavingObservation] = useState(false);
  const [acceptanceModalVisible, setAcceptanceModalVisible] = useState(false);
  const [acceptanceName, setAcceptanceName] = useState('');
  const [acceptanceRole, setAcceptanceRole] = useState('');
  const [acceptanceNotes, setAcceptanceNotes] = useState('');
  const [savingAcceptance, setSavingAcceptance] = useState(false);

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

    if (canManage) {
      const { error: defaultsError } = await supabase.rpc(
        'ensure_work_delivery_default_checklist',
        { p_work_id: workId }
      );

      if (defaultsError) {
        setMessage(defaultsError.message);
        setLoading(false);
        return;
      }
    }

    const [stateResult, itemsResult, pendingResult, photosResult] =
      await Promise.all([
        supabase
          .from('work_delivery_states')
          .select('notes, status, ready_by, ready_at, acceptance_status, acceptance_name, acceptance_role, acceptance_notes, accepted_at')
          .eq('work_id', workId)
          .maybeSingle(),
        supabase
          .from('work_delivery_checklist_items')
          .select(`
            id, work_id, environment_id, default_key, sort_order,
            title, description,
            required, responsible_user_id, status,
            completed_by, completed_at, created_at
          `)
          .eq('work_id', workId)
          .eq('active', true)
          .order('sort_order', { ascending: true })
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
          .select('id, environment_id, delivery_checklist_item_id')
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

    const nextState = ({
      ...EMPTY_STATE,
      ...((stateResult.data as Partial<DeliveryState> | null) ?? {}),
    }) as DeliveryState;
    setDeliveryState(nextState);
    setNotes(nextState.notes ?? '');
    setItems((itemsResult.data ?? []) as ChecklistItem[]);
    setBlockingPending((pendingResult.data ?? []) as BlockingPending[]);
    setFinalPhotos((photosResult.data ?? []) as FinalPhoto[]);
    setLoading(false);
  }, [canManage, canWrite, workId]);

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
      setDeliveryState((current) => ({ ...current, notes: notes || null }));
      setSuccessMessage('Orientações da entrega salvas.');
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
    const { data: savedItemId, error } = await supabase.rpc(
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
      const nextId = (savedItemId as string | null) ?? editingItemId;
      const existingItem = items.find((item) => item.id === editingItemId);
      const nextItem: ChecklistItem = {
        id: nextId ?? `local-${Date.now()}`,
        work_id: workId,
        environment_id: itemEnvironmentId,
        default_key: null,
        sort_order: 1000,
        title: itemTitle.trim(),
        description: itemDescription.trim() || null,
        required: itemRequired,
        responsible_user_id: itemResponsibleId,
        status: existingItem?.status ?? 'open',
        completed_by: existingItem?.completed_by ?? null,
        completed_at: existingItem?.completed_at ?? null,
        created_at: existingItem?.created_at ?? new Date().toISOString(),
      };
      setItems((current) =>
        editingItemId
          ? current.map((item) =>
              item.id === editingItemId ? { ...item, ...nextItem, id: item.id } : item
            )
          : [...current, nextItem]
      );
      setFormVisible(false);
      setSuccessMessage(
        editingItemId ? 'Item atualizado.' : 'Item adicionado ao checklist.'
      );
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
    const nextCompleted = item.status !== 'completed';
    const optimisticItem: ChecklistItem = {
      ...item,
      status: nextCompleted ? 'completed' : 'open',
      completed_by: nextCompleted ? userId : null,
      completed_at: nextCompleted ? new Date().toISOString() : null,
    };
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id ? optimisticItem : currentItem
      )
    );
    const { error } = await supabase.rpc(
      'set_work_delivery_item_completed',
      {
        p_item_id: item.id,
        p_completed: nextCompleted,
      }
    );
    if (error) {
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id ? item : currentItem
        )
      );
      setMessage(error.message);
    } else {
      setSuccessMessage(nextCompleted ? 'Item concluído.' : 'Item reaberto.');
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
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      setSuccessMessage('Item removido do checklist.');
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

  function openObservation(item: ChecklistItem) {
    setObservationItemId(item.id);
    setItemObservation(item.description ?? '');
    clearFeedback();
  }

  async function saveObservation() {
    if (!observationItemId || savingObservation) return;
    const item = items.find((currentItem) => currentItem.id === observationItemId);
    if (!item) return;

    const previousObservation = item.description;
    const nextObservation = itemObservation.trim() || null;
    setSavingObservation(true);
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? { ...currentItem, description: nextObservation }
          : currentItem
      )
    );

    const { error } = await supabase.rpc(
      'save_work_delivery_item_observation',
      {
        p_item_id: item.id,
        p_observation: nextObservation,
      }
    );

    if (error) {
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.id === item.id
            ? { ...currentItem, description: previousObservation }
            : currentItem
        )
      );
      setMessage(error.message);
    } else {
      setObservationItemId(null);
      setSuccessMessage('Observação salva.');
    }
    setSavingObservation(false);
  }

  async function uploadAsset(
    asset: ImagePicker.ImagePickerAsset,
    environmentId: string | null,
    source: PhotoSource,
    item?: ChecklistItem
  ) {
    if (!asset.base64) {
      throw new Error('Não foi possível ler a imagem selecionada.');
    }

    if (!userId) {
      throw new Error('Usuário não autenticado.');
    }

    const fileName = makeFileName();
    const storagePath = `${workId}/${environmentId ?? 'general'}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('work-photos')
      .upload(storagePath, decode(asset.base64), {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: insertedPhoto, error: insertError } = await supabase
      .from('work_photos')
      .insert({
        work_id: workId,
        environment_id: environmentId,
        delivery_checklist_item_id: item?.id ?? null,
        collection: 'work',
        photo_type: 'delivery_final',
        storage_path: storagePath,
        file_name: asset.fileName || fileName,
        mime_type: 'image/jpeg',
        size_bytes: asset.fileSize ?? null,
        caption: item?.title ?? 'Foto final de entrega',
        visibility: photoVisibility,
        taken_at: source === 'camera' ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select('id, environment_id, delivery_checklist_item_id')
      .single();

    if (insertError) {
      await supabase.storage.from('work-photos').remove([storagePath]);
      throw insertError;
    }

    return insertedPhoto as FinalPhoto;
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
        const insertedPhoto = await uploadAsset(asset, environmentId, source);
        setFinalPhotos((current) => [...current, insertedPhoto]);
      }
      setSuccessMessage(
        assets.length === 1
          ? 'Foto final adicionada.'
          : `${assets.length} fotos finais adicionadas.`
      );
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

  async function addChecklistPhoto(item: ChecklistItem) {
    if (!canWrite || uploadingItemId || uploadingEnvironmentId) return;
    clearFeedback();

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Câmera não autorizada',
        'Permita o acesso à câmera para registrar a foto deste item.'
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

    setUploadingItemId(item.id);
    try {
      const insertedPhoto = await uploadAsset(
        result.assets[0],
        item.environment_id,
        'camera',
        item
      );
      setFinalPhotos((current) => [...current, insertedPhoto]);
      setSuccessMessage('Foto adicionada ao item.');
      onChanged?.();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível adicionar a foto ao item.'
      );
    } finally {
      setUploadingItemId(null);
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
      setDeliveryState((current) => ({
        ...current,
        status: 'ready',
        ready_by: userId,
        ready_at: new Date().toISOString(),
      }));
      setSuccessMessage('Obra marcada como pronta para entrega.');
      onReadyForReport?.();
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
      setDeliveryState((current) => ({
        ...current,
        status: 'preparing',
        ready_by: null,
        ready_at: null,
        acceptance_status: 'pending',
        acceptance_name: null,
        acceptance_role: null,
        acceptance_notes: null,
        accepted_at: null,
      }));
      setSuccessMessage('Preparação para entrega reaberta.');
    }
    setSaving(false);
  }

  function openAcceptanceForm() {
    setAcceptanceName(deliveryState.acceptance_name ?? '');
    setAcceptanceRole(deliveryState.acceptance_role ?? '');
    setAcceptanceNotes(deliveryState.acceptance_notes ?? '');
    setAcceptanceModalVisible(true);
    clearFeedback();
  }

  async function saveAcceptance(nextStatus: Exclude<AcceptanceStatus, 'pending'>) {
    if (!canManage || savingAcceptance) return;
    if (!acceptanceName.trim()) {
      setMessage('Informe o nome de quem registrou o aceite.');
      return;
    }
    setSavingAcceptance(true);
    clearFeedback();
    const { error } = await supabase.rpc('save_work_delivery_acceptance', {
      p_work_id: workId,
      p_acceptance_status: nextStatus,
      p_acceptance_name: acceptanceName.trim(),
      p_acceptance_role: acceptanceRole.trim() || null,
      p_acceptance_notes: acceptanceNotes.trim() || null,
    });
    if (error) {
      setMessage(error.message);
    } else {
      setDeliveryState((current) => ({
        ...current,
        acceptance_status: nextStatus,
        acceptance_name: acceptanceName.trim(),
        acceptance_role: acceptanceRole.trim() || null,
        acceptance_notes: acceptanceNotes.trim() || null,
        accepted_at: new Date().toISOString(),
      }));
      setAcceptanceModalVisible(false);
      setSuccessMessage(
        nextStatus === 'accepted'
          ? 'Aceite da obra registrado.'
          : 'Aceite com ressalvas registrado.'
      );
      onChanged?.();
    }
    setSavingAcceptance(false);
  }

  async function reopenAcceptance() {
    if (!canManage || savingAcceptance) return;
    setSavingAcceptance(true);
    clearFeedback();
    const { error } = await supabase.rpc('save_work_delivery_acceptance', {
      p_work_id: workId,
      p_acceptance_status: 'pending',
      p_acceptance_name: null,
      p_acceptance_role: null,
      p_acceptance_notes: null,
    });
    if (error) {
      setMessage(error.message);
    } else {
      setDeliveryState((current) => ({
        ...current,
        acceptance_status: 'pending',
        acceptance_name: null,
        acceptance_role: null,
        acceptance_notes: null,
        accepted_at: null,
      }));
      setSuccessMessage('Aceite reaberto para revisão.');
      onChanged?.();
    }
    setSavingAcceptance(false);
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
            const itemPhotoCount = finalPhotos.filter(
              (photo) => photo.delivery_checklist_item_id === item.id
            ).length;
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
                  <Ionicons
                    name={completed ? 'checkmark-outline' : 'ellipse-outline'}
                    size={21}
                    color={completed ? '#FFFFFF' : FioColors.green}
                  />
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

                {canWrite && (
                  <View style={styles.itemActions}>
                    <Pressable
                      accessibilityLabel={`Adicionar foto a ${item.title}`}
                      style={styles.iconAction}
                      onPress={() => void addChecklistPhoto(item)}
                      disabled={uploadingItemId !== null || uploadingEnvironmentId !== null}
                    >
                      {uploadingItemId === item.id ? (
                        <ActivityIndicator size="small" color={FioColors.green} />
                      ) : (
                        <Ionicons name="camera-outline" size={18} color={FioColors.green} />
                      )}
                      {itemPhotoCount > 0 && (
                        <Text style={styles.iconActionCount}>{itemPhotoCount}</Text>
                      )}
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`Escrever observação em ${item.title}`}
                      style={styles.iconAction}
                      onPress={() => openObservation(item)}
                    >
                      <Ionicons
                        name={item.description ? 'document-text' : 'document-text-outline'}
                        size={18}
                        color={item.description ? FioColors.orange : FioColors.green}
                      />
                    </Pressable>
                    {canManage && !item.default_key && (
                      <>
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
                      </>
                    )}
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
            <Pressable
              accessibilityRole={generalPendingCount > 0 ? 'button' : undefined}
              accessibilityLabel={
                generalPendingCount > 0
                  ? 'Abrir pendências bloqueadoras gerais'
                  : undefined
              }
              style={styles.blockerNotice}
              onPress={
                generalPendingCount > 0
                  ? () => onOpenPending?.(null)
                  : undefined
              }
            >
              <Ionicons name="alert-circle-outline" size={19} color="#B54708" />
              <Text style={styles.blockerNoticeText}>
                {plural(
                  generalPendingCount + generalChecklistCount,
                  'bloqueio geral precisa ser resolvido.',
                  'bloqueios gerais precisam ser resolvidos.'
                )}
              </Text>
              {generalPendingCount > 0 && (
                <Ionicons name="chevron-forward-outline" size={17} color={FioColors.orange} />
              )}
            </Pressable>
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
                  color={FioColors.text}
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
                    <Pressable
                      accessibilityRole={summary.pending > 0 ? 'button' : undefined}
                      accessibilityLabel={
                        summary.pending > 0
                          ? `Abrir pendências bloqueadoras de ${environment.name}`
                          : undefined
                      }
                      style={styles.blockerNotice}
                      onPress={
                        summary.pending > 0
                          ? () => onOpenPending?.(environment.id)
                          : undefined
                      }
                    >
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
                      {summary.pending > 0 && (
                        <Ionicons name="chevron-forward-outline" size={17} color={FioColors.orange} />
                      )}
                    </Pressable>
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

      {ready && !environmentFilterId && (
        <View
          style={[
            styles.acceptanceCard,
            deliveryState.acceptance_status === 'accepted' && styles.acceptanceCardAccepted,
            deliveryState.acceptance_status === 'accepted_with_reservations' && styles.acceptanceCardReserved,
          ]}
        >
          <View style={styles.acceptanceIcon}>
            <Ionicons
              name={deliveryState.acceptance_status === 'pending' ? 'create-outline' : 'checkmark-circle-outline'}
              size={22}
              color={deliveryState.acceptance_status === 'accepted_with_reservations' ? FioColors.orange : FioColors.green}
            />
          </View>
          <View style={styles.headingIdentity}>
            <Text style={styles.finalActionTitle}>
              {deliveryState.acceptance_status === 'pending'
                ? 'Encerramento da obra'
                : deliveryState.acceptance_status === 'accepted'
                ? 'Aceite registrado'
                : 'Aceite registrado com ressalvas'}
            </Text>
            <Text style={styles.finalActionDetail}>
              {deliveryState.acceptance_status === 'pending'
                ? 'Registre o responsável e deixe o relatório pronto para assinatura digital.'
                : `${deliveryState.acceptance_name ?? 'Responsável'} · ${formatDate(deliveryState.accepted_at)}`}
            </Text>
            {!!deliveryState.acceptance_notes && deliveryState.acceptance_status !== 'pending' && (
              <Text style={styles.acceptanceNotes}>{deliveryState.acceptance_notes}</Text>
            )}
          </View>
          {canManage && (
            <Pressable
              style={styles.acceptanceButton}
              onPress={() =>
                deliveryState.acceptance_status === 'pending'
                  ? openAcceptanceForm()
                  : void reopenAcceptance()
              }
              disabled={savingAcceptance}
            >
              {savingAcceptance ? (
                <ActivityIndicator color={FioColors.textOnAccent} />
              ) : (
                <Ionicons
                  name={deliveryState.acceptance_status === 'pending' ? 'create-outline' : 'refresh-outline'}
                  size={18}
                  color={FioColors.textOnAccent}
                />
              )}
              <Text style={styles.acceptanceButtonText}>
                {deliveryState.acceptance_status === 'pending' ? 'Registrar aceite' : 'Reabrir aceite'}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={styles.futureNote}>
        O PDF emitido permanece imutável. Uma nova emissão cria outra versão com os dados atualizados.
      </Text>

      <Modal
        visible={acceptanceModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAcceptanceModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.observationModalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headingIdentity}>
                <Text style={styles.modalTitle}>Registrar aceite</Text>
                <Text style={styles.modalSubtitle}>
                  Esta informação ficará no histórico da obra e prepara o relatório para assinatura digital.
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={() => setAcceptanceModalVisible(false)}>
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
              </Pressable>
            </View>
            <Text style={styles.fieldLabel}>NOME DO RESPONSÁVEL *</Text>
            <TextInput
              style={styles.input}
              value={acceptanceName}
              onChangeText={setAcceptanceName}
              placeholder="Nome de quem confirmou"
              placeholderTextColor="#9299A6"
              editable={!savingAcceptance}
            />
            <Text style={styles.fieldLabel}>FUNÇÃO</Text>
            <TextInput
              style={styles.input}
              value={acceptanceRole}
              onChangeText={setAcceptanceRole}
              placeholder="Ex.: Proprietário, gerente ou cliente"
              placeholderTextColor="#9299A6"
              editable={!savingAcceptance}
            />
            <Text style={styles.fieldLabel}>OBSERVAÇÕES OU RESSALVAS</Text>
            <TextInput
              style={[styles.input, styles.observationInput]}
              value={acceptanceNotes}
              onChangeText={setAcceptanceNotes}
              placeholder="Descreva o que ficou registrado"
              placeholderTextColor="#9299A6"
              multiline
              editable={!savingAcceptance}
            />
            <View style={styles.acceptanceModalActions}>
              <Pressable
                style={styles.acceptanceModalButton}
                onPress={() => void saveAcceptance('accepted_with_reservations')}
                disabled={savingAcceptance}
              >
                <Ionicons name="alert-circle-outline" size={18} color={FioColors.orange} />
                <Text style={styles.acceptanceModalReservedText}>Aceite com ressalvas</Text>
              </Pressable>
              <Pressable
                style={[styles.acceptanceModalButton, styles.acceptanceModalConfirm]}
                onPress={() => void saveAcceptance('accepted')}
                disabled={savingAcceptance}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={FioColors.textOnAccent} />
                <Text style={styles.acceptanceModalConfirmText}>Confirmar aceite</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={observationItemId !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setObservationItemId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.observationModalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.headingIdentity}>
                <Text style={styles.modalTitle}>Observação do item</Text>
                <Text style={styles.modalSubtitle}>
                  {items.find((item) => item.id === observationItemId)?.title ?? ''}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                onPress={() => setObservationItemId(null)}
              >
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
              style={[styles.input, styles.observationInput]}
              value={itemObservation}
              onChangeText={setItemObservation}
              placeholder="Escreva uma observação sobre este item"
              placeholderTextColor="#9299A6"
              multiline
            />
            <Pressable
              style={styles.saveItemButton}
              onPress={() => void saveObservation()}
              disabled={savingObservation}
            >
              <Text style={styles.saveItemText}>
                {savingObservation ? 'Salvando...' : 'Salvar observação'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
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
  muted: { fontSize: 11, color: FioColors.textMuted },
  readOnlyCard: { minHeight: 80, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  readOnlyText: { flex: 1, fontSize: 11, lineHeight: 17, color: FioColors.textMuted },
  statusCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: FioColors.lineStrong, borderRadius: 14, backgroundColor: FioColors.surface },
  statusCardReady: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  statusIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: FioColors.greenSoft },
  statusIconReady: { backgroundColor: FioColors.green },
  statusIdentity: { flex: 1, minWidth: 0 },
  statusEyebrow: { fontSize: 8, fontWeight: '900', letterSpacing: 0.8, color: FioColors.gold },
  statusTitle: { marginTop: 3, fontSize: 16, fontWeight: '900', color: FioColors.text },
  statusDetail: { marginTop: 3, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  summaryRow: { marginTop: 9, flexDirection: 'row', gap: 7 },
  summaryCard: { flex: 1, minWidth: 0, padding: 10, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  summaryNumber: { fontSize: 18, fontWeight: '900', color: FioColors.green },
  summaryLabel: { marginTop: 2, fontSize: 8, color: FioColors.textMuted },
  errorCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 11, lineHeight: 16, color: FioColors.danger },
  successCard: { marginTop: 10, padding: 12, borderRadius: 11, backgroundColor: FioColors.successSoft },
  successText: { fontSize: 11, color: FioColors.success },
  generalCard: { marginTop: 11, padding: 12, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 14, backgroundColor: FioColors.surface },
  blockHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headingIdentity: { flex: 1, minWidth: 0 },
  blockTitle: { fontSize: 13, fontWeight: '900', color: FioColors.text },
  blockSubtitle: { marginTop: 2, fontSize: 9, lineHeight: 14, color: FioColors.textMuted },
  notesInput: { minHeight: 88, marginTop: 10, padding: 11, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11, backgroundColor: FioColors.surfaceRaised, textAlignVertical: 'top', fontSize: 11, lineHeight: 17, color: FioColors.text },
  inputDisabled: { backgroundColor: FioColors.surfaceMuted, color: FioColors.textMuted },
  saveNotesButton: { minHeight: 44, marginTop: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  saveNotesText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  blockerNotice: { marginTop: 9, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: '#4B3B25' },
  blockerNoticeText: { flex: 1, fontSize: 9, lineHeight: 14, color: FioColors.orange },
  checklistBlock: { marginTop: 12 },
  smallAddButton: { minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 10, backgroundColor: FioColors.green },
  smallAddText: { fontSize: 9, fontWeight: '900', color: FioColors.textOnAccent },
  emptyText: { marginTop: 9, padding: 12, textAlign: 'center', fontSize: 10, color: FioColors.textMuted },
  itemCard: { minHeight: 70, marginTop: 8, padding: 9, flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderWidth: 1, borderColor: FioColors.line, borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  checkButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.greenSoft },
  checkButtonCompleted: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  disabled: { opacity: 0.45 },
  itemIdentity: { flex: 1, minWidth: 0 },
  itemTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  itemTitle: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: FioColors.text },
  itemTitleCompleted: { textDecorationLine: 'line-through', color: FioColors.textSoft },
  requirementTag: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 999, backgroundColor: '#4B3B25' },
  optionalTag: { backgroundColor: FioColors.surfaceMuted },
  requirementText: { fontSize: 7, fontWeight: '900', color: FioColors.orange },
  optionalText: { color: FioColors.textMuted },
  itemDescription: { marginTop: 4, fontSize: 9, lineHeight: 14, color: FioColors.textMuted },
  itemMeta: { marginTop: 5, fontSize: 8, color: FioColors.textSoft },
  itemCompletedAt: { marginTop: 2, fontSize: 7, color: FioColors.success },
  itemActions: { width: 68, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  iconAction: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FioColors.surface },
  iconActionCount: { position: 'absolute', top: 1, right: 3, fontSize: 7, fontWeight: '900', color: FioColors.orange },
  environmentsHeading: { marginTop: 16, paddingHorizontal: 2 },
  emptyEnvironmentText: { marginTop: 9, padding: 14, textAlign: 'center', fontSize: 10, color: FioColors.textMuted },
  environmentCard: { marginTop: 9, overflow: 'hidden', borderWidth: 2, borderColor: FioColors.lineStrong, borderRadius: 13, backgroundColor: FioColors.surface },
  environmentHeader: { minHeight: 68, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  environmentStatusIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#4B3B25' },
  environmentStatusIconReady: { backgroundColor: FioColors.green },
  environmentIdentity: { flex: 1, minWidth: 0 },
  environmentName: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  environmentMeta: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  environmentBody: { padding: 11, paddingTop: 4, borderTopWidth: 1, borderTopColor: FioColors.line },
  photoRequirementCard: { padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  photoRequirementTitle: { fontSize: 11, fontWeight: '900', color: FioColors.text },
  photoRequirementDetail: { marginTop: 2, fontSize: 8, color: FioColors.textMuted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  stepperValue: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '900', color: FioColors.green },
  minimumReadOnly: { minWidth: 42, textAlign: 'center', fontSize: 18, fontWeight: '900', color: FioColors.green },
  visibilityRow: { marginTop: 10 },
  visibilityLabel: { fontSize: 8, fontWeight: '800', color: FioColors.textMuted },
  visibilityOptions: { marginTop: 6, flexDirection: 'row', gap: 6 },
  visibilityButton: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10 },
  visibilityButtonActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  visibilityButtonText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  photoActions: { marginTop: 8, flexDirection: 'row', gap: 7 },
  cameraButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 11, backgroundColor: FioColors.green },
  cameraText: { fontSize: 10, fontWeight: '900', color: FioColors.textOnAccent },
  galleryButton: { minHeight: 47, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 },
  galleryText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  finalActionCard: { marginTop: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 14, backgroundColor: FioColors.surfaceRaised },
  finalActionTitle: { fontSize: 13, fontWeight: '900', color: FioColors.text },
  finalActionDetail: { marginTop: 3, fontSize: 9, lineHeight: 14, color: FioColors.textMuted },
  finalActionButton: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: FioColors.green },
  finalActionButtonDisabled: { backgroundColor: '#9DA5A0' },
  finalActionButtonText: { fontSize: 10, fontWeight: '900', color: FioColors.textOnAccent },
  acceptanceCard: { marginTop: 10, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.gold, borderRadius: 14, backgroundColor: FioColors.goldSoft },
  acceptanceCardAccepted: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  acceptanceCardReserved: { borderColor: FioColors.orange, backgroundColor: FioColors.orangeSoft },
  acceptanceIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  acceptanceNotes: { marginTop: 5, fontSize: 9, lineHeight: 13, color: FioColors.textMuted },
  acceptanceButton: { minHeight: 43, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, backgroundColor: FioColors.green },
  acceptanceButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.textOnAccent },
  acceptanceModalActions: { marginTop: 7, flexDirection: 'row', gap: 7 },
  acceptanceModalButton: { minHeight: 50, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.orange, borderRadius: 11, backgroundColor: FioColors.orangeSoft },
  acceptanceModalReservedText: { fontSize: 9, fontWeight: '900', color: FioColors.orange },
  acceptanceModalConfirm: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  acceptanceModalConfirmText: { fontSize: 9, fontWeight: '900', color: FioColors.textOnAccent },
  futureNote: { marginTop: 12, paddingHorizontal: 8, textAlign: 'center', fontSize: 8, lineHeight: 13, color: FioColors.textSoft },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 15, 12, 0.68)' },
  modalCard: { maxHeight: '90%', padding: 18, paddingBottom: 28, borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  observationModalCard: { padding: 18, paddingBottom: 28, borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  modalHeader: { marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: FioColors.text },
  modalSubtitle: { marginTop: 3, fontSize: 10, color: FioColors.textMuted },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.surfaceRaised },
  fieldLabel: { marginTop: 10, marginBottom: 6, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, color: FioColors.textMuted },
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11, fontSize: 11, color: FioColors.text, backgroundColor: FioColors.surfaceRaised },
  descriptionInput: { minHeight: 82, paddingTop: 11, textAlignVertical: 'top' },
  observationInput: { minHeight: 110, paddingTop: 11, textAlignVertical: 'top' },
  optionButton: { minHeight: 48, marginBottom: 6, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 },
  optionButtonActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  optionText: { flex: 1, fontSize: 10, fontWeight: '800', color: FioColors.text },
  switchRow: { minHeight: 64, marginTop: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 11, backgroundColor: FioColors.surfaceRaised },
  switchTitle: { fontSize: 11, fontWeight: '900', color: FioColors.text },
  switchDetail: { marginTop: 2, fontSize: 8, lineHeight: 13, color: FioColors.textMuted },
  saveItemButton: { minHeight: 50, marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.green },
  saveItemText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
});
