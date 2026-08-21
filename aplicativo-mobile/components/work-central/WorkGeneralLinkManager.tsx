import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// @ts-ignore installed from the dependency declared in package.json
import QRCode from 'react-native-qrcode-svg';

import { FioColors } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type GeneralLink = {
  id: string;
  token: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
  access_count: number;
  last_access_at: string | null;
};

type ExpiryOption = 'never' | '7days' | '30days';

function expiryDate(option: ExpiryOption) {
  if (option === 'never') return null;
  const date = new Date();
  date.setDate(date.getDate() + (option === '7days' ? 7 : 30));
  return date.toISOString();
}

function publicUrl(token: string) {
  const webBase = process.env.EXPO_PUBLIC_FIO_WEB_URL?.replace(/\/$/, '');
  return webBase ? `${webBase}/fio/${token}` : '';
}

export function WorkGeneralLinkManager({
  workId,
  canManage,
}: {
  workId: string;
  canManage: boolean;
}) {
  const [link, setLink] = useState<GeneralLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryOption>('never');
  const [qrVisible, setQrVisible] = useState(false);
  const [message, setMessage] = useState('');

  async function loadLink() {
    if (!canManage) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_work_general_link', {
      p_work_id: workId,
    });
    if (error) {
      setMessage(error.message);
      setLink(null);
    } else {
      setLink(((data ?? [])[0] ?? null) as GeneralLink | null);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadLink();
  }, [workId, canManage]);

  const url = useMemo(() => (link ? publicUrl(link.token) : ''), [link]);

  async function generateLink() {
    if (saving) return;
    setSaving(true);
    setMessage('');
    const { error } = await supabase.rpc('create_or_replace_work_general_link', {
      p_work_id: workId,
      p_expires_at: expiryDate(expiry),
    });
    if (error) {
      setMessage(error.message);
    } else {
      await loadLink();
    }
    setSaving(false);
  }

  function confirmGenerate() {
    if (!link) {
      generateLink();
      return;
    }
    Alert.alert(
      'Gerar novo link?',
      'O link e o QR atuais deixarão de funcionar imediatamente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Gerar novo', onPress: generateLink },
      ]
    );
  }

  function confirmRevoke() {
    Alert.alert(
      'Revogar acesso?',
      'O link e o QR deixarão de abrir o FIO geral.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Revogar',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            const { error } = await supabase.rpc('revoke_work_general_link', {
              p_work_id: workId,
            });
            if (error) setMessage(error.message);
            else setLink(null);
            setSaving(false);
          },
        },
      ]
    );
  }

  async function shareLink() {
    if (!url) {
      Alert.alert(
        'Endereço público ainda não configurado',
        'Publique a versão web do FIO antes de compartilhar o link ou QR.'
      );
      return;
    }
    await Share.share({
      title: 'FIO geral da obra',
      message: `Acompanhe o FIO geral da obra em modo somente leitura:\n${url}`,
      url,
    });
  }

  if (!canManage) return null;

  return (
    <View style={styles.card}>
      <Pressable style={styles.header} onPress={() => setExpanded((value) => !value)}>
        <View style={styles.iconBox}>
          <Ionicons name="qr-code-outline" size={19} color={FioColors.green} />
        </View>
        <View style={styles.identity}>
          <Text style={styles.title}>Leitura por link ou QR</Text>
          <Text style={styles.subtitle}>
            Somente o conteúdo marcado como “Todos da obra”.
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator size="small" color={FioColors.green} />
        ) : (
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={20}
            color={FioColors.text}
          />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {link ? (
            <>
              <View style={styles.activeRow}>
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeText}>Link ativo</Text>
                </View>
                <Text style={styles.accessText}>{link.access_count} acessos</Text>
              </View>
              {url ? (
                <Text numberOfLines={2} selectable style={styles.urlText}>{url}</Text>
              ) : (
                <Text style={styles.pendingUrlText}>
                  Endereço público aguardando a primeira publicação web.
                </Text>
              )}
              <Text style={styles.expiryText}>
                {link.expires_at
                  ? `Válido até ${new Date(link.expires_at).toLocaleDateString('pt-BR')}`
                  : 'Sem data de expiração'}
              </Text>
              <View style={styles.actionRow}>
                <Pressable style={styles.primaryAction} onPress={shareLink}>
                  <Ionicons name="share-social-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.primaryActionText}>Compartilhar</Text>
                </Pressable>
                <Pressable
                  disabled={!url}
                  style={[styles.secondaryAction, !url && styles.disabled]}
                  onPress={() => setQrVisible(true)}
                >
                  <Ionicons name="qr-code-outline" size={17} color={FioColors.green} />
                  <Text style={styles.secondaryActionText}>Ver QR</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.explanation}>
              Crie um acesso revogável e somente leitura. A obra não ficará pública nem aparecerá em buscas.
            </Text>
          )}

          <Text style={styles.label}>{link ? 'Validade do novo link' : 'Validade'}</Text>
          <View style={styles.expiryRow}>
            {([
              ['never', 'Sem prazo'],
              ['7days', '7 dias'],
              ['30days', '30 dias'],
            ] as Array<[ExpiryOption, string]>).map(([key, label]) => (
              <Pressable
                key={key}
                style={[styles.expiryChip, expiry === key && styles.expiryChipActive]}
                onPress={() => setExpiry(key)}
              >
                <Text style={[styles.expiryChipText, expiry === key && styles.expiryChipTextActive]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            disabled={saving}
            style={[styles.generateButton, saving && styles.disabled]}
            onPress={confirmGenerate}
          >
            {saving ? (
              <ActivityIndicator color={FioColors.green} />
            ) : (
              <Text style={styles.generateText}>{link ? 'Gerar novo link' : 'Gerar link e QR'}</Text>
            )}
          </Pressable>
          {link && (
            <Pressable disabled={saving} style={styles.revokeButton} onPress={confirmRevoke}>
              <Text style={styles.revokeText}>Revogar acesso atual</Text>
            </Pressable>
          )}
          {!!message && <Text style={styles.errorText}>{message}</Text>}
        </View>
      )}

      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.qrCard}>
            <Pressable style={styles.closeButton} onPress={() => setQrVisible(false)}>
              <Ionicons name="close-outline" size={24} color={FioColors.text} />
            </Pressable>
            <Text style={styles.qrTitle}>FIO geral da obra</Text>
            <Text style={styles.qrSubtitle}>Aponte a câmera para abrir em modo somente leitura.</Text>
            {!!url && (
              <View style={styles.qrFrame}>
                <QRCode value={url} size={210} color="#152033" backgroundColor="#FFFFFF" />
              </View>
            )}
            <Pressable style={styles.qrShareButton} onPress={shareLink}>
              <Text style={styles.qrShareText}>Compartilhar link</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 13, backgroundColor: FioColors.surfaceRaised },
  header: { minHeight: 62, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9 },
  iconBox: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: FioColors.greenSoft },
  identity: { flex: 1, minWidth: 0 },
  title: { fontSize: 11, fontWeight: '800', color: FioColors.text },
  subtitle: { marginTop: 2, fontSize: 8, lineHeight: 12, color: FioColors.textMuted },
  body: { padding: 11, paddingTop: 3, borderTopWidth: 1, borderTopColor: FioColors.line },
  activeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, backgroundColor: '#30483A' },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2D9B65' },
  activeText: { fontSize: 8, fontWeight: '800', color: FioColors.success },
  accessText: { fontSize: 8, color: FioColors.textSoft },
  urlText: { marginTop: 8, fontSize: 9, lineHeight: 13, color: FioColors.green },
  pendingUrlText: { marginTop: 8, fontSize: 9, lineHeight: 13, color: '#A06A24' },
  expiryText: { marginTop: 3, fontSize: 8, color: FioColors.textSoft },
  actionRow: { marginTop: 9, flexDirection: 'row', gap: 7 },
  primaryAction: { minHeight: 40, flex: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 10, backgroundColor: FioColors.green },
  primaryActionText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  secondaryAction: { minHeight: 40, flex: 1, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surface },
  secondaryActionText: { fontSize: 9, fontWeight: '800', color: FioColors.green },
  explanation: { fontSize: 9, lineHeight: 14, color: FioColors.textMuted },
  label: { marginTop: 11, marginBottom: 6, fontSize: 8, fontWeight: '800', color: FioColors.textMuted },
  expiryRow: { flexDirection: 'row', gap: 6 },
  expiryChip: { minHeight: 34, flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999, backgroundColor: FioColors.surface },
  expiryChipActive: { borderColor: FioColors.green, backgroundColor: '#30483A' },
  expiryChipText: { fontSize: 8, fontWeight: '700', color: FioColors.textMuted },
  expiryChipTextActive: { color: FioColors.green },
  generateButton: { minHeight: 42, marginTop: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 10, backgroundColor: FioColors.surface },
  generateText: { fontSize: 9, fontWeight: '800', color: FioColors.green },
  revokeButton: { minHeight: 38, marginTop: 5, alignItems: 'center', justifyContent: 'center' },
  revokeText: { fontSize: 8, fontWeight: '700', color: FioColors.danger },
  errorText: { marginTop: 7, fontSize: 8, lineHeight: 12, color: FioColors.danger },
  disabled: { opacity: 0.5 },
  modalBackdrop: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(12, 15, 12, 0.72)' },
  qrCard: { width: '100%', maxWidth: 370, padding: 22, alignItems: 'center', borderWidth: 2, borderColor: FioColors.lineStrong, borderRadius: 22, backgroundColor: FioColors.surface },
  closeButton: { position: 'absolute', top: 10, right: 10, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: FioColors.surfaceRaised },
  qrTitle: { marginTop: 14, fontSize: 19, fontWeight: '900', color: FioColors.text },
  qrSubtitle: { maxWidth: 280, marginTop: 4, textAlign: 'center', fontSize: 10, lineHeight: 15, color: FioColors.textMuted },
  qrFrame: { marginTop: 18, padding: 15, borderWidth: 1, borderColor: '#E0E3E8', borderRadius: 16, backgroundColor: '#2E332F' },
  qrShareButton: { minHeight: 46, width: '100%', marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.green },
  qrShareText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF' },
});
