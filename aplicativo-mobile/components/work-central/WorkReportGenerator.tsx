import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
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

type ReportType = 'daily' | 'delivery' | 'complete';
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

function makePdf(lines: { text: string; bold?: boolean; gap?: boolean }[]) {
  const pages: string[][] = [[]];
  let y = 792;
  const add = (text: string, bold = false, gap = false) => {
    const fontSize = bold ? 11 : 9;
    const required = (gap ? 8 : 0) + fontSize + 5;
    if (y - required < 48) {
      pages.push([]);
      y = 792;
    }
    if (gap) y -= 8;
    y -= fontSize + 5;
    pages[pages.length - 1].push(
      `BT /F${bold ? 2 : 1} ${fontSize} Tf 44 ${y} Td (${safePdfText(text)}) Tj ET`
    );
  };

  lines.forEach((line) => {
    wrapText(line.text, line.bold ? 66 : 86).forEach((text, index) =>
      add(text, line.bold, line.gap && index === 0)
    );
  });

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((page, index) => {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    const content = page.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
    );
  });

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Uint8Array.from(Array.from(pdf, (char) => char.charCodeAt(0) & 0xff));
}

function fileNamePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();
}

export function WorkReportGenerator({
  visible,
  onClose,
  work,
  environments,
  participants,
  canWrite,
  canManage,
  onGenerated,
}: {
  visible: boolean;
  onClose: () => void;
  work: Work;
  environments: WorkEnvironment[];
  participants: WorkParticipant[];
  canWrite: boolean;
  canManage: boolean;
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

  function setOption(option: keyof ReportOptions, value: boolean) {
    setOptions((current) => ({ ...current, [option]: value }));
  }

  async function generate() {
    if (!canWrite || saving) return;
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
              .select('environment_id, photo_type, visibility')
              .eq('work_id', work.id)
              .eq('collection', 'work')
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
      const photos = (photoResult.data ?? []) as {
        environment_id: string | null;
        photo_type: string;
        visibility: string;
      }[];
      const diary = (timelineResult.data ?? []) as TimelineItem[];
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
        const sharedPhotos = photos.filter((photo) => photo.visibility === 'shared');
        const finalPhotos = photos.filter((photo) => photo.photo_type === 'delivery_final');
        lines.push({ text: `${photos.length} fotos no total · ${finalPhotos.length} fotos finais · ${sharedPhotos.length} fotos compartilhadas.` });
        environments.forEach((item) => {
          const count = photos.filter((photo) => photo.environment_id === item.id).length;
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
        if (!diary.length) lines.push({ text: 'Nenhum registro no FIO.' });
        diary.slice(0, 80).forEach((item) => {
          lines.push({ text: `${dateLabel(item.created_at)} · ${item.environment_name ?? 'Geral'} · ${item.title ?? item.event_type ?? 'Registro'}${item.description ? ` — ${item.description}` : ''}` });
        });
        if (diary.length > 80) lines.push({ text: `Histórico resumido: ${diary.length - 80} registros adicionais disponíveis no FIO.` });
      }
      lines.push(
        { text: 'ASSINATURAS', bold: true, gap: true },
        { text: `Responsável: ${responsibleName.trim() || '________________________________________'}` },
        { text: `Cliente: ${clientName.trim() || '________________________________________'}` },
        { text: 'Área preparada para assinatura digital. A integração com a plataforma de assinatura será vinculada a este documento.' },
        { text: 'Documento gerado pelo FIO. Versões já emitidas não são alteradas.' }
      );

      const title = `${reportTypeLabel(reportType)} · ${work.code}`;
      const fileName = `${fileNamePart(reportTypeLabel(reportType))}-${fileNamePart(work.code)}-${Date.now()}.pdf`;
      const pdf = makePdf(lines);
      const documentVisibility = visibility === 'shared' ? 'fio_general' : 'professionals';
      const { data: createdId, error: documentError } = await supabase.rpc('create_work_document', {
        p_work_id: work.id,
        p_environment_id: null,
        p_owner_company_id: null,
        p_title: title,
        p_description: `${reportTypeLabel(reportType)} gerado em ${generatedAt}. Assinaturas preparadas.`,
        p_category: 'report',
        p_visibility: documentVisibility,
        p_allow_download: true,
      });
      if (documentError) throw documentError;
      documentId = createdId as string;
      storagePath = `${work.id}/${documentId}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('work-documents')
        .upload(storagePath, pdf.buffer, {
          contentType: 'application/pdf',
          cacheControl: '3600',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { error: versionError } = await supabase.rpc('add_work_document_version', {
        p_document_id: documentId,
        p_storage_path: storagePath,
        p_file_name: fileName,
        p_mime_type: 'application/pdf',
        p_size_bytes: pdf.byteLength,
      });
      if (versionError) throw versionError;

      Alert.alert('Relatório salvo', 'O PDF foi salvo em Documentos e registrado no FIO/Diário.');
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
            {REPORT_TYPES.map((item) => {
              const disabled = item.value === 'complete' && !canManage;
              return <Pressable key={item.value} disabled={disabled || saving} style={[styles.typeOption, reportType === item.value && styles.typeOptionActive, disabled && styles.typeOptionDisabled]} onPress={() => setReportType(item.value)}>
                <Ionicons name={reportType === item.value ? 'radio-button-on' : 'radio-button-off'} size={20} color={reportType === item.value ? FioColors.green : FioColors.textSoft} />
                <View style={styles.typeText}><Text style={styles.typeTitle}>{item.label}</Text><Text style={styles.typeDetail}>{disabled ? 'Disponível para proprietário ou gestor.' : item.detail}</Text></View>
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
              {(['internal', 'shared'] as ReportVisibility[]).map((item) => <Pressable key={item} disabled={saving} style={[styles.visibilityOption, visibility === item && styles.visibilityOptionActive]} onPress={() => setVisibility(item)}><Ionicons name={visibility === item ? 'radio-button-on' : 'radio-button-off'} size={18} color={visibility === item ? FioColors.green : FioColors.textSoft} /><Text style={styles.visibilityText}>{item === 'internal' ? 'Interno' : 'Compartilhado'}</Text></Pressable>)}
            </View>

            <Text style={styles.label}>ASSINATURAS</Text>
            <TextInput style={styles.input} placeholder="Responsável pela obra" placeholderTextColor={FioColors.textSoft} value={responsibleName} onChangeText={setResponsibleName} editable={!saving} />
            <TextInput style={styles.input} placeholder="Cliente" placeholderTextColor={FioColors.textSoft} value={clientName} onChangeText={setClientName} editable={!saving} />
            <Text style={styles.signatureNote}>Os campos deixam o PDF pronto para a futura assinatura digital. O conteúdo emitido não é alterado.</Text>
            {!!message && <View style={styles.message}><Text style={styles.messageText}>{message}</Text></View>}
            <Pressable style={[styles.generate, saving && styles.generateDisabled]} onPress={generate} disabled={saving || !canWrite}>
              {saving ? <ActivityIndicator color={FioColors.textOnAccent} /> : <Ionicons name="document-text-outline" size={20} color={FioColors.textOnAccent} />}
              <Text style={styles.generateText}>{saving ? 'Gerando PDF...' : 'Gerar e salvar PDF'}</Text>
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
