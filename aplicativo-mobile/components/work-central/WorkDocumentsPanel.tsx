import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
// @ts-ignore installed with the Expo SDK 54 dependencies declared in package.json
import * as DocumentPicker from 'expo-document-picker';
// @ts-ignore installed with the Expo SDK 54 dependencies declared in package.json
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  openBrowserAsync,
  WebBrowserPresentationStyle,
} from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import {
  FioColors,
  FioRadius,
  FioShadow,
} from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type DocumentVisibility =
  | 'fio_general'
  | 'professionals'
  | 'company_internal';

type DocumentCategory =
  | 'project'
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

type PanelFilter = DocumentVisibility | 'all' | 'mine' | 'referenced';

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
  created_by: string;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
  is_referenced: boolean;
  reference_note: string | null;
  is_current_project?: boolean;
  approved_version?: number | null;
  project_approved_by?: string | null;
  project_approved_at?: string | null;
};

type DocumentVersion = {
  id: string;
  document_id: string;
  version_number: number;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  created_at: string;
};

type ProjectState = {
  id: string;
  is_current_project: boolean;
  approved_version: number | null;
  project_approved_by: string | null;
  project_approved_at: string | null;
};

type DocumentUploadInfo = {
  hasMyUpload: boolean;
  latestUploaderId: string | null;
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

type DocumentPreview = {
  title: string;
  url: string;
};

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;

const CATEGORY_OPTIONS: {
  value: DocumentCategory;
  label: string;
}[] = [
  { value: 'project', label: 'Projeto' },
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

const VISIBILITY_OPTIONS: {
  value: DocumentVisibility;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
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

function formatDate(value: string | null) {
  if (!value) return 'Data não informada';
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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

function isImageDocument(document: WorkDocument) {
  if (document.mime_type?.startsWith('image/')) return true;
  return /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(document.file_name ?? '');
}

function isImageFile(mimeType: string | null, fileName: string) {
  if (mimeType?.startsWith('image/')) return true;
  return /\.(avif|heic|heif|jpe?g|png|webp)$/i.test(fileName);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }
  return fallback;
}

export function WorkDocumentsPanel({
  workId,
  environments,
  participants,
  userId,
  canWrite,
  canManageWork = false,
  newRequest = 0,
  environmentFilterId,
  categoryFilter,
  excludeCategory,
  excludeCategories,
  focusDocumentId,
  onCreateReportVersion,
  onCountChange,
  onChanged,
}: {
  workId: string;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  userId: string | null;
  canWrite: boolean;
  canManageWork?: boolean;
  newRequest?: number;
  environmentFilterId?: string;
  categoryFilter?: DocumentCategory;
  excludeCategory?: DocumentCategory;
  excludeCategories?: DocumentCategory[];
  focusDocumentId?: string;
  onCreateReportVersion?: (
    documentId: string,
    title: string,
    visibility: DocumentVisibility
  ) => void;
  onCountChange?: (count: number) => void;
  onChanged?: () => void;
}) {
  const measurementMode = categoryFilter === 'measurement';
  const projectMode = categoryFilter === 'project';
  const router = useRouter();
  const [documents, setDocuments] = useState<WorkDocument[]>([]);
  const [uploadInfo, setUploadInfo] = useState<
    Record<string, DocumentUploadInfo>
  >({});
  const [versionsByDocument, setVersionsByDocument] = useState<
    Record<string, DocumentVersion[]>
  >({});
  const [activeCompany, setActiveCompany] = useState<ActiveCompany | null>(null);
  const [filter, setFilter] = useState<PanelFilter>('all');
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
  const [documentPreview, setDocumentPreview] =
    useState<DocumentPreview | null>(null);
  const [versionHistoryDocument, setVersionHistoryDocument] =
    useState<WorkDocument | null>(null);
  const [approvingVersion, setApprovingVersion] =
    useState<number | null>(null);
  const openedFocusDocumentRef = useRef<string | null>(null);

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

  const participantAvatars = useMemo(
    () => Object.fromEntries(participants.map((participant) => [participant.user_id, participant.avatar_url])),
    [participants]
  );

  async function loadDocuments() {
    setLoading(true);
    setMessage('');
    const [documentResult, companyResult] = await Promise.all([
      supabase.rpc('get_work_documents', { p_work_id: workId }),
      supabase.rpc('get_active_company_context'),
    ]);

    if (documentResult.error) {
      setDocuments([]);
      setUploadInfo({});
      setVersionsByDocument({});
      setMessage(documentResult.error.message);
    } else {
      const next = (documentResult.data ?? []) as WorkDocument[];
      let hydratedDocuments = next;

      if (next.length === 0) {
        setUploadInfo({});
        setVersionsByDocument({});
      } else {
        const { data: versionData, error: versionError } = await supabase
          .from('work_document_versions')
          .select(`
            id, document_id, version_number, storage_path,
            file_name, mime_type, size_bytes, uploaded_by, created_at
          `)
          .in(
            'document_id',
            next.map((document) => document.id)
          )
          .order('version_number', { ascending: false });

        if (versionError) {
          setUploadInfo({});
          setVersionsByDocument({});
          setMessage(versionError.message);
        } else {
          const nextUploadInfo: Record<string, DocumentUploadInfo> = {};
          const nextVersions: Record<string, DocumentVersion[]> = {};

          for (const version of (versionData ?? []) as DocumentVersion[]) {
            const current = nextUploadInfo[version.document_id] ?? {
              hasMyUpload: false,
              latestUploaderId: null,
            };

            if (!current.latestUploaderId) {
              current.latestUploaderId = version.uploaded_by;
            }
            if (version.uploaded_by === userId) {
              current.hasMyUpload = true;
            }

            nextUploadInfo[version.document_id] = current;
            nextVersions[version.document_id] = [
              ...(nextVersions[version.document_id] ?? []),
              version,
            ];
          }

          setUploadInfo(nextUploadInfo);
          setVersionsByDocument(nextVersions);
        }

        if (projectMode) {
          const { data: projectStateData, error: projectStateError } =
            await supabase
              .from('work_documents')
              .select(`
                id, is_current_project, approved_version,
                project_approved_by, project_approved_at
              `)
              .in(
                'id',
                next.map((document) => document.id)
              );

          if (projectStateError) {
            setMessage(projectStateError.message);
          } else {
            const states = Object.fromEntries(
              ((projectStateData ?? []) as ProjectState[]).map((state) => [
                state.id,
                state,
              ])
            );
            hydratedDocuments = next.map((document) => ({
              ...document,
              ...states[document.id],
            }));
          }
        }
      }

      setDocuments(hydratedDocuments);

      const focusedDocument = focusDocumentId
        ? hydratedDocuments.find((document) => document.id === focusDocumentId)
        : null;
      if (
        focusedDocument &&
        openedFocusDocumentRef.current !== focusedDocument.id
      ) {
        openedFocusDocumentRef.current = focusedDocument.id;
        setTimeout(() => openDocument(focusedDocument), 120);
      }

      onCountChange?.(
        hydratedDocuments.filter(
          (document) =>
            (!categoryFilter || document.category === categoryFilter) &&
            (!excludeCategory || document.category !== excludeCategory) &&
            !(excludeCategories ?? []).includes(document.category)
        ).length
      );
    }

    if (!companyResult.error) {
      const company = (companyResult.data?.[0] ?? null) as ActiveCompany | null;
      setActiveCompany(company);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDocuments();
  }, [workId, userId, projectMode, focusDocumentId]);

  useEffect(() => {
    if (newRequest > 0 && canWrite) openCreate();
  }, [newRequest, canWrite, environmentFilterId]);

  const scopedDocuments = useMemo(
    () =>
      documents.filter(
        (document) =>
          (!categoryFilter || document.category === categoryFilter) &&
          (!excludeCategory || document.category !== excludeCategory) &&
          !(excludeCategories ?? []).includes(document.category) &&
          (!environmentFilterId ||
            document.environment_id === environmentFilterId)
      ),
    [
      categoryFilter,
      documents,
      environmentFilterId,
      excludeCategory,
      excludeCategories,
    ]
  );

  const visibleDocuments = useMemo(() => {
    if (filter === 'all') return scopedDocuments;
    if (filter === 'mine') {
      return scopedDocuments.filter(
        (document) => uploadInfo[document.id]?.hasMyUpload
      );
    }
    if (filter === 'referenced') {
      return scopedDocuments.filter((document) => document.is_referenced);
    }
    return scopedDocuments.filter((document) => document.visibility === filter);
  }, [filter, scopedDocuments, uploadInfo]);

  function userLabel(id: string | null) {
    if (!id) return 'Usuário do FIO';
    if (id === userId) return 'você';
    return participantNames[id]?.trim().split(/\s+/)[0] ?? 'Usuário';
  }

  function openAuthor(id: string | null) {
    if (!id) return;
    router.push({
      pathname: '/public-profile',
      params: { userId: id, ...(id === userId ? { preview: '1' } : {}) },
    });
  }

  function resetForm() {
    setEditing(null);
    setTitle('');
    setDescription('');
    setCategory(categoryFilter ?? 'other');
    setVisibility('fio_general');
    setEnvironmentId(null);
    setAllowDownload(false);
    setSelectedFile(null);
    setModalMessage('');
    setUploadLabel('');
  }

  function openCreate() {
    resetForm();
    setEnvironmentId(environmentFilterId ?? null);
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
    if (asset.size && asset.size > MAX_DOCUMENT_BYTES) {
      setModalMessage('O arquivo deve possuir no máximo 50 MB.');
      return;
    }
    const file: PickedFile = {
      uri: asset.uri,
      name: asset.name || `documento-${Date.now()}`,
      mimeType: asset.mimeType ?? null,
      size: asset.size ?? null,
    };
    setModalMessage('');
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
    setModalMessage('');
    if (!title.trim()) {
      setTitle(
        projectMode
          ? 'Projeto fotografado'
          : measurementMode
          ? 'Medição fotografada'
          : 'Documento fotografado'
      );
    }
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

    const { data: versionNumber, error: versionError } = await supabase.rpc(
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
    return versionNumber as number;
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
          p_owner_company_id:
            visibility === 'company_internal'
              ? activeCompany?.company_id ?? null
              : null,
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
      setFilter('all');
      setSuccessMessage(
        editing
          ? `${
              projectMode ? 'Projeto' : measurementMode ? 'Medição' : 'Documento'
            } atualizado.`
          : `${
              projectMode ? 'Projeto' : measurementMode ? 'Medição' : 'Documento'
            } adicionado à obra.`
      );
      onChanged?.();
    } catch (error) {
      if (createdDocumentId) {
        await supabase.rpc('archive_work_document', {
          p_document_id: createdDocumentId,
        });
      }
      setModalMessage(
        getErrorMessage(
          error,
          `Não foi possível salvar ${
            projectMode ? 'o projeto' : measurementMode ? 'a medição' : 'o documento'
          }.`
        )
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
    if (isImageDocument(document)) {
      setDocumentPreview({ title: document.title, url: data.signedUrl });
      return;
    }
    await openBrowserAsync(data.signedUrl, {
      presentationStyle: WebBrowserPresentationStyle.FORM_SHEET,
    });
  }

  async function openProjectVersion(
    document: WorkDocument,
    version: DocumentVersion
  ) {
    const { data, error } = await supabase.storage
      .from('work-documents')
      .createSignedUrl(version.storage_path, 60 * 10);
    if (error || !data?.signedUrl) {
      Alert.alert('Não foi possível abrir', error?.message ?? 'Tente novamente.');
      return;
    }
    if (isImageFile(version.mime_type, version.file_name)) {
      setDocumentPreview({
        title: `${document.title} · v${version.version_number}`,
        url: data.signedUrl,
      });
      return;
    }
    await openBrowserAsync(data.signedUrl, {
      presentationStyle: WebBrowserPresentationStyle.FORM_SHEET,
    });
  }

  async function approveProjectVersion(
    document: WorkDocument,
    versionNumber: number
  ) {
    if (!canManageWork || approvingVersion !== null) return;
    setApprovingVersion(versionNumber);
    const { error } = await supabase.rpc('set_current_work_project', {
      p_document_id: document.id,
      p_version_number: versionNumber,
    });
    if (error) {
      Alert.alert('Não foi possível definir o projeto vigente', error.message);
    } else {
      setVersionHistoryDocument(null);
      await loadDocuments();
      setSuccessMessage(`Versão ${versionNumber} confirmada como projeto vigente.`);
      onChanged?.();
    }
    setApprovingVersion(null);
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
        <ActivityIndicator color={FioColors.green} />
        <Text style={styles.muted}>Carregando documentos...</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.summaryRow}>
        <View style={styles.summaryTextWrap}>
          <Text style={styles.summaryTitle}>
            {scopedDocuments.length}{' '}
            {projectMode
              ? scopedDocuments.length === 1
                ? 'projeto'
                : 'projetos'
              : measurementMode
              ? scopedDocuments.length === 1
                ? 'medição'
                : 'medições'
              : scopedDocuments.length === 1
              ? 'documento'
              : 'documentos'}
          </Text>
          <Text style={styles.summarySubtitle}>
            {projectMode
              ? 'Uma versão vigente por obra, com histórico preservado.'
              : measurementMode
              ? 'Arquivos técnicos da obra, com versões preservadas.'
              : 'Arquivos da obra com versões e acesso controlado.'}
          </Text>
        </View>
        {canWrite && (
          <Pressable style={styles.addButton} onPress={openCreate}>
            <Ionicons name="add-outline" size={19} color="#FFFFFF" />
            <Text style={styles.addButtonText}>
              {projectMode
                ? 'Novo projeto'
                : measurementMode
                ? 'Novo arquivo'
                : 'Adicionar'}
            </Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {([
          [
            'all',
            projectMode
              ? 'Todos os projetos'
              : measurementMode
              ? 'Todas as medições'
              : 'Todos os documentos',
          ],
          ['mine', 'Enviados por mim'],
          ['fio_general', 'Todos da obra'],
          ['professionals', 'Profissionais'],
          ['company_internal', 'Minha empresa'],
          ['referenced', 'Referenciados'],
        ] as [PanelFilter, string][]).map(([key, label]) => {
          const count =
            key === 'all'
              ? scopedDocuments.length
              : key === 'mine'
              ? scopedDocuments.filter(
                  (document) => uploadInfo[document.id]?.hasMyUpload
                ).length
              : key === 'referenced'
              ? scopedDocuments.filter((document) => document.is_referenced).length
              : scopedDocuments.filter((document) => document.visibility === key).length;
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
          <Ionicons name="checkmark-circle-outline" size={18} color={FioColors.success} />
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
          <Ionicons
            name={
              projectMode
                ? 'layers-outline'
                : measurementMode
                ? 'resize-outline'
                : 'document-text-outline'
            }
            size={24}
            color={FioColors.gold}
          />
          <Text style={styles.emptyTitle}>
            {projectMode
              ? 'Nenhum projeto neste filtro'
              : measurementMode
              ? 'Nenhuma medição neste filtro'
              : 'Nenhuma documentação neste filtro'}
          </Text>
          <Text style={styles.emptyText}>
            {canWrite
              ? projectMode
                ? 'Adicione o arquivo do projeto para iniciar seu histórico de versões.'
                : measurementMode
                ? 'Fotografe uma anotação ou adicione um arquivo de medidas.'
                : 'Adicione uma planta, projeto, contrato ou registro da obra.'
              : `Os ${measurementMode ? 'registros' : 'documentos'} liberados para seu acesso aparecerão aqui.`}
          </Text>
        </View>
      ) : (
        visibleDocuments.map((document) => (
          <View key={document.id} style={styles.documentCard}>
            <View
              style={[
                styles.documentIcon,
                measurementMode && styles.measurementIcon,
                projectMode && styles.projectIcon,
              ]}
            >
              <Ionicons
                name={
                  projectMode
                    ? 'layers-outline'
                    : measurementMode
                    ? 'resize-outline'
                    : 'document-text-outline'
                }
                size={21}
                color={
                  measurementMode || projectMode
                    ? FioColors.gold
                    : FioColors.green
                }
              />
            </View>
            <View style={styles.documentIdentity}>
              <Text style={styles.documentTitle}>{document.title}</Text>
              <Text style={styles.documentMeta}>
                {categoryLabel(document.category)} · {document.environment_name || 'Geral da obra'}
              </Text>
              <Pressable style={styles.authorDateRow} onPress={() => openAuthor(document.created_by)}>
                {participantAvatars[document.created_by] ? (
                  <Image source={{ uri: participantAvatars[document.created_by] ?? undefined }} style={styles.authorAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.authorAvatarFallback}><Ionicons name="person-outline" size={12} color={FioColors.green} /></View>
                )}
                <Text numberOfLines={1} style={styles.authorDateText}>
                  Criado por {userLabel(document.created_by)}
                </Text>
              </Pressable>
              <Pressable style={styles.authorDateRow} onPress={() => openAuthor(uploadInfo[document.id]?.latestUploaderId ?? null)}>
                {participantAvatars[uploadInfo[document.id]?.latestUploaderId ?? ''] ? (
                  <Image source={{ uri: participantAvatars[uploadInfo[document.id]?.latestUploaderId ?? ''] ?? undefined }} style={styles.authorAvatar} contentFit="cover" />
                ) : (
                  <View style={styles.authorAvatarFallback}><Ionicons name="cloud-upload-outline" size={12} color={FioColors.green} /></View>
                )}
                <Text numberOfLines={1} style={styles.authorDateText}>
                  Versão atual enviada por{' '}
                  {userLabel(uploadInfo[document.id]?.latestUploaderId ?? null)}
                  {' · '}
                  {formatDate(document.version_created_at ?? document.created_at)}
                </Text>
              </Pressable>
              <View style={styles.tagRow}>
                {projectMode && (
                  <View
                    style={[
                      styles.projectStatusTag,
                      document.is_current_project &&
                        document.approved_version === document.current_version
                        ? styles.projectStatusCurrent
                        : document.is_current_project
                        ? styles.projectStatusPending
                        : styles.projectStatusOld,
                    ]}
                  >
                    <Text style={styles.projectStatusText}>
                      {document.is_current_project &&
                      document.approved_version === document.current_version
                        ? 'VIGENTE'
                        : document.is_current_project
                        ? `v${document.approved_version ?? '-'} vigente · nova aguardando`
                        : document.approved_version
                        ? 'DESATUALIZADO'
                        : 'AGUARDANDO DEFINIÇÃO'}
                    </Text>
                  </View>
                )}
                <View style={styles.visibilityTag}>
                  <Text style={styles.visibilityTagText}>
                    {visibilityLabel(document.visibility)}
                  </Text>
                </View>
                {document.category === 'report' && (
                  <View style={styles.lockedReportTag}>
                    <Ionicons name="lock-closed-outline" size={11} color={FioColors.green} />
                    <Text style={styles.lockedReportText}>EMITIDO</Text>
                  </View>
                )}
                {document.current_version > 0 && (
                  <Text style={styles.versionText}>v{document.current_version}</Text>
                )}
                {!!document.size_bytes && (
                  <Text style={styles.versionText}>{formatSize(document.size_bytes)}</Text>
                )}
                {document.is_referenced && (
                  <Ionicons name="bookmark" size={13} color={FioColors.green} />
                )}
              </View>
              {!!document.description && (
                <Text numberOfLines={2} style={styles.documentDescription}>
                  {document.description}
                </Text>
              )}
              {!!document.reference_note && (
                <View style={styles.referenceNote}>
                  <Ionicons name="bookmark-outline" size={13} color={FioColors.green} />
                  <Text style={styles.referenceNoteText}>{document.reference_note}</Text>
                </View>
              )}
              <View style={styles.actionRow}>
                <Pressable style={styles.smallAction} onPress={() => openDocument(document)}>
                  <Ionicons name="eye-outline" size={16} color={FioColors.green} />
                  <Text style={styles.smallActionText}>
                    {projectMode ? 'Ver mais recente' : 'Visualizar'}
                  </Text>
                </Pressable>
                {(projectMode || document.category === 'report') && (
                  <Pressable
                    style={styles.smallAction}
                    onPress={() => setVersionHistoryDocument(document)}
                  >
                    <Ionicons name="layers-outline" size={16} color={FioColors.green} />
                    <Text style={styles.smallActionText}>Versões</Text>
                  </Pressable>
                )}
                {canWrite && document.visibility !== 'company_internal' && (
                  <Pressable style={styles.smallAction} onPress={() => toggleReference(document)}>
                    <Ionicons
                      name={document.is_referenced ? 'bookmark' : 'bookmark-outline'}
                      size={16}
                      color={FioColors.green}
                    />
                    <Text style={styles.smallActionText}>
                      {document.is_referenced ? 'Referenciado' : 'Referenciar'}
                    </Text>
                  </Pressable>
                )}
                {document.category === 'report' && canManageWork && onCreateReportVersion && (
                  <Pressable
                    accessibilityLabel="Gerar nova versão do relatório"
                    style={styles.smallAction}
                    onPress={() =>
                      onCreateReportVersion(
                        document.id,
                        document.title,
                        document.visibility
                      )
                    }
                  >
                    <Ionicons name="refresh-outline" size={16} color={FioColors.green} />
                    <Text style={styles.smallActionText}>Nova versão</Text>
                  </Pressable>
                )}
                {document.can_manage && document.category !== 'report' && (
                  <Pressable
                    accessibilityLabel="Editar dados ou enviar nova versão"
                    style={styles.smallAction}
                    onPress={() => openEdit(document)}
                  >
                    <Ionicons name="cloud-upload-outline" size={16} color={FioColors.green} />
                    <Text style={styles.smallActionText}>Editar / versão</Text>
                  </Pressable>
                )}
                {document.can_manage && document.category !== 'report' && (
                  <Pressable style={styles.iconAction} onPress={() => confirmArchive(document)}>
                    <Ionicons name="archive-outline" size={18} color={FioColors.danger} />
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
                  {editing
                    ? `Editar ${
                        projectMode
                          ? 'projeto'
                          : measurementMode
                          ? 'medição'
                          : 'documento'
                      }`
                    : projectMode
                    ? 'Novo projeto'
                    : `Nov${measurementMode ? 'a medição' : 'o documento'}`}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {editing
                    ? 'Atualize os dados ou envie uma nova versão.'
                    : projectMode
                    ? 'Adicione o arquivo inicial. Proprietário ou gestor define a versão vigente.'
                    : measurementMode
                    ? 'Fotografe uma anotação ou escolha um arquivo de medidas.'
                    : 'Escolha um arquivo ou fotografe agora.'}
                </Text>
              </View>
              <Pressable style={styles.closeButton} onPress={closeForm}>
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formBody}>
              <View style={styles.fileActions}>
                <Pressable style={styles.fileButton} onPress={chooseDocument}>
                  <Ionicons name="attach-outline" size={21} color={FioColors.green} />
                  <Text style={styles.fileButtonText}>Escolher arquivo</Text>
                </Pressable>
                <Pressable style={styles.fileButton} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={21} color={FioColors.green} />
                  <Text style={styles.fileButtonText}>
                    {measurementMode ? 'Fotografar medição' : 'Foto rápida'}
                  </Text>
                </Pressable>
              </View>
              {!!selectedFile && (
                <View style={styles.selectedFile}>
                  <Ionicons name="checkmark-circle" size={19} color={FioColors.success} />
                  <View style={styles.selectedFileIdentity}>
                    <Text numberOfLines={1} style={styles.selectedFileName}>
                      {selectedFile.name}
                    </Text>
                    <Text style={styles.selectedFileSize}>{formatSize(selectedFile.size)}</Text>
                  </View>
                  <Pressable onPress={() => setSelectedFile(null)}>
                    <Ionicons name="close-circle-outline" size={21} color={FioColors.textSoft} />
                  </Pressable>
                </View>
              )}

              <Text style={styles.label}>Título *</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={
                  measurementMode
                    ? 'Ex.: Medição final da bancada'
                    : projectMode
                    ? 'Ex.: Projeto executivo da obra'
                    : 'Ex.: Planta hidráulica atualizada'
                }
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

              {!categoryFilter && (
                <>
                  <Text style={styles.label}>Categoria</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.choiceRow}
                  >
                    {CATEGORY_OPTIONS.filter(
                      (option) => option.value !== 'project' && option.value !== 'report'
                    ).map((option) => (
                      <Pressable
                        key={option.value}
                        style={[
                          styles.choiceChip,
                          category === option.value && styles.choiceChipActive,
                        ]}
                        onPress={() => setCategory(option.value)}
                      >
                        <Text
                          style={[
                            styles.choiceText,
                            category === option.value && styles.choiceTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <Text style={styles.label}>Onde se aplica?</Text>
              {environmentFilterId ? (
                <View style={styles.lockedEnvironment}>
                  <View style={styles.lockedEnvironmentIcon}>
                    <Ionicons name="grid-outline" size={18} color={FioColors.green} />
                  </View>
                  <View style={styles.lockedEnvironmentIdentity}>
                    <Text style={styles.lockedEnvironmentLabel}>AMBIENTE VINCULADO</Text>
                    <Text style={styles.lockedEnvironmentName}>
                      {environments.find(
                        (environment) => environment.id === environmentFilterId
                      )?.name ?? 'Ambiente'}
                    </Text>
                  </View>
                  <Ionicons
                    name="lock-closed-outline"
                    size={17}
                    color={FioColors.gold}
                  />
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.choiceRow}
                >
                  <Pressable
                    style={[
                      styles.choiceChip,
                      environmentId === null && styles.choiceChipActive,
                    ]}
                    onPress={() => setEnvironmentId(null)}
                  >
                    <Text
                      style={[
                        styles.choiceText,
                        environmentId === null && styles.choiceTextActive,
                      ]}
                    >
                      Geral da obra
                    </Text>
                  </Pressable>
                  {environments.map((environment) => (
                    <Pressable
                      key={environment.id}
                      style={[
                        styles.choiceChip,
                        environmentId === environment.id &&
                          styles.choiceChipActive,
                      ]}
                      onPress={() => setEnvironmentId(environment.id)}
                    >
                      <Text
                        style={[
                          styles.choiceText,
                          environmentId === environment.id &&
                            styles.choiceTextActive,
                        ]}
                      >
                        {environment.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

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
                    <Ionicons name={option.icon} size={20} color={FioColors.green} />
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
                    color={visibility === option.value ? FioColors.green : FioColors.textSoft}
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
                    thumbColor={allowDownload ? FioColors.green : FioColors.textSoft}
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
                    {editing
                      ? 'Salvar alterações'
                      : `Adicionar ${
                          projectMode
                            ? 'projeto'
                            : measurementMode
                            ? 'medição'
                            : 'documento'
                        }`}
                  </Text>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!versionHistoryDocument}
        transparent
        animationType="slide"
        onRequestClose={() =>
          approvingVersion === null && setVersionHistoryDocument(null)
        }
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.versionSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Versões do projeto</Text>
                <Text numberOfLines={1} style={styles.modalSubtitle}>
                  {versionHistoryDocument?.title}
                </Text>
              </View>
              <Pressable
                style={styles.closeButton}
                disabled={approvingVersion !== null}
                onPress={() => setVersionHistoryDocument(null)}
              >
                <Ionicons name="close-outline" size={24} color={FioColors.text} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.versionList}>
              {(versionHistoryDocument
                ? versionsByDocument[versionHistoryDocument.id] ?? []
                : []
              ).map((version) => {
                const isApproved =
                  versionHistoryDocument?.is_current_project &&
                  versionHistoryDocument.approved_version === version.version_number;
                const isPending =
                  !versionHistoryDocument?.approved_version ||
                  (versionHistoryDocument.is_current_project &&
                    version.version_number >
                      versionHistoryDocument.approved_version);

                return (
                  <View key={version.id} style={styles.versionCard}>
                    <View style={styles.versionHeading}>
                      <View style={styles.versionNumberBadge}>
                        <Text style={styles.versionNumberText}>
                          v{version.version_number}
                        </Text>
                      </View>
                      <View style={styles.versionIdentity}>
                        <Text numberOfLines={1} style={styles.versionFileName}>
                          {version.file_name}
                        </Text>
                        <Text style={styles.versionMeta}>
                          Enviada por {userLabel(version.uploaded_by)} ·{' '}
                          {formatDate(version.created_at)}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.versionStatus,
                        isApproved
                          ? styles.versionStatusCurrent
                          : isPending
                          ? styles.versionStatusPending
                          : styles.versionStatusOld,
                      ]}
                    >
                      <Text style={styles.versionStatusText}>
                        {isApproved
                          ? 'VIGENTE'
                          : isPending
                          ? versionHistoryDocument?.approved_version
                            ? 'AGUARDANDO CONFIRMAÇÃO'
                            : 'AGUARDANDO DEFINIÇÃO'
                          : 'DESATUALIZADA'}
                      </Text>
                    </View>

                    <View style={styles.versionActions}>
                      <Pressable
                        style={styles.smallAction}
                        onPress={() =>
                          versionHistoryDocument &&
                          openProjectVersion(versionHistoryDocument, version)
                        }
                      >
                        <Ionicons name="eye-outline" size={16} color={FioColors.green} />
                        <Text style={styles.smallActionText}>Visualizar</Text>
                      </Pressable>

                      {canManageWork && !isApproved && (
                        <Pressable
                          disabled={approvingVersion !== null}
                          style={[
                            styles.approveProjectButton,
                            approvingVersion !== null && styles.disabled,
                          ]}
                          onPress={() =>
                            versionHistoryDocument &&
                            approveProjectVersion(
                              versionHistoryDocument,
                              version.version_number
                            )
                          }
                        >
                          {approvingVersion === version.version_number ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <Ionicons
                                name="checkmark-circle-outline"
                                size={16}
                                color="#FFFFFF"
                              />
                              <Text style={styles.approveProjectText}>
                                Definir vigente
                              </Text>
                            </>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
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

      <Modal
        visible={!!documentPreview}
        animationType="fade"
        onRequestClose={() => setDocumentPreview(null)}
      >
        <View style={styles.previewScreen}>
          <View style={styles.previewHeader}>
            <Text numberOfLines={1} style={styles.previewTitle}>
              {documentPreview?.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar visualização"
              style={styles.previewClose}
              onPress={() => setDocumentPreview(null)}
            >
              <Ionicons name="close-outline" size={27} color="#FFFFFF" />
            </Pressable>
          </View>
          {!!documentPreview && (
            <Image
              source={{ uri: documentPreview.url }}
              contentFit="contain"
              style={styles.previewImage}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 110, alignItems: 'center', justifyContent: 'center', gap: 8 },
  muted: { fontSize: 11, color: FioColors.textMuted },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryTextWrap: { flex: 1, minWidth: 0 },
  summaryTitle: { fontSize: 15, fontWeight: '800', color: FioColors.text },
  summarySubtitle: { marginTop: 2, fontSize: 10, lineHeight: 14, color: FioColors.textMuted },
  addButton: { minHeight: 40, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: FioRadius.pill, backgroundColor: FioColors.green },
  addButtonText: { fontSize: 10, fontWeight: '800', color: FioColors.textOnAccent },
  filters: { paddingVertical: 12, gap: 7 },
  filterChip: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999, backgroundColor: FioColors.surface },
  filterChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  filterText: { fontSize: 10, fontWeight: '700', color: FioColors.textMuted },
  filterTextActive: { color: FioColors.green },
  successCard: { marginBottom: 9, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, backgroundColor: FioColors.successSoft },
  successText: { flex: 1, fontSize: 10, color: FioColors.success },
  errorCard: { marginTop: 9, padding: 10, borderRadius: 10, backgroundColor: FioColors.dangerSoft },
  errorText: { fontSize: 10, lineHeight: 14, color: FioColors.danger },
  emptyCard: { minHeight: 125, padding: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  emptyTitle: { marginTop: 7, fontSize: 12, fontWeight: '800', color: FioColors.text },
  emptyText: { maxWidth: 320, marginTop: 4, textAlign: 'center', fontSize: 9, lineHeight: 13, color: FioColors.textMuted },
  documentCard: { marginBottom: 8, padding: 10, flexDirection: 'row', gap: 9, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface, ...FioShadow },
  documentIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.greenSoft },
  measurementIcon: { backgroundColor: FioColors.goldSoft },
  projectIcon: { backgroundColor: FioColors.goldSoft },
  documentIdentity: { flex: 1, minWidth: 0 },
  documentTitle: { fontSize: 12, fontWeight: '800', color: FioColors.text },
  documentMeta: { marginTop: 2, fontSize: 9, color: FioColors.textMuted },
  authorDateRow: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  authorAvatar: { width: 21, height: 21, overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.greenSoft },
  authorAvatarFallback: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.greenSoft },
  authorDateText: { flex: 1, minWidth: 0, fontSize: 8, color: FioColors.textMuted },
  tagRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  projectStatusTag: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  projectStatusCurrent: { backgroundColor: FioColors.successSoft },
  projectStatusPending: { backgroundColor: '#423B2D' },
  projectStatusOld: { backgroundColor: FioColors.surfaceMuted },
  projectStatusText: { fontSize: 7, fontWeight: '900', color: FioColors.textMuted },
  visibilityTag: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: FioColors.greenSoft },
  visibilityTagText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  lockedReportTag: { paddingHorizontal: 7, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: FioColors.greenSoft },
  lockedReportText: { fontSize: 8, fontWeight: '900', color: FioColors.green },
  versionText: { fontSize: 8, fontWeight: '700', color: FioColors.textSoft },
  documentDescription: { marginTop: 6, fontSize: 9, lineHeight: 13, color: FioColors.textMuted },
  referenceNote: { marginTop: 6, padding: 7, flexDirection: 'row', alignItems: 'flex-start', gap: 5, borderRadius: 8, backgroundColor: FioColors.greenSoft },
  referenceNoteText: { flex: 1, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  actionRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  smallAction: { minHeight: 34, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 9, backgroundColor: FioColors.surfaceRaised },
  smallActionText: { fontSize: 8, fontWeight: '800', color: FioColors.green },
  iconAction: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 9, backgroundColor: FioColors.surfaceRaised },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12, 15, 12, 0.68)' },
  modalSheet: { maxHeight: '94%', overflow: 'hidden', borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  modalHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  modalHeaderText: { flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 21, fontWeight: '900', color: FioColors.text },
  modalSubtitle: { marginTop: 2, fontSize: 10, color: FioColors.textMuted },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: FioColors.surfaceRaised },
  formBody: { padding: 18, paddingBottom: 34 },
  fileActions: { flexDirection: 'row', gap: 8 },
  fileButton: { minHeight: 48, flex: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  fileButtonText: { fontSize: 10, fontWeight: '800', color: FioColors.green },
  selectedFile: { marginTop: 9, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, backgroundColor: FioColors.successSoft },
  selectedFileIdentity: { flex: 1, minWidth: 0 },
  selectedFileName: { fontSize: 10, fontWeight: '800', color: FioColors.success },
  selectedFileSize: { marginTop: 1, fontSize: 8, color: FioColors.textMuted },
  label: { marginTop: 14, marginBottom: 6, fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  input: { minHeight: 48, paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, fontSize: 12, color: FioColors.text, backgroundColor: FioColors.surfaceRaised },
  textArea: { minHeight: 82, paddingTop: 12, textAlignVertical: 'top' },
  choiceRow: { gap: 7 },
  choiceChip: { minHeight: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999, backgroundColor: FioColors.surface },
  choiceChipActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  choiceText: { fontSize: 9, fontWeight: '700', color: FioColors.textMuted },
  choiceTextActive: { color: FioColors.green },
  lockedEnvironment: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 9,
    borderWidth: 1,
    borderColor: FioColors.lineStrong,
    borderRadius: FioRadius.medium,
    backgroundColor: FioColors.greenSoft,
  },
  lockedEnvironmentIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: FioColors.surfaceRaised,
  },
  lockedEnvironmentIdentity: { flex: 1, minWidth: 0 },
  lockedEnvironmentLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: FioColors.gold,
  },
  lockedEnvironmentName: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '900',
    color: FioColors.green,
  },
  permissionOption: { minHeight: 68, marginBottom: 7, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  permissionOptionActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft },
  permissionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: FioColors.greenSoft },
  permissionIdentity: { flex: 1, minWidth: 0 },
  permissionTitle: { fontSize: 10, fontWeight: '800', color: FioColors.text },
  permissionDetail: { marginTop: 2, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  switchRow: { minHeight: 62, marginTop: 2, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  switchIdentity: { flex: 1, minWidth: 0 },
  switchTitle: { fontSize: 10, fontWeight: '800', color: FioColors.text },
  switchDetail: { marginTop: 2, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  uploadLabel: { marginTop: 10, textAlign: 'center', fontSize: 10, color: FioColors.green },
  saveButton: { minHeight: 52, marginTop: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: FioColors.green },
  saveButtonText: { fontSize: 13, fontWeight: '900', color: FioColors.textOnAccent },
  referenceBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 15, 12, 0.72)' },
  referenceCard: { width: '100%', maxWidth: 420, padding: 18, borderWidth: 2, borderColor: FioColors.lineStrong, borderRadius: 18, backgroundColor: FioColors.surface },
  referenceTitle: { fontSize: 16, fontWeight: '900', color: FioColors.text },
  referenceSubtitle: { marginTop: 4, fontSize: 9, lineHeight: 14, color: FioColors.textMuted },
  referenceInput: { minHeight: 76, marginTop: 13, paddingTop: 11, textAlignVertical: 'top' },
  referenceActions: { marginTop: 13, flexDirection: 'row', gap: 8 },
  referenceCancel: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11 },
  referenceCancelText: { fontSize: 10, fontWeight: '800', color: FioColors.textMuted },
  referenceSave: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.green },
  referenceSaveText: { fontSize: 10, fontWeight: '800', color: FioColors.textOnAccent },
  versionSheet: { maxHeight: '90%', overflow: 'hidden', borderTopWidth: 2, borderColor: FioColors.lineStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  versionList: { padding: 14, paddingBottom: 30, gap: 9 },
  versionCard: { padding: 11, borderWidth: 1, borderColor: FioColors.line, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  versionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  versionNumberBadge: { minWidth: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.goldSoft },
  versionNumberText: { fontSize: 11, fontWeight: '900', color: FioColors.gold },
  versionIdentity: { flex: 1, minWidth: 0 },
  versionFileName: { fontSize: 11, fontWeight: '800', color: FioColors.text },
  versionMeta: { marginTop: 3, fontSize: 8, color: FioColors.textMuted },
  versionStatus: { alignSelf: 'flex-start', marginTop: 9, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999 },
  versionStatusCurrent: { backgroundColor: FioColors.successSoft },
  versionStatusPending: { backgroundColor: '#423B2D' },
  versionStatusOld: { backgroundColor: FioColors.surfaceMuted },
  versionStatusText: { fontSize: 7, fontWeight: '900', color: FioColors.textMuted },
  versionActions: { marginTop: 8, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  approveProjectButton: { minHeight: 34, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 9, backgroundColor: FioColors.green },
  approveProjectText: { fontSize: 8, fontWeight: '900', color: FioColors.textOnAccent },
  previewScreen: { flex: 1, backgroundColor: FioColors.canvas },
  previewHeader: { minHeight: 72, paddingTop: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: FioColors.surfaceMuted },
  previewTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  previewClose: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.12)' },
  previewImage: { flex: 1, width: '100%' },
  disabled: { opacity: 0.45 },
});
