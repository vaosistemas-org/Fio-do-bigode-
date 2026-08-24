import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

export default function SecurityScreen() {
  const router = useRouter();
  const [password, setPassword] = useState(''); const [confirmation, setConfirmation] = useState(''); const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  async function save() {
    if (saving) return;
    setMessage('');
    if (password.length < 8) { setMessage('Use pelo menos 8 caracteres na nova senha.'); return; }
    if (password !== confirmation) { setMessage('A confirmação não é igual à nova senha.'); return; }
    setSaving(true); const { error } = await supabase.auth.updateUser({ password }); setSaving(false);
    if (error) { setMessage(error.message); return; }
    setPassword(''); setConfirmation(''); Alert.alert('Senha atualizada', 'Sua nova senha foi salva com segurança.');
  }
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><FioPageHeader eyebrow="SEGURANÇA" title="Senha e acesso" subtitle="Proteja o acesso à sua conta FIO." /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable style={styles.back} onPress={() => router.back()}><Ionicons name="chevron-back" size={21} color={FioColors.green} /><Text style={styles.backText}>Voltar às configurações</Text></Pressable>
    <View style={styles.notice}><Ionicons name="shield-checkmark-outline" size={24} color={FioColors.green} /><View style={styles.grow}><Text style={styles.noticeTitle}>Conta protegida</Text><Text style={styles.noticeText}>Use uma senha exclusiva, com pelo menos 8 caracteres.</Text></View></View>
    <Text style={styles.label}>Nova senha</Text><TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Digite a nova senha" placeholderTextColor={FioColors.textSoft} style={styles.input} />
    <Text style={styles.label}>Confirmar nova senha</Text><TextInput value={confirmation} onChangeText={setConfirmation} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="Digite novamente" placeholderTextColor={FioColors.textSoft} style={styles.input} />
    {!!message && <Text style={styles.error}>{message}</Text>}
    <Pressable style={({ pressed }) => [styles.save, pressed && styles.pressed, saving && styles.disabled]} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color={FioColors.textOnAccent} /> : <><Ionicons name="key-outline" size={21} color={FioColors.textOnAccent} /><Text style={styles.saveText}>Atualizar senha</Text></>}</Pressable>
  </ScrollView></KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: FioColors.canvas }, content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingBottom: 44 }, back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }, backText: { fontSize: 15, fontWeight: '900', color: FioColors.green }, notice: { flexDirection: 'row', gap: 12, padding: 16, marginTop: 10, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface }, grow: { flex: 1 }, noticeTitle: { fontSize: 16, fontWeight: '900', color: FioColors.text }, noticeText: { marginTop: 4, fontSize: 13, lineHeight: 19, color: FioColors.textMuted }, label: { marginTop: 22, marginBottom: 8, fontSize: 14, fontWeight: '900', color: FioColors.inkSoft }, input: { minHeight: 54, paddingHorizontal: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, color: FioColors.text, backgroundColor: FioColors.surface, fontSize: 16 }, error: { marginTop: 14, padding: 12, borderRadius: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft }, save: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 26, borderRadius: FioRadius.medium, backgroundColor: FioColors.green }, saveText: { fontSize: 16, fontWeight: '900', color: FioColors.textOnAccent }, pressed: { opacity: 0.72 }, disabled: { opacity: 0.62 } });
