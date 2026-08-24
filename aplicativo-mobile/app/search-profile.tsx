import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Result = { user_id: string; full_name: string; job_title: string | null; coverage_area: string | null; avatar_url: string | null };

export default function SearchProfileScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); setMessage(''); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setMessage('');
      const { data, error } = await supabase.rpc('search_public_professional_profiles', { p_search: value });
      if (!active) return;
      if (error) setMessage(error.message); else setResults((data ?? []) as Result[]);
      setLoading(false);
    }, 320);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  return <View style={styles.page}><FioPageHeader eyebrow="PERFIS PÚBLICOS" title="Buscar perfil" subtitle="Encontre profissionais autorizados no FIO." /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.search}><Ionicons name="search-outline" size={20} color={FioColors.textMuted} /><TextInput value={query} onChangeText={setQuery} autoFocus placeholder="Nome, função ou cidade" placeholderTextColor={FioColors.textSoft} style={styles.input} /></View>{loading && <ActivityIndicator color={FioColors.green} />}{!!message && <Text style={styles.error}>{message}</Text>}{!loading && query.trim().length >= 2 && !results.length && !message && <Text style={styles.empty}>Nenhum perfil público encontrado.</Text>}{results.map((item) => <Pressable key={item.user_id} style={styles.card} onPress={() => router.push({ pathname: '/public-profile', params: { userId: item.user_id } })}><View style={styles.avatar}>{item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.initial}>{item.full_name.slice(0, 1).toUpperCase()}</Text>}</View><View style={styles.identity}><Text style={styles.name}>{item.full_name}</Text><Text style={styles.role}>{item.job_title || 'Profissional do FIO'}</Text><Text style={styles.area}>{item.coverage_area || 'Área não informada'}</Text></View><Ionicons name="chevron-forward-outline" size={20} color={FioColors.textSoft} /></Pressable>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: FioColors.canvas }, content: { padding: 16, gap: 11 }, search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, input: { flex: 1, color: FioColors.text, fontSize: 15 }, card: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 999, backgroundColor: FioColors.greenSoft }, avatarImage: { width: '100%', height: '100%' }, initial: { fontSize: 18, fontWeight: '900', color: FioColors.green }, identity: { flex: 1 }, name: { fontSize: 14, fontWeight: '900', color: FioColors.text }, role: { marginTop: 3, fontSize: 11, fontWeight: '800', color: FioColors.green }, area: { marginTop: 2, fontSize: 10, color: FioColors.textMuted }, empty: { padding: 18, textAlign: 'center', color: FioColors.textMuted }, error: { padding: 12, color: FioColors.danger, backgroundColor: FioColors.dangerSoft } });
