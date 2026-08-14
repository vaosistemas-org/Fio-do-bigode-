import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
// @ts-ignore installed with the Expo SDK 54 dependencies declared in package.json
import * as DocumentPicker from 'expo-document-picker';
// @ts-ignore installed with the Expo SDK 54 dependencies declared in package.json
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
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

import { WorkEnvironment } from '@/components/work-central/types';
import { supabase } from '@/lib/supabase';

type DocumentVisibility =
  | 'fio_general'
  | 'professionals'
  | 'company_internal';

type DocumentCategory =
  | 'architectural_project'
  | 'hydraulic_plan'
  | 'electrical_plan'
  | 'joinery_project'
  | 'measurement'
  | 'contract_proposal'
  | 'report'
  | 'manual'
  | 'receipt'
  | 'other';

type PanelFilter = DocumentVisibility | 'referenced';

type WorkDocument = {
  id: string;
  environment_id: string | null;
  environment_name: string | null;
  owner_company_id: string | null;
  owner_company_name: string | null;
  title: string;
  description: string | null;
  category: DocumentCategory;
  visibility: DocumentVisibility;
  allow_download: boolean;
  current_version: number;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  version_created_at: string | null;
  updated_at: string;
  can_manage: boolean;
  is_referenced: boolean;
  reference_note: string | null;
};

type ActiveCompany = {
  company_id: string;
  company_name: string;
};

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  base64?: string | null;
};

const CATEGORY_OPTIONS: Array<{
  value: DocumentCategory;
  label: string;
}> = [
  { value: 'architectural_project', label: 'Projeto arquitetônico' },
  { value: 'hydraulic_plan', label: 'Planta hidráulica' },
  { value: 'electrical_plan', label: 'Planta elétrica' },
  { value: 'joinery_project', label: 'Projeto de marcenaria' },
  { value: 'measurement', label: 'Medição' },
  { value: 'contract_proposal', label: 'Contrato / proposta' },
  { value: 'report', label: 'Relatório' },
  { value: 'manual', label: 'Manual' },
  { value: 'receipt', label: 'Comprovante' },
  { value: 'other', label: 'Outro' },
];

const VISIBILITY_OPTIONS: Array<{
  value: DocumentVisibility;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    value: 'fio_general',
    label: 'Todos da obra',
    detail: 'Participantes e leitura autorizada pelo link/QR do FIO geral.',
    icon: 'people-outline',
  },
  {
    value: 'professionals',
    label: 'Profissionais da obra',
    detail: 'Empresas e profissionais participantes; não aparece no link externo.',
    icon: 'briefcase-outline',
  },
  {
    value: 'company_internal',
    label: 'Somente minha empresa',
    detail: 'Disponível apenas para integrantes da empresa proprietária.',
    icon: 'lock-closed-outline',
  },
];

function categoryLabel(value: DocumentCategory) {
  return CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? 'Outro';
}

function visibilityLabel(value: DocumentVisibility) {
  return VISIBILITY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function formatSize(bytes: number | null) {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cleanFileName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-110);
}

function titleFromFileName(value: string) {
  return value.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
}

export function WorkDocumentsPanel({
  workId,
  environments,
  canWrite,
  newRequest = 0,
  onCountChange,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  canWrite: boolean;
  newRequest?: number;
  onCountChange?: (count: number) => void;
  onChanged?: () => void;
}) {
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(null);
  const [filter, setFilter] = useState<PanelFilter>('fio_general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<WorkDocument | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [visibility, setVisibility] =
    useState<DocumentVisibility>('fio_general');
  const [environmentId, setEnvironmentId] = useState<string | null>(null);
  const [allowDownload, setAllowDownload] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [modalMessage, setModalMessage] = useState('');
  const [uploadLabel, setUploadLabel] = useState('');
  const [referenceDocument, setReferenceDocument] =
    useState<WorkDocument | null>(null);
  const [referenceNote, setReferenceNote] = useState('');
  const [referenceSaving, setReferenceSaving] = useState(false);

  async function loadDocuments() {
    setLoading(true);
    setMessage('');
    const [documentResult, companyResult] = await Promise.all([
      supabase.rpc('get_work_documents', { p_work_id: workId }),
      supabase.rpc('get_active_company_context'),
    ]);

    if (documentResult.error) {
      setDocuments([]);
      setMessage(documentResult.error.message);
    } else {
      const next = (documentResult.data ?? []) as WorkDocument[];
      setDocuments(next);
      onCountChange?.(next.length);
    }

    if (!companyResult.error) {
      const company = (companyResult.data?.[0] ?? null) as ActiveCompany | null;
      setActiveCompany(company);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDocuments();
  }, [workId]);

  useEffect(() => {
    if (newRequest > 0 && canWrite) openCreate();
  }, [newRequest, canWrite]);

  const visibleDocuments = useMemo(() => {
    if (filter === 'referenced') {
      return documents.filter((document) => document.is_referenced);
    }
    return documents.filter((document) => document.visibility === filter);
  }, [documents, filter]);

  function resetForm() {
    setEditing(null);
    setTitle('');
    setDescription('');
    setCategory('other');
    setVisibility('fio_general');
    setEnvironmentId(null);
    setAllowDownload(false);
    setSelectedFile(null);
    setModalMessage('');
    setUploadLabel('');
  }

  function openCreate() {
    resetForm();
    setMessage('');
    setSuccessMessage('');
    setFormVisible(true);
  }

  function openEdit(document: WorkDocument) {
    setEditing(document);
    setTitle(document.title);
    setDescription(document.description ?? '');
    setCategory(document.category);
    setVisibility(document.visibility);
    setEnvironmentId(document.environment_id);
    setAllowDownload(document.allow_download);
    setSelectedFile(null);
    setModalMessage('');
    setUploadLabel('');
    setFormVisible(true);
  }

  function closeForm() {
    if (saving) return;
    setFormVisible(false);
    resetForm();
  }

  async function chooseDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: '*/*',
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name || `documento-${Date.now()}`,
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? null,
    };
    setSelectedFile(file);
    if (!title.trim()) setTitle(titleFromFileName(file.name));
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Câmera não autorizada',
        'Permita o acesso à câmera para fotografar o documento.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const name = asset.fileName || `documento-foto-${Date.now()}.jpg`;
    setSelectedFile({
      uri: asset.uri,
      name,
      mimeType: asset.mimeType ?? 'image/jpeg',
      size: asset.fileSize ?? null,
      base64: asset.base64,
    });
    if (!title.trim()) setTitle('Documento fotografado');
  }

  async function uploadVersion(documentId: string, file: PickedFile) {
    const storagePath = `${workId}/${documentId}/${Date.now()}-${cleanFileName(file.name)}`;
    let body: Uint8Array | ArrayBuffer;
    if (file.base64) {
      body = decode(file.base64);
    } else {
      const localFile = new ExpoFile(file.uri);
      const bytes = await localFile.bytes();
      body = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer;
    }

    const { error: uploadError } = await supabase.storage
      .from('work-documents')
      .upload(storagePath, body, {
        contentType: file.mimeType ?? 'application/octet-stream',
        cacheControl: '3600',
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { error: versionError } = await supabase.rpc(
      'add_work_document_version',
      {
        p_document_id: documentId,
        p_storage_path: storagePath,
        p_file_name: file.name,
        p_mime_type: file.mimeType,
        p_size_bytes: file.size,
      }
    );
    if (versionError) {
      await supabase.storage.from('work-documents').remove([storagePath]);
      throw versionError;
    }
  }

  async function saveDocument() {
    if (!canWrite || saving) return;
    if (!title.trim()) {
      setModalMessage('Informe o título do documento.');
      return;
    }
    if (!editing && !selectedFile) {
      setModalMessage('Escolha um arquivo ou fotografe o documento.');
      return;
    }
    if (visibility === 'company_internal' && !activeCompany) {
      setModalMessage('Selecione uma empresa ativa no seu perfil.');
      return;
    }

    setSaving(true);
    setModalMessage('');
    let createdDocumentId: string | null = null;

    try {
      if (editing) {
        const { error } = await supabase.rpc('update_work_document', {
          p_document_id: editing.id,
          p_environment_id: environmentId,
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_category: category,
          p_visibility: visibility,
          p_allow_download: allowDownload,
        });
        if (error) throw error;
        if (selectedFile) {
          setUploadLabel('Enviando nova versão...');
          await uploadVersion(editing.id, selectedFile);
        }
      } else {
        const { data, error } = await supabase.rpc('create_work_document', {
          p_work_id: workId,
          p_environment_id: environmentId,
          p_owner_company_id: activeCompany?.company_id ?? null,
          p_title: title.trim(),
          p_description: description.trim() || null,
          p_category: category,
          p_visibility: visibility,
          p_allow_download: allowDownload,
        });
        if (error) throw error;
        createdDocumentId = data as string;
        setUploadLabel('Enviando arquivo...');
        await uploadVersion(createdDocumentId, selectedFile!);
      }

      setFormVisible(false);
      resetForm();
      await loadDocuments();
      setFilter(visibility);
      setSuccessMessage(
        editing ? 'Documento atualizado.' : 'Documento adicionado à obra.'
      );
      onChanged?.();
    } catch (error) {
      if (createdDocumentId) {
        await supabase.rpc('archive_work_document', {
          p_document_id: createdDocumentId,
        });
      }
      setModalMessage(
        error instanceof Error ? error.message : 'Não foi possível salvar o documento.'
      );
    } finally {
      setSaving(false);
      setUploadLabel('');
    }
  }

  async function openDocument(document: WorkDocument) {
    if (!document.storage_path) {
      Alert.alert('Arquivo indisponível', 'Este documento ainda não possui uma versão.');
      return;
    }
    const { data, error } = await supabase.storage
      .from('work-documents')
      .createSignedUrl(document.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      Alert.alert('Não foi possível abrir', error?.message ?? 'Tente novamente.');
      return;
    }
    await Linking.openURL(data.signedUrl);
  }

  async function toggleReference(document: WorkDocument) {
    if (!activeCompany) {
      Alert.alert(
        'Empresa não selecionada',
        'Escolha sua empresa ativa no perfil antes de criar uma referência.'
      );
      return;
    }
    if (!document.is_referenced) {
      setReferenceDocument(document);
      setReferenceNote('');
      return;
    }
    const { error } = await supabase.rpc('remove_work_document_reference', {
      p_document_id: document.id,
      p_company_id: activeCompany.company_id,
    });
    if (error) {
      Alert.alert('Não foi possível atualizar a referência', error.message);
      return;
    }
    await loadDocuments();
    setSuccessMessage(
      'Referência removida. O documento original foi mantido.'
    );
  }

  async function saveReference() {
    if (!referenceDocument || !activeCompany || referenceSaving) return;
    setReferenceSaving(true);
    const { error } = await supabase.rpc('reference_work_document', {
      p_document_id: referenceDocument.id,
      p_company_id: activeCompany.company_id,
      p_note: referenceNote.trim() || null,
    });
    if (error) {
      Alert.alert('Não foi possível referenciar', error.message);
    } else {
      setReferenceDocument(null);
      setReferenceNote('');
      await loadDocuments();
      setSuccessMessage(`Documento referenciado para ${activeCompany.company_name}.`);
    }
    setReferenceSaving(false);
  }

  function confirmArchive(document: WorkDocument) {
    Alert.alert(
      'Arquivar documento?',
      'Ele deixará de aparecer na obra. O histórico do FIO será preservado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Arquivar',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase.rpc('archive_work_document', {
              p_document_id: document.id,
            });
            if (error) {
              Alert.alert('Não foi possível arquivar', error.message);
              return;
            }
            await loadDocuments();
            setSuccessMessage('Documento arquivado.');
            onChanged?.();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#4937D8" />
        <Text style={styles.muted}>Carregando documentos...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryTextWrap}>
          <Text style={styles.summaryTitle}>{documents.length} documentos</Text>
          <Text style={styles.summarySubtitle}>
            Arquivo único, versões preservadas e acesso controlado.
          </Text>
        </View>
        {canWrite && (
          <Pressable style={styles.addButton} onPress={openCreate}>
            <Ionicons name="add-outline" size={19} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Adicionar</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {([
          ['fio_general', 'Todos da obra'],
          ['professionals', 'Profissionais'],
          ['company_internal', 'Minha empresa'],
          ['referenced', 'Referenciados'],
        ] as Array<[PanelFilter, string]>).map(([key, label]) => {
          const count =
            key === 'referenced'
              ? documents.filter((document) => document.is_referenced).length
              : documents.filter((document) => document.visibility === key).length;
          return (
            <Pressable
              key={key}
              style={[styles.filterChip, filter === key && styles.filterChipActive]}
              onPress={() => setFilter(key)}
            >
              <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
                {label} {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {!!successMessage && (
        <View style={styles.successCard}>
          <Ionicons name="checkmark-circle-outline" size={18} color="#207A50" />
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      )}
      {!!message && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{message}</Text>
        </View>
      )}

      {visibleDocuments.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={24} color="#8077C9" />
          <Text style={styles.emptyTitle}>Nenhum documento neste filtro</Text>
          <Text style={styles.emptyText}>
            {canWrite
              ? 'Adicione uma planta, projeto, contrato ou registro da obra.'
              : 'Os documentos liberados para seu acesso aparecerão aqui.'}
          </Text>
        </View>
      ) : (
        visibleDocuments.map((document) => (
          <View key={document.id} style={styles.documentCard}>
            <View style={styles.documentIcon}>
              <Ionicons name="document-text-outline" size={21} color="#4937D8" />
            </View>
            <View style={styles.documentIdentity}>
              <Text style={styles.documentTitle}>{document.title}</Text>
              <Text style={styles.documentMeta}>
                {categoryLabel(document.category)} · {document.environment_name || 'Geral da obra'}
              </Text>
              <View style={styles.tagRow}>
                <View style={styles.visibilityTag}>
                  <Text style={styles.visibilityTagText}>
                    {visibilityLabel(document.visibility)}
                  </Text>
                </View>
                {document.current_version > 0 && (
                  <Text style={styles.versionText}>v{document.current_version}</Text>
                )}
                {!!document.size_bytes && (
                  <Text style={styles.versionText}>{formatSize(document.size_bytes)}</Text>
                )}
                {document.is_referenced && (
                  <Ionicons name="bookmark" size={13} color="#4937D8" />
                )}
              </View>
              {!!document.description && (
                <Text numberOfLines={2} style={styles.documentDescription}>
                  {document.description}
                </Text>
              )}
              {!!document.reference_note && (
                <View style={styles.referenceNote}>
                  <Ionicons name="bookmark-outline" size={13} color="#4937D8" />
                  <Text style={styles.referenceNoteText}>{document.reference_note}</Text>
                </View>
              )}
              <View style={styles.actionRow}>
                <Pressable style={styles.smallAction} onPress={() => openDocument(document)}>
                  <Ionicons name="eye-outline" size={16} color="#4937D8" />
                  <Text style={styles.smallActionText}>Visualizar</Text>
                </Pressable>
                {canWrite && document.visibility !== 'company_internal' && (
                  <Pressable style={styles.smallAction} onPress={() => toggleReference(document)}>
                    <Ionicons
                      name={document.is_referenced ? 'bookmark' : 'bookmark-outline'}
                      size={16}
                      color="#4937D8"
                    />
                    <Text style={styles.smallActionText}>
                      {document.is_referenced ? 'Referenciado' : 'Referenciar'}
                    </Text>
                  </Pressable>
                )}
                {document.can_manage && (
                  <Pressable style={styles.iconAction} onPress={() => openEdit(document)}>
                    <Ionicons name="create-outline" size={18} color="#596274" />
                  </Pressable>
                )}
                {document.can_manage && (
                  <Pressable style={styles.iconAction} onPress={() => confirmArchive(document)}>
                    <Ionicons name="archive-outline" size={18} color="#A34242" />
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ))
      )}

      <Modal visible={formVisible} transparent animationType="slide" onRequestClose={closeForm}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>
                  {editing ? 'Editar documento' : 'Novo documento'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editing
                    ? 'Atualize os dados ou envie uma nova versão.'
                    : 'Escolha um arquivo ou fotografe agora.'}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeForm}>
                <Ionicons name="close-outline" size={24} color="#34405A" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formBody}>
              <View style={styles.fileActions}>
                <Pressable style={styles.fileButton} onPress={chooseDocument}>
                  <Ionicons name="attach-outline" size={21} color="#4937D8" />
                  <Text style={styles.fileButtonText}>Escolher arquivo</Text>
                </Pressable>
                <Pressable style={styles.fileButton} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={21} color="#4937D8" />
                  <Text style={styles.fileButtonText}>Foto rápida</Text>
                </Pressable>
              </View>
              {!!selectedFile && (
                <View style={styles.selectedFile}>
                  <Ionicons name="checkmark-circle" size={19} color="#207A50" />
                  <View style={styles.selectedFileIdentity}>
                    <Text numberOfLines={1} style={styles.selectedFileName}>
                      {selectedFile.name}
                    </Text>
                    <Text style={styles.selectedFileSize}>{formatSize(selectedFile.size)}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedFile(null)}>
                    <Ionicons name="close-circle-outline" size={21} color="#7A8394" />
                  </Pressable>
                </View>
              )}

              <Text style={styles.label}>Título *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Ex.: Planta hidráulica atualizada"
                placeholderTextColor="#A1A8B4"
                style={styles.input}
              />
              <Text style={styles.label}>Descrição</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Contexto ou observações"
                placeholderTextColor="#A1A8B4"
                multiline
                style={[styles.input, styles.textArea]}
              />

              <Text style={styles.label}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                {CATEGORY_OPTIONS.map((option) => (
                  <Pressable
                    key={option.value}
                    style={[styles.choiceChip, category === option.value && styles.choiceChipActive]}
                    onPress={() => setCategory(option.value)}
                  >
                    <Text style={[styles.choiceText, category === option.value && styles.choiceTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Onde se aplica?</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
                <Pressable
                  style={[styles.choiceChip, environmentId === null && styles.choiceChipActive]}
                  onPress={() => setEnvironmentId(null)}
                >
                  <Text style={[styles.choiceText, environmentId === null && styles.choiceTextActive]}>
                    Geral da obra
                  </Text>
                </Pressable>
                {environments.map((environment) => (
                  <Pressable
                    key={environment.id}
                    style={[styles.choiceChip, environmentId === environment.id && styles.choiceChipActive]}
                    onPress={() => setEnvironmentId(environment.id)}
                  >
                    <Text style={[styles.choiceText, environmentId === environment.id && styles.choiceTextActive]}>
                      {environment.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.label}>Quem pode visualizar?</Text>
              {VISIBILITY_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  disabled={option.value === 'company_internal' && !activeCompany}
                  style={[
                    styles.permissionOption,
                    visibility === option.value && styles.permissionOptionActive,
                    option.value === 'company_internal' && !activeCompany && styles.disabled,
                  ]}
                  onPress={() => setVisibility(option.value)}
                >
                  <View style={styles.permissionIcon}>
                    <Ionicons name={option.icon} size={20} color="#4937D8" />
                  </View>
                  <View style={styles.permissionIdentity}>
                    <Text style={styles.permissionTitle}>{option.label}</Text>
                    <Text style={styles.permissionDetail}>
                      {option.value === 'company_internal' && activeCompany
                        ? `${option.detail} ${activeCompany.company_name}.`
                        : option.detail}
                    </Text>
                  </View>
                  <Ionicons
                    name={visibility === option.value ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={visibility === option.value ? '#4937D8' : '#A5ACB8'}
                  />
                </Pressable>
              ))}

              {visibility === 'fio_general' && (
                <View style={styles.switchRow}>
                  <View style={styles.switchIdentity}>
                    <Text style={styles.switchTitle}>Permitir download no link externo</Text>
                    <Text style={styles.switchDetail}>
                      Desligado mantém a visualização sem botão de baixar.
                    </Text>
                  </View>
                  <Switch
                    value={allowDownload}
                    onValueChange={setAllowDownload}
                    trackColor={{ false: '#D9DDE4', true: '#AFA7F4' }}
                    thumbColor={allowDownload ? '#4937D8' : '#FFFFFF'}
                  />
                </View>
              )}

              {!!modalMessage && (
                <View style={styles.errorCard}>
                  <Text style={styles.errorText}>{modalMessage}</Text>
                </View>
              )}
              {!!uploadLabel && <Text style={styles.uploadLabel}>{uploadLabel}</Text>}

              <Pressable
                disabled={saving}
                style={[styles.saveButton, saving && styles.disabled]}
                onPress={saveDocument}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editing ? 'Salvar alterações' : 'Adicionar documento'}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!referenceDocument}
        transparent
        animationType="fade"
        onRequestClose={() => !referenceSaving && setReferenceDocument(null)}
      >
        <View style={styles.referenceBackdrop}>
          <View style={styles.referenceCard}>
            <Text style={styles.referenceTitle}>Referenciar para minha empresa</Text>
            <Text style={styles.referenceSubtitle}>
              O arquivo não será duplicado e acompanhará sempre a versão atual.
            </Text>
            <TextInput
              value={referenceNote}
              onChangeText={setReferenceNote}
              placeholder="Nota interna opcional"
              placeholderTextColor="#A1A8B4"
              multiline
              style={[styles.input, styles.referenceInput]}
            />
            <View style={styles.referenceActions}>
              <Pressable
                disabled={referenceSaving}
                style={styles.referenceCancel}
                onPress={() => setReferenceDocument(null)}
              >
                <Text style={styles.referenceCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                disabled={referenceSaving}
                style={[styles.referenceSave, referenceSaving && styles.disabled]}
                onPress={saveReference}
              >
                {referenceSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.referenceSaveText}>Referenciar</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: '#7A8394' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTextWrap: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: '#152033' },
  summarySubtitle: { marginTop: 2, fontSize: 10, lineHeight: 14, color: '#697386' },
  addButton: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 11, backgroundColor: '#4937D8' },
  addButtonText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  filters: { paddingVertical: 12, gap: 7 },
  filterChip: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 999, backgroundColor: '#FFFFFF' },
  filterChipActive: { borderColor: '#4937D8', backgroundColor: '#F1EFFF' },
  filterText: { fontSize: 10, fontWeight: '700', color: '#697386' },
  filterTextActive: { color: '#4937D8' },
  successCard: { marginBottom: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: '#EAF8F0' },
  successText: { flex: 1, fontSize: 10, color: '#207A50' },
  errorCard: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: '#FFF0F0' },
  errorText: { fontSize: 10, lineHeight: 14, color: '#A34242' },
  emptyCard: { minHeight: 125, padding: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E2E4E9', borderRadius: 13, backgroundColor: '#FAFAFC' },
  emptyTitle: { marginTop: 7, fontSize: 12, fontWeight: '800', color: '#34405A' },
  emptyText: { maxWidth: 320, marginTop: 4, textAlign: 'center', fontSize: 9, lineHeight: 13, color: '#7A8394' },
  documentCard: { marginBottom: 8, padding: 10, flexDirection: 'row', gap: 9, borderWidth: 1, borderColor: '#E0E3E8', borderRadius: 13, backgroundColor: '#FFFFFF' },
  documentIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#F0EEFF' },
  documentIdentity: { flex: 1, minWidth: 0 },
  documentTitle: { fontSize: 12, fontWeight: '800', color: '#202A3A' },
  documentMeta: { marginTop: 2, fontSize: 9, color: '#697386' },
  tagRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  visibilityTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F0EEFF' },
  visibilityTagText: { fontSize: 8, fontWeight: '800', color: '#4937D8' },
  versionText: { fontSize: 8, fontWeight: '700', color: '#7A8394' },
  documentDescription: { marginTop: 6, fontSize: 9, lineHeight: 13, color: '#596274' },
  referenceNote: { marginTop: 6, padding: 7, flexDirection: 'row', alignItems: 'flex-start', gap: 5, borderRadius: 8, backgroundColor: '#F5F3FF' },
  referenceNoteText: { flex: 1, fontSize: 8, lineHeight: 12, color: '#596274' },
  actionRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  smallAction: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#D9D5F8', borderRadius: 9, backgroundColor: '#FAF9FF' },
  smallActionText: { fontSize: 8, fontWeight: '800', color: '#4937D8' },
  iconAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E0E3E8', borderRadius: 9, backgroundColor: '#FFFFFF' },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(16, 24, 40, 0.35)' },
  modalSheet: { maxHeight: '94%', overflow: 'hidden', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#FFFFFF' },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#ECEEF2' },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: '#152033' },
  modalSubtitle: { marginTop: 2, fontSize: 10, color: '#697386' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: '#F2F3F7' },
  formBody: { padding: 18, paddingBottom: 34 },
  fileActions: { flexDirection: 'row', gap: 8 },
  fileButton: { minHeight: 48, flex: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#CBC6F5', borderRadius: 12, backgroundColor: '#F8F7FF' },
  fileButtonText: { fontSize: 10, fontWeight: '800', color: '#4937D8' },
  selectedFile: { marginTop: 9, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: '#EDF8F2' },
  selectedFileIdentity: { flex: 1, minWidth: 0 },
  selectedFileName: { fontSize: 10, fontWeight: '800', color: '#315847' },
  selectedFileSize: { marginTop: 1, fontSize: 8, color: '#58806E' },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800', color: '#4D586B' },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, fontSize: 12, color: '#202A3A', backgroundColor: '#FFFFFF' },
  textArea: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  choiceRow: { gap: 7 },
  choiceChip: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 999, backgroundColor: '#FFFFFF' },
  choiceChipActive: { borderColor: '#4937D8', backgroundColor: '#F1EFFF' },
  choiceText: { fontSize: 9, fontWeight: '700', color: '#697386' },
  choiceTextActive: { color: '#4937D8' },
  permissionOption: { minHeight: 68, marginBottom: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 12, backgroundColor: '#FFFFFF' },
  permissionOptionActive: { borderColor: '#7467DB', backgroundColor: '#F5F3FF' },
  permissionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#ECE9FF' },
  permissionIdentity: { flex: 1, minWidth: 0 },
  permissionTitle: { fontSize: 10, fontWeight: '800', color: '#34405A' },
  permissionDetail: { marginTop: 2, fontSize: 8, lineHeight: 12, color: '#7A8394' },
  switchRow: { minHeight: 62, marginTop: 2, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: '#F7F7FA' },
  switchIdentity: { flex: 1, minWidth: 0 },
  switchTitle: { fontSize: 10, fontWeight: '800', color: '#34405A' },
  switchDetail: { marginTop: 2, fontSize: 8, lineHeight: 12, color: '#7A8394' },
  uploadLabel: { marginTop: 10, textAlign: 'center', fontSize: 10, color: '#4937D8' },
  saveButton: { minHeight: 52, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#4937D8' },
  saveButtonText: { fontSize: 13, fontWeight: '900', color: '#FFFFFF' },
  referenceBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16, 24, 40, 0.4)' },
  referenceCard: { width: '100%', maxWidth: 420, padding: 18, borderRadius: 18, backgroundColor: '#FFFFFF' },
  referenceTitle: { fontSize: 16, fontWeight: '900', color: '#152033' },
  referenceSubtitle: { marginTop: 4, fontSize: 9, lineHeight: 14, color: '#697386' },
  referenceInput: { minHeight: 76, marginTop: 13, paddingTop: 11, textAlignVertical: 'top' },
  referenceActions: { marginTop: 13, flexDirection: 'row', gap: 8 },
  referenceCancel: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DDE1E8', borderRadius: 11 },
  referenceCancelText: { fontSize: 10, fontWeight: '800', color: '#596274' },
  referenceSave: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: '#4937D8' },
  referenceSaveText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  disabled: { opacity: 0.45 },
});
