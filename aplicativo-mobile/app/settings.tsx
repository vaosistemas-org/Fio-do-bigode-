import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState('');

  async function logout() {
    if (leaving) return;
    setLeaving(true); setMessage('');
    const { error } = await supabase.auth.signOut();
    if (error) { setMessage(error.message); setLeaving(false); return; }
    router.replace('/login');
  }

  return (
    <View style={styles.page}>
      <FioPageHeader eyebrow="SUA CONTA" title="Configurações" subtitle="Preferências e segurança do aplicativo." />
      <View style={styles.content}>
        <Pressable style={styles.item} onPress={() => router.push('/edit-profile')}><View style={styles.icon}><Ionicons name="person-outline" size={21} color={FioColors.green} /></View><View style={styles.identity}><Text style={styles.title}>Dados da conta</Text><Text style={styles.subtitle}>Nome, telefone e área de atuação</Text></View><Ionicons name="chevron-forward-outline" size={19} color={FioColors.textSoft} /></Pressable>
        <View style={styles.security}><Ionicons name="shield-checkmark-outline" size={18} color={FioColors.green} /><Text style={styles.securityText}>As permissões das obras são verificadas no servidor em todas as áreas operacionais.</Text></View>
        {!!message && <Text style={styles.error}>{message}</Text>}
        <Pressable style={styles.logout} onPress={logout} disabled={leaving}>{leaving ? <ActivityIndicator color={FioColors.danger} /> : <Ionicons name="log-out-outline" size={20} color={FioColors.danger} />}<Text style={styles.logoutText}>{leaving ? 'Saindo...' : 'Sair da conta'}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingTop: 24 },
  item: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, icon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.greenSoft }, identity: { flex: 1 }, title: { fontSize: 13, fontWeight: '900', color: FioColors.text }, subtitle: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  security: { marginTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 13, borderRadius: 12, backgroundColor: FioColors.greenSoft }, securityText: { flex: 1, fontSize: 10, lineHeight: 15, color: FioColors.green },
  logout: { minHeight: 48, marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#E5BDB8', borderRadius: 12, backgroundColor: FioColors.dangerSoft }, logoutText: { fontSize: 11, fontWeight: '900', color: FioColors.danger }, error: { marginTop: 12, padding: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft },
});
