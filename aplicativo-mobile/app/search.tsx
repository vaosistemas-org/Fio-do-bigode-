import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Result = { result_type: 'person' | 'company' | 'work'; result_id: string; title: string; subtitle: string; image_url: string | null };
const iconFor: Record<Result['result_type'], keyof typeof Ionicons.glyphMap> = { person: 'person-outline', company: 'storefront-outline', work: 'business-outline' };
const labelFor: Record<Result['result_type'], string> = { person: 'Pessoa', company: 'Loja ou empresa', work: 'Obra' };

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setResults([]); setMessage(''); return; }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setMessage('');
      const response = await supabase.rpc('search_fio_global', { p_search: term });
      if (!active) return;
      if (response.error) setMessage(response.error.message); else setResults((response.data ?? []) as Result[]);
      setLoading(false);
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);

  function openResult(item: Result) {
    if (item.result_type === 'person') router.push({ pathname: '/public-profile', params: { userId: item.result_id } });
    else if (item.result_type === 'company') router.push({ pathname: '/company-public-profile', params: { companyId: item.result_id } });
    else router.push({ pathname: '/works/[id]', params: { id: item.result_id } });
  }

  return <View style={styles.page}><FioPageHeader eyebrow="BUSCA GLOBAL" title="Buscar" subtitle="Pessoas, lojas, empresas e obras do FIO." /><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.searchBox}><Ionicons name="search-outline" size={21} color={FioColors.textMuted} /><TextInput autoFocus value={query} onChangeText={setQuery} placeholder="Nome, loja, obra ou código" placeholderTextColor={FioColors.textSoft} style={styles.input} /></View>{loading && <ActivityIndicator color={FioColors.green} />}{!!message && <Text style={styles.error}>{message}</Text>}{!loading && query.trim().length >= 2 && !results.length && !message && <View style={styles.empty}><Ionicons name="search-outline" size={28} color={FioColors.gold} /><Text style={styles.emptyTitle}>Nada encontrado</Text><Text style={styles.emptyText}>Tente outro nome, código ou termo.</Text></View>}{results.map((item) => <Pressable key={`${item.result_type}-${item.result_id}`} style={styles.card} onPress={() => openResult(item)}><View style={styles.avatar}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.image} /> : <Ionicons name={iconFor[item.result_type]} size={21} color={FioColors.green} />}</View><View style={styles.identity}><Text style={styles.kind}>{labelFor[item.result_type]}</Text><Text style={styles.title}>{item.title}</Text><Text style={styles.subtitle}>{item.subtitle}</Text></View><Ionicons name="chevron-forward-outline" size={19} color={FioColors.textSoft} /></Pressable>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: FioColors.canvas }, content: { padding: 16, gap: 11 }, searchBox: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 15, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, input: { flex: 1, color: FioColors.text, fontSize: 15 }, card: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface }, avatar: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 13, backgroundColor: FioColors.greenSoft }, image: { width: '100%', height: '100%' }, identity: { flex: 1 }, kind: { fontSize: 9, fontWeight: '900', letterSpacing: 1, color: FioColors.gold }, title: { marginTop: 3, fontSize: 14, fontWeight: '900', color: FioColors.text }, subtitle: { marginTop: 2, fontSize: 10, color: FioColors.textMuted }, empty: { alignItems: 'center', padding: 28 }, emptyTitle: { marginTop: 9, fontSize: 16, fontWeight: '900', color: FioColors.text }, emptyText: { marginTop: 4, fontSize: 11, color: FioColors.textMuted }, error: { padding: 12, borderRadius: 10, color: FioColors.danger, backgroundColor: FioColors.dangerSoft } });
