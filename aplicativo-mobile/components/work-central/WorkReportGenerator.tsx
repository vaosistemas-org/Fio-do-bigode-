import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
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

import { Work, WorkEnvironment, WorkParticipant } from '@/components/work-central/types';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

export type ReportType = 'daily' | 'delivery' | 'complete';
type ReportVisibility = 'internal' | 'shared';

type ReportOptions = {
  work: boolean;
  environments: boolean;
  delivery: boolean;
  photos: boolean;
  pending: boolean;
  diary: boolean;
};

type DeliveryItem = {
  environment_id: string | null;
  title: string;
  description: string | null;
  status: string;
  required: boolean;
};

type PendingItem = {
  environment_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  blocks_delivery: boolean;
  due_date: string | null;
};

type TimelineItem = {
  environment_name: string | null;
  event_type: string | null;
  title: string | null;
  description: string | null;
  actor_full_name: string | null;
  visibility: string | null;
  created_at: string;
};

type ReportPhoto = {
  environment_id: string | null;
  storage_path: string;
  caption: string | null;
  photo_type: string;
  visibility: string;
  created_at: string;
};

type PdfPhoto = {
  bytes: Uint8Array;
  width: number;
  height: number;
  caption: string;
};

const REPORT_TYPES: { value: ReportType; label: string; detail: string }[] = [
  { value: 'daily', label: 'Relatório diário', detail: 'Registro do andamento e do FIO.' },
  { value: 'delivery', label: 'Vistoria e entrega', detail: 'Checklist, fotos finais e pendências.' },
  { value: 'complete', label: 'Relatório completo', detail: 'Consolidado de toda a obra.' },
];

const DEFAULT_OPTIONS: ReportOptions = {
  work: true,
  environments: true,
  delivery: true,
  photos: true,
  pending: true,
  diary: true,
};

function reportTypeLabel(type: ReportType) {
  return REPORT_TYPES.find((item) => item.value === type)?.label ?? 'Relatório';
}

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Não informado';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function safePdfText(value: string) {
  return value
    .replace(/[\\()]/g, '\\$&')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');
}

function wrapText(value: string, max = 86) {
  const words = safePdfText(value).trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

function latinBytes(value: string) {
  return Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
}

function joinBytes(parts: Uint8Array[]) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

function jpegSize(bytes: Uint8Array) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2;
      continue;
    }
    const length = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (length < 2 || offset + length + 2 > bytes.length) return null;
    if (
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 ||
      marker === 0xc3 || marker === 0xc5 || marker === 0xc6 ||
      marker === 0xc7 || marker === 0xc9 || marker === 0xca ||
      marker === 0xcb || marker === 0xcd || marker === 0xce || marker === 0xcf
    ) {
      return {
        height: (bytes[offset + 5] << 8) + bytes[offset + 6],
        width: (bytes[offset + 7] << 8) + bytes[offset + 8],
      };
    }
    offset += length + 2;
  }
  return null;
}

function makePdf(
  lines: { text: string; bold?: boolean; gap?: boolean }[],
  photos: PdfPhoto[]
) {
  const textPages: string[][] = [[]];
  let y = 792;
  const add = (text: string, bold = false, gap = false) => {
    const fontSize = bold ? 11 : 9;
    const required = (gap ? 8 : 0) + fontSize + 5;
    if (y - required < 48) {
      textPages.push([]);
      y = 792;
    }
    if (gap) y -= 8;
    y -= fontSize + 5;
    textPages[textPages.length - 1].push(
      `BT /F${bold ? 2 : 1} ${fontSize} Tf 44 ${y} Td (${safePdfText(text)}) Tj ET`
    );
  };

  lines.forEach((line) => {
    wrapText(line.text, line.bold ? 66 : 86).forEach((text, index) =>
      add(text, line.bold, line.gap && index === 0)
    );
  });

  type PdfPage = {
    pageId: number;
    contentId: number;
    imageId?: number;
    text?: string;
    photo?: PdfPhoto;
  };
  const pages: PdfPage[] = [];
  let nextId = 5;
  for (const page of textPages) {
    pages.push({ pageId: nextId, contentId: nextId + 1, text: page.join('\n') });
    nextId += 2;
  }
  for (const photo of photos) {
    pages.push({ pageId: nextId, contentId: nextId + 1, imageId: nextId + 2, photo });
    nextId += 3;
  }

  const objects = new Map<number, Uint8Array>();
  objects.set(1, latinBytes('<< /Type /Catalog /Pages 2 0 R >>'));
  objects.set(2, latinBytes(`<< /Type /Pages /Kids [${pages.map((page) => `${page.pageId} 0 R`).join(' ')}] /Count ${pages.length} >>`));
  objects.set(3, latinBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'));
  objects.set(4, latinBytes('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'));

  for (const page of pages) {
    if (page.photo && page.imageId) {
      const maxWidth = 524;
      const maxHeight = 650;
      const scale = Math.min(maxWidth / page.photo.width, maxHeight / page.photo.height);
      const width = Math.round(page.photo.width * scale);
      const height = Math.round(page.photo.height * scale);
      const x = Math.round((612 - width) / 2);
      const imageY = Math.round(90 + (maxHeight - height) / 2);
      const caption = safePdfText(page.photo.caption).slice(0, 88);
      const content = `BT /F2 11 Tf 44 800 Td (${caption}) Tj ET\nq ${width} 0 0 ${height} ${x} ${imageY} cm /Im1 Do Q`;
      objects.set(
        page.pageId,
        latinBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im1 ${page.imageId} 0 R >> >> /Contents ${page.contentId} 0 R >>`)
      );
      objects.set(page.contentId, latinBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
      objects.set(
        page.imageId,
        joinBytes([
          latinBytes(`<< /Type /XObject /Subtype /Image /Width ${page.photo.width} /Height ${page.photo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.photo.bytes.byteLength} >>\nstream\n`),
          page.photo.bytes,
          latinBytes('\nendstream'),
        ])
      );
    } else {
      const content = page.text ?? '';
      objects.set(
        page.pageId,
        latinBytes(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${page.contentId} 0 R >>`)
      );
      objects.set(page.contentId, latinBytes(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    }
  }

  const header = latinBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const output: Uint8Array[] = [header];
  const offsets = [0];
  let byteOffset = header.byteLength;
  for (let id = 1; id < nextId; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error('Falha ao montar o arquivo PDF.');
    const object = joinBytes([latinBytes(`${id} 0 obj\n`), body, latinBytes('\nendobj\n')]);
    offsets[id] = byteOffset;
    output.push(object);
    byteOffset += object.byteLength;
  }
  const xrefOffset = byteOffset;
  let xref = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextId; id += 1) {
    xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  output.push(latinBytes(xref));
  return joinBytes(output);
}

function fileNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

async function loadPdfPhoto(photo: ReportPhoto, caption: string) {
  try {
    const { data, error } = await supabase.storage
      .from('work-photos')
      .createSignedUrl(photo.storage_path, 60 * 10);
    if (error || !data?.signedUrl) return null;
    const response = await fetch(data.signedUrl);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const size = jpegSize(bytes);
    if (!size) return null;
    return { bytes, ...size, caption } as PdfPhoto;
  } catch {
    return null;
  }
}

export function WorkReportGenerator({
  visible,
  onClose,
  work,
  environments,
  participants,
  canWrite,
  canManage,
  initialType,
  baseDocumentId,
  baseDocumentTitle,
  baseVisibility,
  onGenerated,
}: {
  visible: boolean;
  onClose: () => void;
  work: Work;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  canWrite: boolean;
  canManage: boolean;
  initialType?: ReportType;
  baseDocumentId?: string | null;
  baseDocumentTitle?: string | null;
  baseVisibility?: ReportVisibility | null;
  onGenerated?: () => void;
}) {
  const [reportType, setReportType] = useState<ReportType>('daily');
  const [visibility, setVisibility] = useState<ReportVisibility>('internal');
  const [options, setOptions] = useState<ReportOptions>(DEFAULT_OPTIONS);
  const [responsibleName, setResponsibleName] = useState('');
  const [clientName, setClientName] = useState(work.client_name);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const reporter = participants.find((person) => person.is_current_user)?.full_name;

  useEffect(() => {
    if (!visible) return;
    let nextType = initialType ?? 'daily';
    const normalizedTitle = baseDocumentTitle?.toLowerCase() ?? '';
    if (normalizedTitle.includes('vistoria') || normalizedTitle.includes('entrega')) {
      nextType = 'delivery';
    } else if (normalizedTitle.includes('completo')) {
      nextType = 'complete';
    }
    if (nextType === 'complete' && !canManage) nextType = 'daily';
    setReportType(nextType);
    if (baseVisibility) setVisibility(baseVisibility);
    setClientName(work.client_name);
    setMessage('');
  }, [baseDocumentTitle, baseVisibility, canManage, initialType, visible, work.client_name]);

  function setOption(option: keyof ReportOptions, value: boolean) {
    setOptions((current) => ({ ...current, [option]: value }));
  }

  async function generate() {
    if (!canWrite || saving) return;
    if (baseDocumentId && !canManage) {
      setMessage('Somente proprietário ou gestor pode gerar uma nova versão.');
      return;
    }
    if (reportType === 'complete' && !canManage) {
      setMessage('O relatório completo pode ser gerado apenas por proprietário ou gestor.');
      return;
    }
    if (!Object.values(options).some(Boolean)) {
      setMessage('Escolha ao menos uma parte para o relatório.');
      return;
    }

    setSaving(true);
    setMessage('');
    let documentId: string | null = null;
    let storagePath: string | null = null;
    try {
      const [deliveryResult, pendingResult, photoResult, timelineResult] = await Promise.all([
        options.delivery
          ? supabase
              .from('work_delivery_checklist_items')
              .select('environment_id, title, description, status, required')
              .eq('work_id', work.id)
              .eq('active', true)
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        options.pending
          ? supabase
              .from('work_pending_items')
              .select('environment_id, title, description, priority, status, blocks_delivery, due_date')
              .eq('work_id', work.id)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        options.photos
          ? supabase
              .from('work_photos')
              .select('environment_id, storage_path, caption, photo_type, visibility, created_at')
              .eq('work_id', work.id)
              .eq('collection', 'work')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        options.diary
          ? supabase.rpc('get_work_timeline', { p_work_id: work.id })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (deliveryResult.error) throw deliveryResult.error;
      if (pendingResult.error) throw pendingResult.error;
      if (photoResult.error) throw photoResult.error;
      if (timelineResult.error) throw timelineResult.error;

      const environmentNames = Object.fromEntries(environments.map((item) => [item.id, item.name]));
      const delivery = (deliveryResult.data ?? []) as DeliveryItem[];
      const pending = (pendingResult.data ?? []) as PendingItem[];
      const photos = (photoResult.data ?? []) as ReportPhoto[];
      const diary = (timelineResult.data ?? []) as TimelineItem[];
      const visiblePhotos = photos.filter(
        (photo) => visibility === 'internal' || photo.visibility === 'shared'
      );
      const visibleDiary = diary.filter(
        (item) => visibility === 'internal' || item.visibility === 'shared'
      );
      const eligiblePhotoRows = visiblePhotos.filter(
        (photo) => reportType !== 'delivery' || photo.photo_type === 'delivery_final'
      );
      const reportPhotoRows = eligiblePhotoRows.slice(0, 30);
      const loadedPhotos = await Promise.all(
        reportPhotoRows.map((photo, index) => {
          const local = photo.environment_id
            ? environmentNames[photo.environment_id] ?? 'Ambiente'
            : 'Geral da obra';
          const caption = `${index + 1}. ${local} · ${photo.caption ?? (photo.photo_type === 'delivery_final' ? 'Foto final' : 'Foto da obra')}`;
          return loadPdfPhoto(photo, caption);
        })
      );
      const pdfPhotos = loadedPhotos.filter((photo): photo is PdfPhoto => Boolean(photo));
      const skippedPhotos = reportPhotoRows.length - pdfPhotos.length;
      const generatedAt = new Date().toLocaleString('pt-BR', {
        dateStyle: 'long',
        timeStyle: 'short',
      });
      const lines: { text: string; bold?: boolean; gap?: boolean }[] = [
        { text: reportTypeLabel(reportType).toUpperCase(), bold: true },
        { text: `Obra ${work.code} · ${work.client_name}` },
        { text: `Gerado em ${generatedAt}${reporter ? ` por ${reporter}` : ''}` },
      ];

      if (options.work) {
        lines.push(
          { text: 'DADOS E STATUS DA OBRA', bold: true, gap: true },
          { text: `Endereço: ${work.address || 'Não informado'}` },
          { text: `Status: ${work.status} · Progresso: ${work.progress}%` },
          ...(work.notes ? [{ text: `Observações da obra: ${work.notes}` }] : [])
        );
      }
      if (options.environments) {
        lines.push({ text: 'AMBIENTES', bold: true, gap: true });
        if (!environments.length) lines.push({ text: 'Nenhum ambiente ativo cadastrado.' });
        environments.forEach((item) => {
          lines.push({ text: `${item.name}: ${item.status.replace(/_/g, ' ')} · ${item.progress}%` });
        });
      }
      if (options.delivery) {
        lines.push({ text: 'CHECKLIST DE ENTREGA', bold: true, gap: true });
        if (!delivery.length) lines.push({ text: 'Nenhum item de checklist cadastrado.' });
        delivery.forEach((item) => {
          const local = item.environment_id ? environmentNames[item.environment_id] ?? 'Ambiente' : 'Geral';
          lines.push({ text: `[${item.status === 'completed' ? 'Conforme' : 'Pendente'}] ${local} · ${item.title}${item.description ? ` — ${item.description}` : ''}` });
        });
      }
      if (options.photos) {
        lines.push({ text: 'FOTOS REGISTRADAS', bold: true, gap: true });
        const sharedPhotos = visiblePhotos.filter((photo) => photo.visibility === 'shared');
        const finalPhotos = visiblePhotos.filter((photo) => photo.photo_type === 'delivery_final');
        lines.push({ text: `${visiblePhotos.length} fotos disponíveis neste nível · ${finalPhotos.length} fotos finais · ${sharedPhotos.length} fotos compartilhadas.` });
        lines.push({ text: `${pdfPhotos.length} imagem(ns) inserida(s) nas páginas seguintes${eligiblePhotoRows.length > reportPhotoRows.length ? ` · limite de 30 por relatório, demais disponíveis na galeria` : ''}${skippedPhotos ? ` · ${skippedPhotos} não puderam ser carregadas` : ''}.` });
        environments.forEach((item) => {
          const count = visiblePhotos.filter((photo) => photo.environment_id === item.id).length;
          if (count) lines.push({ text: `${item.name}: ${count} foto(s).` });
        });
      }
      if (options.pending) {
        lines.push({ text: 'PENDÊNCIAS', bold: true, gap: true });
        if (!pending.length) lines.push({ text: 'Nenhuma pendência registrada.' });
        pending.forEach((item) => {
          const local = item.environment_id
            ? environmentNames[item.environment_id] ?? 'Ambiente'
            : 'Geral';
          lines.push({ text: `[${item.status === 'completed' ? 'Resolvida' : 'Aberta'}] ${local} · ${item.title}${item.blocks_delivery ? ' · Bloqueia entrega' : ''}${item.due_date ? ` · Prazo ${dateLabel(item.due_date)}` : ''}${item.description ? ` — ${item.description}` : ''}` });
        });
      }
      if (options.diary) {
        lines.push({ text: 'FIO / DIÁRIO', bold: true, gap: true });
        if (!visibleDiary.length) lines.push({ text: 'Nenhum registro no FIO.' });
        visibleDiary.slice(0, 80).forEach((item) => {
          lines.push({ text: `${dateLabel(item.created_at)} · ${item.environment_name ?? 'Geral'} · ${item.title ?? item.event_type ?? 'Registro'}${item.description ? ` — ${item.description}` : ''}` });
        });
        if (visibleDiary.length > 80) lines.push({ text: `Histórico resumido: ${visibleDiary.length - 80} registros adicionais disponíveis no FIO.` });
      }
      lines.push(
        { text: 'ASSINATURAS', bold: true, gap: true },
        { text: `Responsável: ${responsibleName.trim() || '________________________________________'}` },
        { text: `Cliente: ${clientName.trim() || '________________________________________'}` },
        { text: 'Área preparada para assinatura digital. A integração com a plataforma de assinatura será vinculada a este documento.' },
        { text: 'Documento gerado pelo FIO. Versões já emitidas não são alteradas.' }
      );

      const title = baseDocumentTitle || `${reportTypeLabel(reportType)} · ${work.code}`;
      const fileName = `${fileNamePart(reportTypeLabel(reportType))}-${fileNamePart(work.code)}-${Date.now()}.pdf`;
      const pdf = makePdf(lines, options.photos ? pdfPhotos : []);
      const documentVisibility = visibility === 'shared' ? 'fio_general' : 'professionals';
      let targetDocumentId = baseDocumentId ?? null;
      if (!targetDocumentId) {
        const { data: createdId, error: documentError } = await supabase.rpc('create_work_report_document', {
          p_work_id: work.id,
          p_title: title,
          p_description: `${reportTypeLabel(reportType)} gerado em ${generatedAt}. Assinaturas preparadas.`,
          p_report_type: reportType,
          p_visibility: documentVisibility,
          p_allow_download: true,
        });
        if (documentError) throw documentError;
        documentId = createdId as string;
        targetDocumentId = documentId;
      }
      storagePath = `${work.id}/${targetDocumentId}/${Date.now()}-${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('work-documents')
        .upload(storagePath, pdf.buffer, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: versionError } = await supabase.rpc('add_work_document_version', {
        p_document_id: targetDocumentId,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: 'application/pdf',
        p_size_bytes: pdf.byteLength,
      });
      if (versionError) throw versionError;

      Alert.alert(
        baseDocumentId ? 'Nova versão salva' : 'Relatório salvo',
        'O PDF foi salvo em Documentos e registrado no FIO/Diário.'
      );
      onGenerated?.();
      onClose();
    } catch (error) {
      if (storagePath) await supabase.storage.from('work-documents').remove([storagePath]);
      if (documentId) await supabase.rpc('archive_work_document', { p_document_id: documentId });
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar o relatório.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}><Ionicons name="document-text-outline" size={22} color={FioColors.green} /></View>
            <View style={styles.headerText}>
              <Text style={styles.title}>Gerar relatório</Text>
              <Text style={styles.subtitle}>O PDF será salvo em Documentos e aparecerá no FIO.</Text>
            </View>
            <Pressable style={styles.close} onPress={onClose} disabled={saving}><Ionicons name="close-outline" size={24} color={FioColors.text} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>TIPO DE RELATÓRIO</Text>
            {REPORT_TYPES.filter((item) => canManage || item.value !== 'complete').map((item) => {
              return <Pressable key={item.value} disabled={saving || Boolean(baseDocumentId)} style={[styles.typeOption, reportType === item.value && styles.typeOptionActive, Boolean(baseDocumentId) && styles.typeOptionDisabled]} onPress={() => setReportType(item.value)}>
                <Ionicons name={reportType === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={reportType === item.value ? FioColors.green : FioColors.textSoft} />
                <View style={styles.typeText}><Text style={styles.typeTitle}>{item.label}</Text><Text style={styles.typeDetail}>{item.detail}</Text></View>
              </Pressable>;
            })}

            <Text style={styles.label}>INCLUIR NO PDF</Text>
            {([
              ['work', 'Dados e status da obra'],
              ['environments', 'Ambientes'],
              ['delivery', 'Checklist de entrega'],
              ['photos', 'Fotos registradas (quantidade e relação)'],
              ['pending', 'Pendências'],
              ['diary', 'FIO / Diário'],
            ] as [keyof ReportOptions, string][]).map(([key, label]) => <View key={key} style={styles.switchRow}><Text style={styles.switchText}>{label}</Text><Switch value={options[key]} onValueChange={(value) => setOption(key, value)} disabled={saving} trackColor={{ false: FioColors.lineStrong, true: FioColors.green }} /></View>)}

            <Text style={styles.label}>VISIBILIDADE</Text>
            <View style={styles.visibilityRow}>
              {(['internal', 'shared'] as ReportVisibility[]).map((item) => <Pressable key={item} disabled={saving || Boolean(baseDocumentId)} style={[styles.visibilityOption, visibility === item && styles.visibilityOptionActive, Boolean(baseDocumentId) && styles.typeOptionDisabled]} onPress={() => setVisibility(item)}><Ionicons name={visibility === item ? 'radio-button-on' : 'radio-button-off'} size={18} color={visibility === item ? FioColors.green : FioColors.textSoft} /><Text style={styles.visibilityText}>{item === 'internal' ? 'Interno' : 'Compartilhado'}</Text></Pressable>)}
            </View>
            {baseDocumentId && (
              <Text style={styles.signatureNote}>A nova versão mantém o tipo e a visibilidade do relatório emitido.</Text>
            )}

            <Text style={styles.label}>ASSINATURAS</Text>
            <TextInput style={styles.input} placeholder="Responsável pela obra" placeholderTextColor={FioColors.textSoft} value={responsibleName} onChangeText={setResponsibleName} editable={!saving} />
            <TextInput style={styles.input} placeholder="Cliente" placeholderTextColor={FioColors.textSoft} value={clientName} onChangeText={setClientName} editable={!saving} />
            <Text style={styles.signatureNote}>Os campos deixam o PDF pronto para a futura assinatura digital. O conteúdo emitido não é alterado.</Text>
            {!!message && <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>}
            <Pressable style={[styles.generate, saving && styles.generateDisabled]} onPress={generate} disabled={saving || !canWrite}>
              {saving ? <ActivityIndicator color={FioColors.textOnAccent} /> : <Ionicons name="document-text-outline" size={20} color={FioColors.textOnAccent} />}
              <Text style={styles.generateText}>{saving ? 'Gerando PDF...' : baseDocumentId ? 'Gerar nova versão' : 'Gerar e salvar PDF'}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8, 16, 15, 0.66)' },
  card: { maxHeight: '93%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: FioColors.surface },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: FioColors.line },
  headerIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: FioColors.greenSoft },
  headerText: { flex: 1, minWidth: 0 }, title: { fontSize: 16, fontWeight: '900', color: FioColors.text }, subtitle: { marginTop: 2, fontSize: 10, lineHeight: 14, color: FioColors.textMuted },
  close: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }, content: { padding: 16, paddingBottom: 28 },
  label: { marginTop: 12, marginBottom: 7, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: FioColors.textMuted },
  typeOption: { minHeight: 58, marginBottom: 7, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium },
  typeOptionActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft }, typeOptionDisabled: { opacity: 0.5 }, typeText: { flex: 1 }, typeTitle: { fontSize: 12, fontWeight: '800', color: FioColors.text }, typeDetail: { marginTop: 2, fontSize: 9, color: FioColors.textMuted },
  switchRow: { minHeight: 47, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: FioColors.line }, switchText: { flex: 1, fontSize: 11, color: FioColors.text },
  visibilityRow: { flexDirection: 'row', gap: 8 }, visibilityOption: { flex: 1, minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium }, visibilityOptionActive: { borderColor: FioColors.green, backgroundColor: FioColors.greenSoft }, visibilityText: { fontSize: 11, fontWeight: '800', color: FioColors.text },
  input: { minHeight: 45, marginBottom: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, color: FioColors.text, backgroundColor: FioColors.surfaceRaised }, signatureNote: { fontSize: 10, lineHeight: 14, color: FioColors.textMuted },
  message: { marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: FioColors.orangeSoft }, messageText: { fontSize: 10, color: FioColors.text }, generate: { minHeight: 52, marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: FioRadius.medium, backgroundColor: FioColors.green }, generateDisabled: { opacity: 0.65 }, generateText: { fontSize: 12, fontWeight: '900', color: FioColors.textOnAccent },
});
