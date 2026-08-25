import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioRadius } from '@/constants/fio-theme';
import { FioThemeOptions, useFioTheme } from '@/constants/fio-theme-context';
import { supabase } from '@/lib/supabase';

type SettingRowProps = { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; onPress: () => void; tone?: 'green' | 'gold' | 'orange' };

function SettingRow({ icon, title, subtitle, onPress, tone = 'green' }: SettingRowProps) {
  const { colors } = useFioTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = tone === 'orange' ? colors.orange : tone === 'gold' ? colors.gold : colors.green;
  return <Pressable style={({ pressed }) => [styles.item, pressed && styles.pressed]} onPress={onPress}><View style={[styles.icon, { backgroundColor: tone === 'orange' ? colors.orangeSoft : tone === 'gold' ? colors.goldSoft : colors.greenSoft }]}><Ionicons name={icon} size={22} color={color} /></View><View style={styles.identity}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View><Ionicons name="chevron-forward-outline" size={20} color={colors.textSoft} /></Pressable>;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, themeId, setThemeId } = useFioTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    <Text style={styles.section}>TEMA DO APLICATIVO</Text>
    <Text style={styles.themeHelp}>Escolha as cores do FIO. A preferência fica salva neste dispositivo.</Text>
    <View style={styles.themeList}>{FioThemeOptions.map((option) => { const selected = option.id === themeId; const preview = option.id === 'dark' ? ['#242824', '#74B892', '#D2AD67'] : option.id === 'light-sand' ? ['#F4F5F2', '#197A55', '#B58A32'] : ['#F7F5F8', '#176E55', '#9461D2']; return <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected }} style={({ pressed }) => [styles.themeOption, selected && styles.themeOptionSelected, pressed && styles.pressed]} onPress={() => setThemeId(option.id)}><View style={styles.themePreview}>{preview.map((color, index) => <View key={color} style={[styles.previewStripe, { backgroundColor: color, borderTopLeftRadius: index === 0 ? 8 : 0, borderBottomLeftRadius: index === 0 ? 8 : 0, borderTopRightRadius: index === 2 ? 8 : 0, borderBottomRightRadius: index === 2 ? 8 : 0 }]} />)}</View><View style={styles.identity}><Text style={styles.title}>{option.name}</Text><Text style={styles.subtitle}>{option.description}</Text></View><Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selected ? colors.electricAccent : colors.textSoft} /></Pressable>; })}</View>
    <View style={styles.infoRow}><Ionicons name="sync-outline" size={19} color={colors.gold} /><View style={styles.identity}><Text style={styles.title}>Sincronização</Text><Text style={styles.subtitle}>Os dados deste dispositivo são salvos na nuvem quando há conexão.</Text></View></View>
    <Text style={styles.section}>SEGURANÇA</Text>
    <SettingRow icon="key-outline" title="Senha e acesso" subtitle="Altere sua senha e mantenha sua conta protegida" onPress={() => router.push('/security')} tone="gold" />
    <View style={styles.security}><Ionicons name="shield-checkmark-outline" size={19} color={colors.green} /><Text style={styles.securityText}>As permissões das obras são verificadas no servidor. Cada pessoa vê e altera apenas o que seu acesso permite.</Text></View>
    {!!message && <Text style={styles.error}>{message}</Text>}
    <Pressable style={styles.logout} onPress={logout} disabled={leaving}>{leaving ? <ActivityIndicator color={colors.danger} /> : <Ionicons name="log-out-outline" size={20} color={colors.danger} />}<Text style={styles.logoutText}>{leaving ? 'Saindo...' : 'Sair da conta'}</Text></Pressable><Text style={styles.version}>FIO · Gestão de Obras</Text>
  </ScrollView></View>;
}

function createStyles(colors: ReturnType<typeof useFioTheme>['colors']) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.canvas }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 44, gap: 10 }, section: { marginTop: 14, marginBottom: 1, fontSize: 12, fontWeight: '900', letterSpacing: 1.4, color: colors.gold }, item: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderColor: colors.line, borderRadius: FioRadius.medium, backgroundColor: colors.surface }, pressed: { opacity: 0.7 }, icon: { width: 45, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, identity: { flex: 1, minWidth: 0 }, title: { fontSize: 15, fontWeight: '900', color: colors.text }, subtitle: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.textMuted }, infoRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: FioRadius.medium, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.line }, security: { marginTop: 2, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: FioRadius.medium, backgroundColor: colors.greenSoft }, securityText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.inkSoft }, logout: { minHeight: 52, marginTop: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.danger, borderRadius: FioRadius.medium, backgroundColor: colors.dangerSoft }, logoutText: { fontSize: 14, fontWeight: '900', color: colors.danger }, error: { padding: 12, borderRadius: 12, color: colors.danger, backgroundColor: colors.dangerSoft }, version: { marginTop: 4, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.textSoft }, themeHelp: { marginBottom: 2, fontSize: 12, lineHeight: 17, color: colors.textMuted }, themeList: { gap: 8 }, themeOption: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: FioRadius.medium, backgroundColor: colors.surface }, themeOptionSelected: { borderColor: colors.electricAccent, backgroundColor: colors.electricAccentSoft }, themePreview: { width: 30, height: 48, overflow: 'hidden', borderRadius: 8, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' }, previewStripe: { flex: 1, width: '100%' },
  });
}
