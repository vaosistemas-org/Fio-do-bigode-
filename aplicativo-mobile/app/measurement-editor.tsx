import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image as NativeImage,
  Modal,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { useWorkAccess } from '@/hooks/use-work-access';
import { supabase } from '@/lib/supabase';

type Tool = 'measurement' | 'point' | 'text' | 'delete' | 'moveStart' | 'moveEnd' | 'moveItem';
type MeasurementMode = 'confirmEach' | 'markFirst';
type ModalMode = 'createMeasurement' | 'editMeasurement' | 'createText' | 'editText' | 'pointDetails' | 'openingDetails';

type MeasurementPhoto = {
  id: string;
  work_id: string;
  environment_id: string;
  photo_id: string;
  work_photos?: { storage_path: string; file_name: string | null } | null;
  environments?: { name: string | null } | null;
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
  floor_height_mm: number | null;
  reference_distance_mm: number | null;
  inner_width_mm: number | null;
  inner_height_mm: number | null;
  reference_left_mm: number | null;
  reference_right_mm: number | null;
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

function keepInside(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function toNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function markerLabel(value: MarkerType | null) {
  return MARKERS.find((marker) => marker.key === value)?.label ?? 'Ponto';
}

function markerIcon(value: MarkerType | null): keyof typeof Ionicons.glyphMap {
  return MARKERS.find((marker) => marker.key === value)?.icon ?? 'ellipse-outline';
}

function isOpening(value: MarkerType | null) {
  return value === 'door' || value === 'window';
}

function pointDetailsLabel(annotation: Annotation) {
  const base = markerLabel(annotation.marker_type);
  if (isOpening(annotation.marker_type)) {
    return `${base} · ${annotation.inner_width_mm ?? '?'} × ${annotation.inner_height_mm ?? '?'} mm`;
  }
  if (annotation.floor_height_mm !== null || annotation.reference_distance_mm !== null) {
    return `${base} · altura ${annotation.floor_height_mm ?? '?'} mm · ref. ${annotation.reference_distance_mm ?? '?'} mm`;
  }
  return base;
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export default function MeasurementEditorScreen() {
  const router = useRouter();
  const window = useWindowDimensions();
  const isLandscape = window.width > window.height;
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const [photo, setPhoto] = useState<MeasurementPhoto | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const [tool, setTool] = useState<Tool>('measurement');
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>('confirmEach');
  const [fullScreen, setFullScreen] = useState(false);
  const [editing, setEditing] = useState(mode === 'edit');
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
  const [floorHeight, setFloorHeight] = useState('');
  const [referenceDistance, setReferenceDistance] = useState('');
  const [innerWidth, setInnerWidth] = useState('');
  const [innerHeight, setInnerHeight] = useState('');
  const [referenceLeft, setReferenceLeft] = useState('');
  const [referenceRight, setReferenceRight] = useState('');
  const [pendingOpening, setPendingOpening] = useState<MarkerType | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>('createMeasurement');

  const { canWrite, isViewer, loadingAccess } = useWorkAccess(photo?.work_id);
  const canEdit = canWrite && editing;

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
    setPhotoReady(false);

    try {
      const photoResult = await supabase
        .from('work_measurement_photos')
        .select('id, work_id, environment_id, photo_id')
        .eq('id', id)
        .maybeSingle();

      if (photoResult.error) throw photoResult.error;
      if (!photoResult.data) throw new Error('Medição não encontrada.');

      const basePhoto = photoResult.data as MeasurementPhoto;
      const [workPhotoResult, environmentResult] = await Promise.all([
        supabase.from('work_photos').select('storage_path, file_name').eq('id', basePhoto.photo_id).maybeSingle(),
        supabase.from('environments').select('name').eq('id', basePhoto.environment_id).maybeSingle(),
      ]);
      if (workPhotoResult.error) throw workPhotoResult.error;
      if (environmentResult.error) throw environmentResult.error;

      const loadedPhoto: MeasurementPhoto = {
        ...basePhoto,
        work_photos: workPhotoResult.data ?? null,
        environments: environmentResult.data ?? null,
      };
      setPhoto(loadedPhoto);

      const storagePath = loadedPhoto.work_photos?.storage_path;
      if (storagePath) {
        const { data, error: signedUrlError } = await supabase.storage
          .from('work-photos')
          .createSignedUrl(storagePath, 60 * 60);
        if (signedUrlError || !data?.signedUrl) {
          throw signedUrlError ?? new Error('A foto foi registrada, mas não pôde ser carregada.');
        }
        setSignedUrl(data?.signedUrl ?? null);
        if (data?.signedUrl) {
          NativeImage.getSize(
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
      setPhotoReady(true);
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
    if (!photo || !canEdit || saving) return;

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
    if (!canEdit || saving) return;

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
    if (!canEdit || saving) return;

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
    if (!canEdit || saving) return;
    const point = pointFromEvent(event);

    if (pendingOpening && pendingPoint) {
      setPendingEnd(point);
      setInputValue(pendingOpening);
      setInnerWidth('');
      setInnerHeight('');
      setReferenceLeft('');
      setReferenceRight('');
      setModalMode('openingDetails');
      setTextModal(true);
      setPendingOpening(null);
      return;
    }

    const touchedMeasurement = annotations.find(
      (annotation) =>
        annotation.type === 'measurement' &&
        distanceToSegment(
          point,
          { x: annotation.start_x, y: annotation.start_y },
          { x: annotation.end_x ?? annotation.start_x, y: annotation.end_y ?? annotation.start_y }
        ) < 0.035
    );

    if (touchedMeasurement) {
      setSelectedId(touchedMeasurement.id);
      if (!touchedMeasurement.confirmed || tool === 'delete') {
        if (tool === 'delete') {
          void deleteAnnotation(touchedMeasurement.id);
        } else {
          setInputValue(touchedMeasurement.value_mm ? String(touchedMeasurement.value_mm) : '');
          setPendingPoint({ x: touchedMeasurement.start_x, y: touchedMeasurement.start_y });
          setPendingEnd({ x: touchedMeasurement.end_x ?? touchedMeasurement.start_x, y: touchedMeasurement.end_y ?? touchedMeasurement.start_y });
          setModalMode('editMeasurement');
          setValueModal(true);
        }
      }
      return;
    }

    const touchedPoint = annotations.find(
      (annotation) =>
        annotation.type === 'point' &&
        Math.hypot(point.x - annotation.start_x, point.y - annotation.start_y) < 0.045
    );
    if (touchedPoint) {
      setSelectedId(touchedPoint.id);
      return;
    }

    if (tool === 'measurement') {
      if (!draftStart) {
        setDraftStart(point);
        setMessage('Toque no segundo ponto da medida.');
        return;
      }

      setDraftStart(null);
      if (measurementMode === 'markFirst') {
        void insertAnnotation({
          type: 'measurement',
          start_x: draftStart.x,
          start_y: draftStart.y,
          end_x: point.x,
          end_y: point.y,
          value_mm: null,
          confirmed: false,
        });
        setMessage('Linha marcada. Toque em outra linha para informar a medida.');
      } else {
        setPendingPoint(draftStart);
        setPendingEnd(point);
        setInputValue('');
        setModalMode('createMeasurement');
        setValueModal(true);
        setMessage('');
      }
      return;
    }

    if (tool === 'point') {
      setSelectedId(null);
      setPendingPoint(point);
      setMarkerModal(true);
      return;
    }

    if (tool === 'text') {
      setPendingPoint(point);
      setInputValue('');
      setModalMode('createText');
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

  function saveMeasurement() {
    if (modalMode === 'editMeasurement' && selected) {
      const value = Number(inputValue.replace(/\D/g, ''));
      if (!value) return;
      setValueModal(false);
      void updateAnnotation(selected.id, { value_mm: value, confirmed: true });
      return;
    }
    createMeasurement();
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
    if (isOpening(markerType)) {
      setPendingOpening(markerType);
      setMessage(`Toque no canto oposto da ${markerLabel(markerType).toLowerCase()}.`);
      return;
    }
    setInputValue(markerType);
    if (selected?.type !== 'point') {
      setFloorHeight('');
      setReferenceDistance('');
    }
    setModalMode('pointDetails');
    setTextModal(true);
  }

  function saveOpeningDetails() {
    if (!pendingPoint || !pendingEnd) return;
    const markerType = inputValue as MarkerType;
    const width = Number(innerWidth.replace(/\D/g, ''));
    const height = Number(innerHeight.replace(/\D/g, ''));
    const left = Number(referenceLeft.replace(/\D/g, ''));
    const right = Number(referenceRight.replace(/\D/g, ''));
    if (!innerWidth.trim() || !innerHeight.trim() || !referenceLeft.trim() || !referenceRight.trim()) return;
    setTextModal(false);
    void insertAnnotation({
      type: 'point',
      start_x: pendingPoint.x,
      start_y: pendingPoint.y,
      end_x: pendingEnd.x,
      end_y: pendingEnd.y,
      marker_type: markerType,
      inner_width_mm: width,
      inner_height_mm: height,
      reference_left_mm: left,
      reference_right_mm: right,
      confirmed: true,
    });
    setPendingPoint(null);
    setPendingEnd(null);
  }

  function savePointDetails() {
    if (!pendingPoint) return;
    const markerType = inputValue as MarkerType;
    const floor = Number(floorHeight.replace(/\D/g, ''));
    const reference = Number(referenceDistance.replace(/\D/g, ''));
    if (!floorHeight.trim() || !referenceDistance.trim() || !Number.isFinite(floor) || !Number.isFinite(reference)) return;
    setTextModal(false);
    if (selected?.type === 'point') {
      void updateAnnotation(selected.id, {
        marker_type: markerType,
        floor_height_mm: floor,
        reference_distance_mm: reference,
        confirmed: true,
      });
    } else {
      void insertAnnotation({
        type: 'point',
        start_x: pendingPoint.x,
        start_y: pendingPoint.y,
        marker_type: markerType,
        floor_height_mm: floor,
        reference_distance_mm: reference,
        confirmed: true,
      });
    }
    setPendingPoint(null);
  }

  function editSelectedValue() {
    if (!selected) return;
    if (selected.type === 'measurement') {
      setInputValue(String(selected.value_mm ?? ''));
      setModalMode('editMeasurement');
      setValueModal(true);
      setPendingPoint({ x: selected.start_x, y: selected.start_y });
      setPendingEnd({ x: selected.end_x ?? selected.start_x, y: selected.end_y ?? selected.start_y });
    } else if (selected.type === 'text') {
      setInputValue(selected.text ?? '');
      setModalMode('editText');
      setTextModal(true);
      setPendingPoint({ x: selected.start_x, y: selected.start_y });
    } else {
      setInputValue(selected.marker_type ?? 'other');
      setFloorHeight(selected.floor_height_mm ? String(selected.floor_height_mm) : '');
      setReferenceDistance(selected.reference_distance_mm ? String(selected.reference_distance_mm) : '');
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
      {!fullScreen && (
        <FioPageHeader
          eyebrow={photo?.environments?.name ?? 'Ambiente'}
          title={editing ? 'Editar medições' : 'Visualizar medição'}
          subtitle={isViewer ? 'Somente visualização' : saving ? 'Salvando...' : editing ? 'Edição manual' : 'Foto e marcações'}
          actionIcon={canWrite && !editing ? 'create-outline' : 'refresh-outline'}
          actionLabel={canWrite && !editing ? 'Editar medições' : 'Atualizar'}
          onAction={canWrite && !editing ? () => setEditing(true) : loadData}
        />
      )}

      <ScrollView contentContainerStyle={[styles.content, fullScreen && styles.fullContent]} maximumZoomScale={3} minimumZoomScale={1}>
        <View style={styles.topActions}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back-outline" size={19} color={FioColors.green} />
            <Text style={styles.backText}>Voltar</Text>
          </Pressable>
          <Pressable style={styles.fullScreenButton} onPress={() => setFullScreen((current) => !current)}>
            <Ionicons name={fullScreen ? 'contract-outline' : 'expand-outline'} size={17} color={FioColors.green} />
            <Text style={styles.fullScreenText}>{fullScreen ? 'Sair' : 'Tela cheia'}</Text>
          </Pressable>
        </View>

        {editing && <View style={styles.toolbar}>
          {TOOLS.map((item) => (
            <Pressable
              key={item.key}
              style={[styles.toolButton, tool === item.key && styles.toolButtonActive]}
              onPress={() => {
                setTool(item.key);
                setDraftStart(null);
                setMessage('');
              }}
              disabled={!canEdit}
            >
              <Ionicons
                name={item.icon}
                size={17}
                color={tool === item.key ? FioColors.textOnAccent : FioColors.textMuted}
              />
              <Text style={[styles.toolText, tool === item.key && styles.toolTextActive]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>}

        {editing && tool === 'measurement' && canEdit && (
          <View style={styles.modeRow}>
            <Pressable
              style={[styles.modeButton, measurementMode === 'confirmEach' && styles.modeButtonActive]}
              onPress={() => setMeasurementMode('confirmEach')}
            >
              <Text style={[styles.modeText, measurementMode === 'confirmEach' && styles.modeTextActive]}>Confirmar cada linha</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, measurementMode === 'markFirst' && styles.modeButtonActive]}
              onPress={() => setMeasurementMode('markFirst')}
            >
              <Text style={[styles.modeText, measurementMode === 'markFirst' && styles.modeTextActive]}>Marcar primeiro</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[
            styles.canvas,
            fullScreen && styles.canvasFull,
            { aspectRatio: imageRatio, minHeight: fullScreen ? (isLandscape ? 330 : 500) : 260 },
          ]}
          onLayout={(event) => setCanvas(event.nativeEvent.layout)}
          onPress={handleCanvasPress}
        >
          {signedUrl ? (
            <ExpoImage
              source={{ uri: signedUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="contain"
              transition={120}
              onError={() => setMessage('Não foi possível carregar esta foto. Toque em Atualizar e tente novamente.')}
            />
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
                    <Line x1={x} y1={y} x2={x2} y2={y2} stroke={selectedAnnotation ? FioColors.orange : FioColors.green} strokeWidth={2} />
                    <Line x1={x - Math.sin(Math.atan2(y2 - y, x2 - x)) * 7} y1={y + Math.cos(Math.atan2(y2 - y, x2 - x)) * 7} x2={x + Math.sin(Math.atan2(y2 - y, x2 - x)) * 7} y2={y - Math.cos(Math.atan2(y2 - y, x2 - x)) * 7} stroke={selectedAnnotation ? FioColors.orange : FioColors.green} strokeWidth={2} />
                    <Line x1={x2 - Math.sin(Math.atan2(y2 - y, x2 - x)) * 7} y1={y2 + Math.cos(Math.atan2(y2 - y, x2 - x)) * 7} x2={x2 + Math.sin(Math.atan2(y2 - y, x2 - x)) * 7} y2={y2 - Math.cos(Math.atan2(y2 - y, x2 - x)) * 7} stroke={selectedAnnotation ? FioColors.orange : FioColors.green} strokeWidth={2} />
                    <SvgText
                      x={keepInside((x + x2) / 2, 36, Math.max(36, canvas.width - 36))}
                      y={keepInside((y + y2) / 2 - 9, 17, Math.max(17, canvas.height - 9))}
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
                if (isOpening(annotation.marker_type) && annotation.end_x !== null && annotation.end_y !== null) {
                  const x2 = annotation.end_x * canvas.width;
                  const y2 = annotation.end_y * canvas.height;
                  const left = Math.min(x, x2);
                  const top = Math.min(y, y2);
                  const width = Math.abs(x2 - x);
                  const height = Math.abs(y2 - y);
                  const labelY = Math.max(16, top - 8);
                  return (
                    <G key={annotation.id}>
                      <Line x1={0} y1={(y + y2) / 2} x2={left} y2={(y + y2) / 2} stroke={FioColors.gold} strokeWidth={1.2} strokeDasharray="5 7" />
                      <Rect x={left} y={top} width={width} height={height} fill="transparent" stroke={selectedAnnotation ? FioColors.orange : FioColors.gold} strokeWidth={2} />
                      <SvgText x={keepInside(left + width / 2, 42, Math.max(42, canvas.width - 42))} y={labelY} fill={FioColors.white} stroke={FioColors.canvas} strokeWidth={0.7} fontSize={11} fontWeight="900" textAnchor="middle">
                        {annotation.inner_width_mm ?? '?'} × {annotation.inner_height_mm ?? '?'} mm
                      </SvgText>
                    </G>
                  );
                }
                return (
                  <G key={annotation.id}>
                    <Line x1={0} y1={y} x2={x} y2={y} stroke={FioColors.gold} strokeWidth={1.2} strokeDasharray="5 7" opacity={0.9} />
                    <Line x1={x} y1={y} x2={x} y2={canvas.height} stroke={FioColors.gold} strokeWidth={1.2} strokeDasharray="5 7" opacity={0.9} />
                    {annotation.reference_distance_mm !== null && (
                      <SvgText
                        x={keepInside(x / 2, 28, Math.max(28, canvas.width - 28))}
                        y={keepInside(y - 9, 16, Math.max(16, canvas.height - 8))}
                        fill={FioColors.white}
                        stroke={FioColors.canvas}
                        strokeWidth={0.8}
                        fontSize={12}
                        fontWeight="900"
                        textAnchor="middle"
                      >
                        {annotation.reference_distance_mm} mm
                      </SvgText>
                    )}
                    {annotation.floor_height_mm !== null && (
                      <SvgText
                        x={keepInside(x + (x > canvas.width * 0.72 ? -11 : 11), 12, Math.max(12, canvas.width - 12))}
                        y={keepInside((y + canvas.height) / 2, 30, Math.max(30, canvas.height - 30))}
                        fill={FioColors.white}
                        stroke={FioColors.canvas}
                        strokeWidth={0.8}
                        fontSize={12}
                        fontWeight="900"
                        textAnchor="middle"
                        transform={`rotate(-90 ${keepInside(x + (x > canvas.width * 0.72 ? -11 : 11), 12, Math.max(12, canvas.width - 12))} ${keepInside((y + canvas.height) / 2, 30, Math.max(30, canvas.height - 30))})`}
                      >
                        {annotation.floor_height_mm} mm
                      </SvgText>
                    )}
                    <Rect x={x - 13} y={y - 13} width={26} height={26} rx={7} fill={selectedAnnotation ? FioColors.orange : FioColors.gold} />
                  </G>
                );
              }

              return (
                <SvgText
                  key={annotation.id}
                  x={x > canvas.width * 0.7 ? keepInside(x - 8, 8, canvas.width - 8) : keepInside(x + 8, 8, canvas.width - 8)}
                  y={keepInside(y, 16, Math.max(16, canvas.height - 8))}
                  fill={selectedAnnotation ? FioColors.orange : FioColors.white}
                  stroke={FioColors.canvas}
                  strokeWidth={0.8}
                  fontSize={14}
                  fontWeight="900"
                  textAnchor={x > canvas.width * 0.7 ? "end" : "start"}
                >
                  {annotation.text}
                </SvgText>
              );
            })}

            {draftStart && (
              <Circle cx={draftStart.x * canvas.width} cy={draftStart.y * canvas.height} r={10} fill={FioColors.orange} />
            )}
          </Svg>
          {annotations
            .filter((annotation) => annotation.type === 'point' && !isOpening(annotation.marker_type))
            .map((annotation) => {
              const x = annotation.start_x * canvas.width;
              const y = annotation.start_y * canvas.height;
              return (
                <View key={`icon-${annotation.id}`} pointerEvents="none" style={[styles.pointIconBadge, { left: x - 13, top: y - 13 }]}>
                  <Ionicons name={markerIcon(annotation.marker_type)} size={15} color={FioColors.textOnAccent} />
                </View>
              );
            })}
        </Pressable>

        <Text style={styles.helpText}>
          {canEdit
            ? tool === 'measurement'
              ? measurementMode === 'markFirst'
                ? 'Marque quantas linhas quiser. Depois, toque em cada linha para informar a medida.'
                : 'Toque no início e depois no fim da medida. Confirme para salvar e adicionar a próxima.'
              : tool === 'delete'
                ? 'Selecione uma marcação abaixo e confirme excluir.'
                : 'Toque na foto para adicionar.'
            : 'Visualização liberada. Edição bloqueada para este perfil.'}
        </Text>

        <View style={styles.photoSaveRow}>
          <Ionicons name={photoReady ? 'checkmark-circle-outline' : 'cloud-upload-outline'} size={17} color={photoReady ? FioColors.green : FioColors.gold} />
          <Text style={styles.photoSaveText}>{photoReady ? 'Foto salva e disponível nesta medição.' : 'Salvando foto...'}</Text>
          <Pressable style={styles.saveExitButton} onPress={() => editing ? setEditing(false) : router.back()}>
            <Text style={styles.saveExitText}>{editing ? 'Salvar e visualizar' : 'Voltar'}</Text>
          </Pressable>
        </View>

        {selected && (
          <View style={styles.selectedPanel}>
            <Text style={styles.selectedTitle}>
              {selected.type === 'measurement'
                ? `${selected.value_mm ?? ''} mm`
                : selected.type === 'point'
                  ? pointDetailsLabel(selected)
                  : selected.text}
            </Text>
            {canEdit && (
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

        {!fullScreen && <Text style={styles.sectionTitle}>Marcações</Text>}
        {!fullScreen && (annotations.length === 0 ? (
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
                    ? pointDetailsLabel(annotation)
                    : annotation.text}
              </Text>
            </Pressable>
          ))
        ))}

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
              <Pressable style={styles.primaryButton} onPress={saveMeasurement}>
                <Text style={styles.primaryButtonText}>Confirmar medida</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={textModal} transparent animationType="fade" onRequestClose={() => setTextModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {modalMode === 'openingDetails' ? (
              <>
                <Text style={styles.modalTitle}>{markerLabel(inputValue as MarkerType)}</Text>
                <Text style={styles.modalHint}>Informe o vão interno e as referências laterais para confirmar.</Text>
                <TextInput value={innerWidth} onChangeText={setInnerWidth} keyboardType="number-pad" placeholder="Largura interna em mm" placeholderTextColor={FioColors.textSoft} style={styles.input} />
                <TextInput value={innerHeight} onChangeText={setInnerHeight} keyboardType="number-pad" placeholder="Altura interna em mm" placeholderTextColor={FioColors.textSoft} style={styles.input} />
                <TextInput value={referenceLeft} onChangeText={setReferenceLeft} keyboardType="number-pad" placeholder="Referência esquerda em mm" placeholderTextColor={FioColors.textSoft} style={styles.input} />
                <TextInput value={referenceRight} onChangeText={setReferenceRight} keyboardType="number-pad" placeholder="Referência direita em mm" placeholderTextColor={FioColors.textSoft} style={styles.input} />
              </>
            ) : modalMode === 'pointDetails' ? (
              <>
                <Text style={styles.modalTitle}>{markerLabel(inputValue as MarkerType)}</Text>
                <Text style={styles.modalHint}>Informe as duas referências para confirmar este ponto.</Text>
                <TextInput value={floorHeight} onChangeText={setFloorHeight} keyboardType="number-pad" placeholder="Altura do chão em mm · ex.: 1100" placeholderTextColor={FioColors.textSoft} style={styles.input} />
                <TextInput value={referenceDistance} onChangeText={setReferenceDistance} keyboardType="number-pad" placeholder="Distância da referência em mm · ex.: 600" placeholderTextColor={FioColors.textSoft} style={styles.input} />
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Observação curta</Text>
                <TextInput
                  value={inputValue}
                  onChangeText={setInputValue}
                  placeholder="conferir com projeto"
                  placeholderTextColor={FioColors.textSoft}
                  style={styles.input}
                />
              </>
            )}
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => setTextModal(false)}>
                <Text style={styles.secondaryButtonText}>Cancelar</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={modalMode === 'openingDetails' ? saveOpeningDetails : modalMode === 'pointDetails' ? savePointDetails : modalMode === 'editText' ? updateSelectedValue : createText}>
                <Text style={styles.primaryButtonText}>{modalMode === 'openingDetails' ? 'Confirmar abertura' : modalMode === 'pointDetails' ? 'Confirmar ponto' : 'Salvar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={markerModal} transparent animationType="fade" onRequestClose={() => setMarkerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tipo de ponto</Text>
              <Pressable accessibilityLabel="Fechar tipos de ponto" style={styles.modalClose} onPress={() => setMarkerModal(false)}>
                <Ionicons name="close-outline" size={22} color={FioColors.text} />
              </Pressable>
            </View>
            <View style={styles.markerGrid}>
              {MARKERS.map((marker) => (
                <Pressable
                  key={marker.key}
                  style={styles.markerButton}
                  onPress={() => createMarker(marker.key)}
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
  fullContent: { maxWidth: undefined, flexGrow: 1, paddingTop: 16 },
  topActions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  backButton: { minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 12, fontWeight: '900', color: FioColors.green },
  fullScreenButton: { minHeight: 38, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 11, backgroundColor: FioColors.surface },
  fullScreenText: { fontSize: 10, fontWeight: '900', color: FioColors.green },
  toolbar: { flexDirection: 'row', gap: 7, marginBottom: 9 },
  toolButton: { minHeight: 42, flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  toolButtonActive: { borderColor: FioColors.green, backgroundColor: FioColors.green },
  toolText: { fontSize: 8, fontWeight: '900', color: FioColors.textMuted },
  toolTextActive: { color: FioColors.textOnAccent },
  modeRow: { marginBottom: 9, flexDirection: 'row', gap: 7 },
  modeButton: { minHeight: 36, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surface },
  modeButtonActive: { borderColor: FioColors.orange, backgroundColor: FioColors.orangeSoft },
  modeText: { fontSize: 9, fontWeight: '900', color: FioColors.textMuted, textAlign: 'center' },
  modeTextActive: { color: FioColors.orange },
  canvas: { width: '100%', minHeight: 260, overflow: 'hidden', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: '#141714' },
  canvasFull: { borderRadius: 0, borderColor: FioColors.green },
  pointIconBadge: { position: 'absolute', width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  noImage: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 8 },
  helpText: { marginTop: 8, fontSize: 10, color: FioColors.textMuted },
  photoSaveRow: { minHeight: 48, marginTop: 10, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  photoSaveText: { flex: 1, fontSize: 9, fontWeight: '700', color: FioColors.textMuted },
  saveExitButton: { minHeight: 32, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: FioColors.green },
  saveExitText: { fontSize: 9, fontWeight: '900', color: FioColors.textOnAccent },
  selectedPanel: { marginTop: 10, padding: 10, borderWidth: 1, borderColor: FioColors.green, borderRadius: 13, backgroundColor: FioColors.greenSoft },
  selectedTitle: { fontSize: 12, fontWeight: '900', color: FioColors.text },
  selectedActions: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  smallButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surfaceRaised },
  smallButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.green },
  deleteButton: { borderColor: FioColors.danger, backgroundColor: FioColors.dangerSoft },
  deleteButtonText: { fontSize: 9, fontWeight: '900', color: FioColors.danger },
  sectionTitle: { marginTop: 16, marginBottom: 8, fontSize: 13, fontWeight: '900', color: FioColors.text },
  emptyText: { fontSize: 10, color: FioColors.textMuted },
  modalHint: { marginTop: -4, marginBottom: 10, fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  annotationRow: { minHeight: 44, marginBottom: 7, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: FioColors.line, borderRadius: 12, backgroundColor: FioColors.surface },
  annotationRowActive: { borderColor: FioColors.orange, backgroundColor: FioColors.orangeSoft },
  annotationText: { flex: 1, fontSize: 11, fontWeight: '800', color: FioColors.text },
  annotationTextActive: { color: FioColors.text },
  errorText: { marginTop: 10, fontSize: 11, lineHeight: 17, color: FioColors.danger },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(0,0,0,0.62)' },
  modalCard: { padding: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  modalHeader: { minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 19, backgroundColor: FioColors.surfaceRaised },
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
