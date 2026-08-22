import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type Tool = 'measurement' | 'point' | 'text' | 'delete' | 'moveStart' | 'moveEnd' | 'moveItem';

type MeasurementPhoto = {
  id: string;
  work_id: string;
  environment_id: string;
  photo_id: string;
  work_photos?: { storage_path: string; file_name: string | null } | null;
  environments?: { name: string | null } | null;
};

type RawMeasurementPhoto = Omit<MeasurementPhoto, 'work_photos' | 'environments'> & {
  work_photos?: { storage_path: string; file_name: string | null }[] | { storage_path: string; file_name: string | null } | null;
  environments?: { name: string | null }[] | { name: string | null } | null;
};

type AnnotationType = 'measurement' | 'point' | 'text';

type Annotation = {
  id: string;
  measurement_photo_id: string;
  type: AnnotationType;
  start_x: number;
  start_y: number;
  end_x: number | null;
  end_y: number | null;
  value_mm: number | null;
  marker_type: MarkerType | null;
  text: string | null;
  source: 'manual' | 'lidar' | 'ai';
  confirmed: boolean;
};

type MarkerType =
  | 'outlet'
  | 'switch'
  | 'hydraulic'
  | 'gas'
  | 'valve'
  | 'door'
  | 'window'
  | 'furniture_start'
  | 'furniture_end'
  | 'other';

const TOOLS: { key: Tool; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'measurement', label: 'Medida', icon: 'resize-outline' },
  { key: 'point', label: 'Ponto', icon: 'locate-outline' },
  { key: 'text', label: 'Texto', icon: 'text-outline' },
  { key: 'delete', label: 'Excluir', icon: 'trash-outline' },
];

const MARKERS: { key: MarkerType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'outlet', label: 'Tomada', icon: 'flash-outline' },
  { key: 'switch', label: 'Interruptor', icon: 'toggle-outline' },
  { key: 'hydraulic', label: 'Hidráulica', icon: 'water-outline' },
  { key: 'gas', label: 'Gás', icon: 'flame-outline' },
  { key: 'valve', label: 'Registro', icon: 'radio-button-on-outline' },
  { key: 'door', label: 'Porta', icon: 'enter-outline' },
  { key: 'window', label: 'Janela', icon: 'albums-outline' },
  { key: 'furniture_start', label: 'Início móvel', icon: 'play-outline' },
  { key: 'furniture_end', label: 'Final móvel', icon: 'stop-outline' },
  { key: 'other', label: 'Outro', icon: 'ellipse-outline' },
];

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function markerLabel(value: MarkerType | null) {
  return MARKERS.find((marker) => marker.key === value)?.label ?? 'Ponto';
}

export default function MeasurementEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photo, setPhoto] = useState<MeasurementPhoto | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tool, setTool] = useState<Tool>('measurement');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState<{ x: number; y: number } | null>(null);
  const [canvas, setCanvas] = useState({ width: 1, height: 1 });
  const [imageRatio, setImageRatio] = useState(1);
  const [valueModal, setValueModal] = useState(false);
  const [textModal, setTextModal] = useState(false);
  const [markerModal, setMarkerModal] = useState(false);
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number } | null>(null);
  const [pendingEnd, setPendingEnd] = useState<{ x: number; y: number } | null>(null);
  const [inputValue, setInputValue] = useState('');

  const { canWrite, isViewer, loadingAccess } = useWorkAccess(photo?.work_id);

  const selected = useMemo(
    () => annotations.find((annotation) => annotation.id === selectedId) ?? null,
    [annotations, selectedId]
  );

  const loadData = useCallback(async () => {
    if (!id) {
      setMessage('Medição não encontrada.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const photoResult = await supabase
        .from('work_measurement_photos')
        .select(`
          id,
          work_id,
          environment_id,
          photo_id,
          work_photos:photo_id(storage_path, file_name),
          environments:environment_id(name)
        `)
        .eq('id', id)
        .maybeSingle();

      if (photoResult.error) throw photoResult.error;
      if (!photoResult.data) throw new Error('Medição não encontrada.');

      const rawPhoto = photoResult.data as RawMeasurementPhoto;
      const loadedPhoto: MeasurementPhoto = {
        ...rawPhoto,
        work_photos: Array.isArray(rawPhoto.work_photos)
          ? rawPhoto.work_photos[0] ?? null
          : rawPhoto.work_photos ?? null,
        environments: Array.isArray(rawPhoto.environments)
          ? rawPhoto.environments[0] ?? null
          : rawPhoto.environments ?? null,
      };
      setPhoto(loadedPhoto);

      const storagePath = loadedPhoto.work_photos?.storage_path;
      if (storagePath) {
        const { data } = await supabase.storage
          .from('work-photos')
          .createSignedUrl(storagePath, 60 * 60);
        setSignedUrl(data?.signedUrl ?? null);
        if (data?.signedUrl) {
          Image.getSize(
            data.signedUrl,
            (width, height) => setImageRatio(width / Math.max(height, 1)),
            () => setImageRatio(1)
          );
        }
      }

      const annotationsResult = await supabase
        .from('work_measurement_annotations')
        .select('*')
        .eq('measurement_photo_id', loadedPhoto.id)
        .order('created_at', { ascending: true });

      if (annotationsResult.error) throw annotationsResult.error;

      setAnnotations(
        ((annotationsResult.data ?? []) as Annotation[]).map((annotation) => ({
          ...annotation,
          start_x: toNumber(annotation.start_x),
          start_y: toNumber(annotation.start_y),
          end_x: annotation.end_x === null ? null : toNumber(annotation.end_x),
          end_y: annotation.end_y === null ? null : toNumber(annotation.end_y),
        }))
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a medição.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  function pointFromEvent(event: NativeSyntheticEvent<{ locationX: number; locationY: number }>) {
    return {
      x: clamp(event.nativeEvent.locationX / canvas.width),
      y: clamp(event.nativeEvent.locationY / canvas.height),
    };
  }

  async function insertAnnotation(payload: Partial<Annotation>) {
    if (!photo || !canWrite || saving) return;

    setSaving(true);
    setMessage('');

    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('work_measurement_annotations')
        .insert({
          measurement_photo_id: photo.id,
          source: 'manual',
          confirmed: true,
          created_by: userData.user?.id ?? null,
          ...payload,
        })
        .select('*')
        .single();

      if (error) throw error;

      const created = {
        ...(data as Annotation),
        start_x: toNumber((data as Annotation).start_x),
        start_y: toNumber((data as Annotation).start_y),
        end_x: (data as Annotation).end_x === null ? null : toNumber((data as Annotation).end_x),
        end_y: (data as Annotation).end_y === null ? null : toNumber((data as Annotation).end_y),
      };
      setAnnotations((current) => [...current, created]);
      setSelectedId(created.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar a marcação.');
    } finally {
      setSaving(false);
    }
  }

  async function updateAnnotation(annotationId: string, payload: Partial<Annotation>) {
    if (!canWrite || saving) return;

    setSaving(true);
    setMessage('');

    try {
      const { data, error } = await supabase
        .from('work_measurement_annotations')
        .update(payload)
        .eq('id', annotationId)
        .select('*')
        .single();

      if (error) throw error;

      const updated = data as Annotation;
      setAnnotations((current) =>
        current.map((annotation) =>
          annotation.id === annotationId
            ? {
                ...updated,
                start_x: toNumber(updated.start_x),
                start_y: toNumber(updated.start_y),
                end_x: updated.end_x === null ? null : toNumber(updated.end_x),
                end_y: updated.end_y === null ? null : toNumber(updated.end_y),
              }
            : annotation
        )
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnotation(annotationId: string) {
    if (!canWrite || saving) return;

    setSaving(true);
    setMessage('');

    try {
      const { error } = await supabase
        .from('work_measurement_annotations')
        .delete()
        .eq('id', annotationId);

      if (error) throw error;
      setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
      setSelectedId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível excluir.');
    } finally {
      setSaving(false);
    }
  }

  function handleCanvasPress(event: NativeSyntheticEvent<{ locationX: number; locationY: number }>) {
    if (!canWrite || saving) return;
    const point = pointFromEvent(event);

    if (tool === 'measurement') {
      if (!draftStart) {
        setDraftStart(point);
        setMessage('Toque no segundo ponto da medida.');
        return;
      }

      setPendingPoint(draftStart);
      setPendingEnd(point);
      setInputValue('');
      setValueModal(true);
      setDraftStart(null);
      setMessage('');
      return;
    }

    if (tool === 'point') {
      setPendingPoint(point);
      setMarkerModal(true);
      return;
    }

    if (tool === 'text') {
      setPendingPoint(point);
      setInputValue('');
      setTextModal(true);
      return;
    }

    if (selected && tool === 'moveStart') {
      void updateAnnotation(selected.id, { start_x: point.x, start_y: point.y });
      setTool('measurement');
      return;
    }

    if (selected && tool === 'moveEnd') {
      void updateAnnotation(selected.id, { end_x: point.x, end_y: point.y });
      setTool('measurement');
      return;
    }

    if (selected && tool === 'moveItem') {
      void updateAnnotation(selected.id, { start_x: point.x, start_y: point.y });
      setTool(selected.type);
    }
  }

  function createMeasurement() {
    const value = Number(inputValue.replace(/\D/g, ''));
    if (!pendingPoint || !pendingEnd || !value) return;
    setValueModal(false);
    void insertAnnotation({
      type: 'measurement',
      start_x: pendingPoint.x,
      start_y: pendingPoint.y,
      end_x: pendingEnd.x,
      end_y: pendingEnd.y,
      value_mm: value,
    });
    setPendingPoint(null);
    setPendingEnd(null);
  }

  function createText() {
    const text = inputValue.trim();
    if (!pendingPoint || !text) return;
    setTextModal(false);
    void insertAnnotation({
      type: 'text',
      start_x: pendingPoint.x,
      start_y: pendingPoint.y,
      text,
    });
    setPendingPoint(null);
  }

  function createMarker(markerType: MarkerType) {
    if (!pendingPoint) return;
    setMarkerModal(false);
    void insertAnnotation({
      type: 'point',
      start_x: pendingPoint.x,
      start_y: pendingPoint.y,
      marker_type: markerType,
    });
    setPendingPoint(null);
  }

  function editSelectedValue() {
    if (!selected) return;
    if (selected.type === 'measurement') {
      setInputValue(String(selected.value_mm ?? ''));
      setValueModal(true);
      setPendingPoint({ x: selected.start_x, y: selected.start_y });
      setPendingEnd({ x: selected.end_x ?? selected.start_x, y: selected.end_y ?? selected.start_y });
    } else if (selected.type === 'text') {
      setInputValue(selected.text ?? '');
      setTextModal(true);
      setPendingPoint({ x: selected.start_x, y: selected.start_y });
    } else {
      setMarkerModal(true);
      setPendingPoint({ x: selected.start_x, y: selected.start_y });
    }
  }

  function updateSelectedValue() {
    if (!selected) return;
    if (selected.type === 'measurement') {
      const value = Number(inputValue.replace(/\D/g, ''));
      if (!value) return;
      setValueModal(false);
      void updateAnnotation(selected.id, { value_mm: value });
    } else if (selected.type === 'text') {
      const text = inputValue.trim();
      if (!text) return;
      setTextModal(false);
      void updateAnnotation(selected.id, { text });
    }
  }

  if (loading || loadingAccess) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={FioColors.gold} />
        <Text style={styles.muted}>Abrindo editor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow={photo?.environments?.name ?? 'Ambiente'}
        title="Editar medições"
        subtitle={isViewer ? 'Somente visualização' : saving ? 'Salvando...' : 'Manual'}
        actionIcon="refresh-outline"
        actionLabel="Atualizar"
        onAction={loadData}
      />

      <ScrollView contentContainerStyle={styles.content} maximumZoomScale={3} minimumZoomScale={1}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back-outline" size={19} color={FioColors.green} />
          <Text style={styles.backText}>Voltar às medições</Text>
        </Pressable>

        <View style={styles.toolbar}>
          {TOOLS.map((item) => (
            <Pressable
              key={item.key}
              style={[styles.toolButton, tool === item.key && styles.toolButtonActive]}
              onPress={() => {
                setTool(item.key);
                setDraftStart(null);
                setMessage('');
              }}
              disabled={!canWrite}
            >
              <Ionicons
                name={item.icon}
                size={17}
                color={tool === item.key ? FioColors.textOnAccent : FioColors.textMuted}
              />
              <Text style={[styles.toolText, tool === item.key && styles.toolTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          style={[
            styles.canvas,
            { aspectRatio: imageRatio },
          ]}
          onLayout={(event) => setCanvas(event.nativeEvent.layout)}
          onPress={handleCanvasPress}
        >
          {signedUrl ? (
            <Image source={{ uri: signedUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          ) : (
            <View style={styles.noImage}>
              <Ionicons name="image-outline" size={30} color={FioColors.textMuted} />
              <Text style={styles.muted}>Imagem indisponível.</Text>
            </View>
          )}

          <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
            {annotations.map((annotation) => {
              const x = annotation.start_x * canvas.width;
              const y = annotation.start_y * canvas.height;
              const selectedAnnotation = annotation.id === selectedId;

              if (annotation.type === 'measurement') {
                const x2 = (annotation.end_x ?? annotation.start_x) * canvas.width;
                const y2 = (annotation.end_y ?? annotation.start_y) * canvas.height;
                return (
                  <G key={annotation.id}>
                    <Line x1={x} y1={y} x2={x2} y2={y2} stroke={selectedAnnotation ? FioColors.orange : FioColors.green} strokeWidth={4} />
                    <Circle cx={x} cy={y} r={9} fill={selectedAnnotation ? FioColors.orange : FioColors.green} />
                    <Circle cx={x2} cy={y2} r={9} fill={selectedAnnotation ? FioColors.orange : FioColors.green} />
                    <SvgText
                      x={(x + x2) / 2}
                      y={(y + y2) / 2 - 9}
                      fill={FioColors.white}
                      stroke={FioColors.canvas}
                      strokeWidth={0.8}
                      fontSize={15}
                      fontWeight="900"
                      textAnchor="middle"
                    >
                      {annotation.value_mm ? `${annotation.value_mm} mm` : 'mm'}
                    </SvgText>
                  </G>
                );
              }

              if (annotation.type === 'point') {
                return (
                  <G key={annotation.id}>
                    <Circle cx={x} cy={y} r={13} fill={selectedAnnotation ? FioColors.orange : FioColors.gold} />
                    <SvgText x={x} y={y + 4} fill={FioColors.textOnAccent} fontSize={12} fontWeight="900" textAnchor="middle">
                      +
                    </SvgText>
                  </G>
                );
              }

              return (
                <SvgText
                  key={annotation.id}
                  x={x}
                  y={y}
                  fill={selectedAnnotation ? FioColors.orange : FioColors.white}
                  stroke={FioColors.canvas}
                  strokeWidth={0.8}
                  fontSize={14}
                  fontWeight="900"
                >
                  {annotation.text}
                </SvgText>
              );
            })}

            {draftStart && (
              <Circle cx={draftStart.x * canvas.width} cy={draftStart.y * canvas.height} r={10} fill={FioColors.orange} />
            )}
          </Svg>
        </Pressable>

        <Text style={styles.helpText}>
          {canWrite
            ? tool === 'measurement'
              ? 'Toque no início e depois no fim da medida.'
              : tool === 'delete'
                ? 'Selecione uma marcação abaixo e confirme excluir.'
                : 'Toque na foto para adicionar.'
            : 'Visualização liberada. Edição bloqueada para este perfil.'}
        </Text>

        {selected && (
          <View style={styles.selectedPanel}>
            <Text style={styles.selectedTitle}>
              {selected.type === 'measurement'
                ? `${selected.value_mm ?? ''} mm`
                : selected.type === 'point'
                  ? markerLabel(selected.marker_type)
                  : selected.text}
            </Text>
            {canWrite && (
              <View style={styles.selectedActions}>
                <Pressable style={styles.smallButton} onPress={editSelectedValue}>
                  <Text style={styles.smallButtonText}>Editar</Text>
                </Pressable>
                {selected.type === 'measurement' ? (
                  <>
                    <Pressable style={styles.smallButton} onPress={() => setTool('moveStart')}>
                      <Text style={styles.smallButtonText}>Mover início</Text>
                    </Pressable>
                    <Pressable style={styles.smallButton} onPress={() => setTool('moveEnd')}>
                      <Text style={styles.smallButtonText}>Mover fim</Text>
                    </Pressable>
                  </>
                ) : (
                  <Pressable style={styles.smallButton} onPress={() => setTool('moveItem')}>
                    <Text style={styles.smallButtonText}>Mover</Text>
                  </Pressable>
                )}
                <Pressable
                  style={[styles.smallButton, styles.deleteButton]}
                  onPress={() =>
                    Alert.alert('Excluir marcação?', 'A marcação será removida da foto.', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Excluir', style: 'destructive', onPress: () => deleteAnnotation(selected.id) },
                    ])
                  }
                >
                  <Text style={styles.deleteButtonText}>Excluir</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        <Text style={styles.sectionTitle}>Marcações</Text>
        {annotations.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma marcação nesta foto.</Text>
        ) : (
          annotations.map((annotation) => (
            <Pressable
              key={annotation.id}
              style={[styles.annotationRow, annotation.id === selectedId && styles.annotationRowActive]}
              onPress={() => setSelectedId(annotation.id)}
            >
              <Ionicons
                name={
                  annotation.type === 'measurement'
                    ? 'resize-outline'
                    : annotation.type === 'point'
                      ? 'locate-outline'
                      : 'text-outline'
                }
                size={17}
                color={annotation.id === selectedId ? FioColors.textOnAccent : FioColors.green}
              />
              <Text style={[styles.annotationText, annotation.id === selectedId && styles.annotationTextActive]}>
                {annotation.type === 'measurement'
                  ? `${annotation.value_mm ?? 0} mm`
                  : annotation.type === 'point'
                    ? markerLabel(annotation.marker_type)
                    : annotation.text}
              </Text>
            </Pressable>
          ))
        )}

        {!!message && <Text style={styles.errorText}>{message}</Text>}
      </ScrollView>

      <Modal visible={valueModal} transparent animationType="fade" onRequestClose={() => setValueModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Medida em milímetros</Text>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              keyboardType="number-pad"
              placeholder="2430"
              placeholderTextColor={FioColors.textSoft}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setValueModal(false)}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={selected?.type === 'measurement' ? updateSelectedValue : createMeasurement}>
                <Text style={styles.primaryButtonText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Observação curta</Text>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="conferir com projeto"
              placeholderTextColor={FioColors.textSoft}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setTextModal(false)}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={selected?.type === 'text' ? updateSelectedValue : createText}>
                <Text style={styles.primaryButtonText}>Salvar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={markerModal} transparent animationType="fade" onRequestClose={() => setMarkerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Tipo de ponto</Text>
            <View style={styles.markerGrid}>
              {MARKERS.map((marker) => (
                <Pressable
                  key={marker.key}
                  style={styles.markerButton}
                  onPress={() => {
                    if (selected?.type === 'point') {
                      setMarkerModal(false);
                      void updateAnnotation(selected.id, { marker_type: marker.key });
                    } else {
                      createMarker(marker.key);
                    }
                  }}
                >
                  <Ionicons name={marker.icon} size={17} color={FioColors.green} />
                  <Text style={styles.markerText}>{marker.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: FioColors.canvas },
  muted: { fontSize: 12, color: FioColors.textMuted },
  content: { width: '100%', maxWidth: 980, alignSelf: 'center', padding: 10, paddingBottom: 90 },
  backButton: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 12, fontWeight: '900', color: FioColors.green },
  toolbar: { flexDirection: 'row', gap: 7, marginBottom: 9 },
  toolButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  toolButtonActive: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  toolText: { fontSize: 8, fontWeight: '900', color: FioColors.textMuted },
  toolTextActive: { color: FioColors.textOnAccent },
  canvas: { width: '100%', minHeight: 260, overflow: 'hidden', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: '#141714' },
  noImage: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8 },
  helpText: { marginTop: 8, fontSize: 10, color: FioColors.textMuted },
  selectedPanel: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: FioColors.green, borderRadius: 13, backgroundColor: FioColors.greenSoft },
  selectedTitle: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  selectedActions: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  smallButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  deleteButton: { borderColor: FioColors.danger, backgroundColor: FioColors.dangerSoft },
  deleteButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.danger },
  sectionTitle: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: '900', color: FioColors.text },
  emptyText: { fontSize: 10, color: FioColors.textMuted },
  annotationRow: { minHeight: 44, marginBottom: 7, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  annotationRowActive: { borderColor: FioColors.orange, backgroundColor: FioColors.orangeSoft },
  annotationText: { flex: 1, fontSize: 11, fontWeight: '800', color: FioColors.text },
  annotationTextActive: { color: FioColors.text },
  errorText: { marginTop: 10, fontSize: 11, lineHeight: 17, color: FioColors.danger },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.62)' },
  modalCard: { padding: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  modalTitle: { fontSize: 15, fontWeight: '900', color: FioColors.text },
  input: { minHeight: 48, marginTop: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, color: FioColors.text, backgroundColor: FioColors.surfaceRaised },
  modalActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  primaryButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.green },
  primaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.textOnAccent },
  secondaryButton: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  secondaryButtonText: { fontSize: 11, fontWeight: '900', color: FioColors.green },
  markerGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  markerButton: { minHeight: 46, flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surfaceRaised },
  markerText: { flex: 1, fontSize: 10, fontWeight: '800', color: FioColors.text },
});
