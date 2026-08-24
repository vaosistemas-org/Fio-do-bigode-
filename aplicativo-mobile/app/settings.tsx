import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type SettingRowProps = { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void; tone?: 'green' | 'gold' | 'orange' };

function SettingRow({ icon, title, subtitle, onPress, tone = 'green' }: SettingRowProps) {
  const color = tone === 'orange' ? FioColors.orange : tone === 'gold' ? FioColors.gold : FioColors.green;
  return <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={onPress}><View style={[styles.icon, { backgroundColor: tone === 'orange' ? FioColors.orangeSoft : tone === 'gold' ? FioColors.goldSoft : FioColors.greenSoft }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.identity}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View><Ionicons name="chevron-forward-outline" size={20} color={FioColors.textSoft} /></Pressable>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState('');
  async function logout() {
    if (leaving) return;
    Alert.alert('Sair da conta?', 'Você poderá entrar novamente com seu e-mail e senha.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Sair', style: 'destructive', onPress: async () => { setLeaving(true); setMessage(''); const { error } = await supabase.auth.signOut(); if (error) { setMessage(error.message); setLeaving(false); return; } router.replace('/login'); } }]);
  }
  return <View style={styles.page}><FioPageHeader eyebrow="SUA CONTA" title="Configurações" subtitle="Conta, privacidade e segurança do aplicativo." /><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.section}>CONTA</Text>
    <SettingRow icon="person-outline" title="Dados da conta" subtitle="Nome, telefone, função e área de atuação" onPress={() => router.push('/edit-profile')} />
    <SettingRow icon="id-card-outline" title="Meu perfil" subtitle="Foto, dados pessoais e privacidade" onPress={() => router.push('/profile')} />
    <Text style={styles.section}>AMPLIAR MEU ACESSO</Text>
    <SettingRow icon="construct-outline" title="Criar perfil profissional" subtitle="Adicione função, atuação e perfil público profissional" onPress={() => router.push('/profile')} />
    <SettingRow icon="storefront-outline" title="Criar ou acessar empresa" subtitle="Administre loja, marcenaria ou outro perfil empresarial" onPress={() => router.push('/company')} tone="gold" />
    <SettingRow icon="git-network-outline" title="Vínculos e convites" subtitle="Entre em empresas e aceite solicitações" onPress={() => router.push('/links')} />
    <Text style={styles.section}>PREFERÊNCIAS</Text>
    <SettingRow icon="notifications-outline" title="Notificações" subtitle="Avisos de obras, agenda, documentos e mensagens" onPress={() => router.push('/notifications')} tone="orange" />
    <View style={styles.infoRow}><Ionicons name="sync-outline" size={19} color={FioColors.gold} /><View style={styles.identity}><Text style={styles.title}>Sincronização</Text><Text style={styles.subtitle}>Os dados deste dispositivo são salvos na nuvem quando há conexão.</Text></View></View>
    <Text style={styles.section}>SEGURANÇA</Text>
    <SettingRow icon="key-outline" title="Senha e acesso" subtitle="Altere sua senha e mantenha sua conta protegida" onPress={() => router.push('/security')} tone="gold" />
    <View style={styles.security}><Ionicons name="shield-checkmark-outline" size={19} color={FioColors.green} /><Text style={styles.securityText}>As permissões das obras são verificadas no servidor. Cada pessoa vê e altera apenas o que seu acesso permite.</Text></View>
    {!!message && <Text style={styles.error}>{message}</Text>}
    <Pressable style={styles.logout} onPress={logout} disabled={leaving}>{leaving ? <ActivityIndicator color={FioColors.danger} /> : <Ionicons name="log-out-outline" size={20} color={FioColors.danger} />}<Text style={styles.logoutText}>{leaving ? 'Saindo...' : 'Sair da conta'}</Text></Pressable><Text style={styles.version}>FIO · Gestão de Obras</Text>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 44, gap: 10 }, section: { marginTop: 14, marginBottom: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, color: FioColors.gold }, item: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, pressed: { opacity: 0.7 }, icon: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, identity: { flex: 1, minWidth: 0 }, title: { fontSize: 15, fontWeight: '900', color: FioColors.text }, subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: FioColors.textMuted }, infoRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: FioRadius.medium, backgroundColor: FioColors.surfaceMuted, borderWidth: 1, borderColor: FioColors.line }, security: { marginTop: 2, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: FioRadius.medium, backgroundColor: FioColors.greenSoft }, securityText: { flex: 1, fontSize: 12, lineHeight: 18, color: FioColors.inkSoft }, logout: { minHeight: 52, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: FioColors.danger, borderRadius: FioRadius.medium, backgroundColor: FioColors.dangerSoft }, logoutText: { fontSize: 14, fontWeight: '900', color: FioColors.danger }, error: { padding: 12, borderRadius: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft }, version: { marginTop: 4, textAlign: 'center', fontSize: 11, fontWeight: '700', color: FioColors.textSoft },
});
