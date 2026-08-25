import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

const JOBS = ['Montador', 'Gestor de obras', 'Marceneiro', 'Arquiteto', 'Engenheiro', 'Outro'];

export default function EditMyProfessionalProfileScreen() {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [job, setJob] = useState('');
  const [customJob, setCustomJob] = useState('');
  const [area, setArea] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState('');
  const [cover, setCover] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { void load(); }, []);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setMessage('Não foi possível identificar sua conta.'); setLoading(false); return; }
    setUserId(user.id);
    const result = await supabase.from('profiles').select('professional_name, professional_phone, professional_whatsapp, professional_email, professional_bio, professional_avatar_url, professional_cover_url, job_title, coverage_area').eq('id', user.id).maybeSingle();
    if (result.error) { setMessage(result.error.message); setLoading(false); return; }
    const row = result.data;
    setName(row?.professional_name ?? '');
    setPhone(row?.professional_phone ?? '');
    setWhatsapp(row?.professional_whatsapp ?? '');
    setEmail(row?.professional_email ?? '');
    setArea(row?.coverage_area ?? '');
    setBio(row?.professional_bio ?? '');
    setAvatar(row?.professional_avatar_url ?? '');
    setCover(row?.professional_cover_url ?? '');
    const savedJob = row?.job_title ?? '';
    if (JOBS.includes(savedJob)) setJob(savedJob); else if (savedJob) { setJob('Outro'); setCustomJob(savedJob); }
    setLoading(false);
  }

  async function upload(kind: 'avatar' | 'cover') {
    if (!userId) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: kind === 'cover' ? [16, 7] : [1, 1], quality: 0.82 });
    if (result.canceled) return;
    setMessage('Enviando imagem...');
    const asset = result.assets[0];
    const bytes = await fetch(asset.uri).then((response) => response.arrayBuffer());
    const path = `${userId}/professional-${kind}`;
    const sent = await supabase.storage.from('avatars').upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', cacheControl: '3600', upsert: true });
    if (sent.error) { setMessage(sent.error.message); return; }
    const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    const saved = await supabase.rpc(kind === 'avatar' ? 'set_my_professional_avatar' : 'set_my_professional_cover', kind === 'avatar' ? { p_avatar_url: url } : { p_cover_url: url });
    if (saved.error) { setMessage(saved.error.message); return; }
    if (kind === 'avatar') setAvatar(url); else setCover(url);
    setMessage('Imagem atualizada.');
  }

  async function save() {
    const finalJob = job === 'Outro' ? customJob.trim() : job.trim();
    if (!name.trim() || !finalJob || !area.trim()) { setMessage('Informe nome profissional, função e área de atuação.'); return; }
    setSaving(true); setMessage('');
    const result = await supabase.rpc('save_my_professional_profile', {
      p_professional_name: name.trim(), p_professional_phone: phone.trim(), p_professional_whatsapp: whatsapp.trim(),
      p_professional_email: email.trim(), p_job_title: finalJob, p_coverage_area: area.trim(), p_professional_bio: bio.trim(),
    });
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    router.replace({ pathname: '/public-profile', params: { userId, preview: '1' } });
  }

  if (loading) return <View style={styles.loading}><ActivityIndicator color={FioColors.gold} /></View>;
  return <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={FioColors.text} /></Pressable><View><Text style={styles.title}>Editar perfil profissional</Text><Text style={styles.subtitle}>Estes dados aparecem somente no seu perfil profissional.</Text></View></View>
      <Pressable style={styles.cover} onPress={() => void upload('cover')}>{cover ? <Image source={{ uri: cover }} style={styles.image} /> : <Ionicons name="image-outline" size={34} color={FioColors.gold} />}<Text style={styles.mediaLabel}>{cover ? 'Trocar foto de capa' : 'Adicionar foto de capa'}</Text></Pressable>
      <Pressable style={styles.avatar} onPress={() => void upload('avatar')}>{avatar ? <Image source={{ uri: avatar }} style={styles.image} /> : <Ionicons name="person-outline" size={35} color={FioColors.green} />}<View style={styles.camera}><Ionicons name="camera" size={15} color={FioColors.white} /></View></Pressable>
      <View style={styles.card}>
        <Text style={styles.section}>IDENTIDADE PROFISSIONAL</Text>
        <Field label="Nome profissional" value={name} onChangeText={setName} placeholder="Ex.: Bigode" />
        <Text style={styles.label}>Função</Text><View style={styles.options}>{JOBS.map((item) => <Pressable key={item} style={[styles.option, job === item && styles.optionActive]} onPress={() => setJob(item)}><Text style={[styles.optionText, job === item && styles.optionTextActive]}>{item}</Text></Pressable>)}</View>
        {job === 'Outro' && <Field label="Qual função?" value={customJob} onChangeText={setCustomJob} placeholder="Digite sua função" />}
        <Field label="Área de atuação" value={area} onChangeText={setArea} placeholder="Ex.: Florianópolis e região" />
        <Field label="Apresentação profissional" value={bio} onChangeText={setBio} placeholder="Conte sobre seu trabalho e experiência" multiline />
      </View>
      <View style={styles.card}><Text style={styles.section}>CONTATO PROFISSIONAL</Text><Field label="Telefone profissional" value={phone} onChangeText={setPhone} placeholder="(00) 00000-0000" keyboardType="phone-pad" /><Field label="WhatsApp" value={whatsapp} onChangeText={setWhatsapp} placeholder="(00) 00000-0000" keyboardType="phone-pad" /><Field label="E-mail profissional" value={email} onChangeText={setEmail} placeholder="contato@empresa.com" keyboardType="email-address" /></View>
      {!!message && <Text style={styles.message}>{message}</Text>}
      <Pressable disabled={saving} style={[styles.save, saving && styles.disabled]} onPress={() => void save()}>{saving ? <ActivityIndicator color={FioColors.white} /> : <Text style={styles.saveText}>Salvar perfil profissional</Text>}</Pressable>
    </ScrollView>
  </KeyboardAvoidingView>;
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; multiline?: boolean; keyboardType?: 'phone-pad' | 'email-address' }) {
  return <><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor={FioColors.textSoft} style={[styles.input, props.multiline && styles.textarea]} autoCapitalize={props.keyboardType === 'email-address' ? 'none' : 'sentences'} /></>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 18, paddingBottom: 60 }, top: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 }, title: { fontSize: 22, fontWeight: '900', color: FioColors.text }, subtitle: { marginTop: 3, fontSize: 11, color: FioColors.textMuted },
  cover: { height: 145, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: FioRadius.large, backgroundColor: FioColors.inkSoft }, image: { width: '100%', height: '100%' }, mediaLabel: { position: 'absolute', right: 10, bottom: 10, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, overflow: 'hidden', color: FioColors.white, backgroundColor: 'rgba(0,0,0,.55)', fontSize: 10, fontWeight: '800' },
  avatar: { width: 92, height: 92, marginTop: -46, marginLeft: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 4, borderColor: FioColors.canvas, borderRadius: 46, backgroundColor: FioColors.surfaceMuted }, camera: { position: 'absolute', right: 2, bottom: 2, width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: FioColors.orange },
  card: { marginTop: 16, padding: 18, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface }, section: { marginBottom: 5, fontSize: 11, fontWeight: '900', letterSpacing: 1.1, color: FioColors.green }, label: { marginTop: 14, marginBottom: 7, fontSize: 12, fontWeight: '800', color: FioColors.text }, input: { minHeight: 49, paddingHorizontal: 13, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 12, color: FioColors.text, backgroundColor: FioColors.surfaceMuted }, textarea: { minHeight: 110, paddingTop: 13, textAlignVertical: 'top' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, option: { paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: FioColors.lineStrong, borderRadius: 999 }, optionActive: { borderColor: FioColors.orange, backgroundColor: FioColors.orangeSoft }, optionText: { fontSize: 11, fontWeight: '700', color: FioColors.textMuted }, optionTextActive: { color: FioColors.orange }, message: { marginTop: 14, textAlign: 'center', color: FioColors.orange }, save: { minHeight: 54, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: FioColors.orange }, saveText: { color: FioColors.white, fontWeight: '900' }, disabled: { opacity: .6 },
});
