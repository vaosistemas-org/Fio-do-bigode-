import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { FioColors, FioRadius, FioShadow } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Company = { id: string; name: string; business_type: string | null; description: string | null; logo_path: string | null; cover_url: string | null; phone: string | null; whatsapp: string | null; email: string | null; website: string | null; instagram: string | null; city: string | null; state: string | null; coverage_area: string | null; services: string[]; can_manage: boolean };
type Member = { user_id: string; display_name: string; job_title: string | null; avatar_url: string | null; role_title: string | null };

export default function CompanyPublicProfileScreen() {
  const router = useRouter();
  const { companyId } = useLocalSearchParams<{ companyId?: string }>();
  const [company, setCompany] = useState<Company | null>(null);
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!companyId || Array.isArray(companyId)) { setMessage('Empresa não encontrada.'); setLoading(false); return; }
    setLoading(true);
    const [profile, members] = await Promise.all([supabase.rpc('get_public_company_profile', { p_company_id: companyId }), supabase.rpc('get_public_company_team', { p_company_id: companyId })]);
    if (profile.error) { setMessage(profile.error.message); setCompany(null); } else setCompany(profile.data?.[0] ?? null);
    if (!members.error) setTeam((members.data ?? []) as Member[]);
    setLoading(false);
  }, [companyId]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (loading) return <View style={styles.loading}><ActivityIndicator color={FioColors.gold} /></View>;
  if (!company) return <View style={styles.loading}><Text style={styles.error}>{message || 'Empresa não encontrada.'}</Text><Pressable onPress={() => router.back()}><Text style={styles.backText}>Voltar</Text></Pressable></View>;
  return <View style={styles.page}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.top}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color={FioColors.text} /></Pressable><View style={styles.brand}><Text style={styles.brandName}>Fio do Bigode</Text><Text style={styles.brandSub}>Perfil público da empresa</Text></View><Pressable onPress={() => void Share.share({ message: `${company.name} no FIO — Gestão de Obras.` })}><Ionicons name="share-social-outline" size={22} color={FioColors.text} /></Pressable></View>
    <View style={styles.cover}>{company.cover_url ? <Image source={{ uri: company.cover_url }} style={styles.image} /> : <Ionicons name="storefront-outline" size={48} color={FioColors.gold} />}</View>
    <View style={styles.hero}><View style={styles.logo}>{company.logo_path ? <Image source={{ uri: company.logo_path }} style={styles.image} /> : <Text style={styles.initial}>{company.name[0]?.toUpperCase()}</Text>}</View><View style={styles.identity}><Text style={styles.name}>{company.name}</Text><Text style={styles.kind}>{company.business_type || 'Empresa do FIO'}</Text><Text style={styles.location}>{[company.city, company.state].filter(Boolean).join(' · ') || company.coverage_area || 'Localização não informada'}</Text></View>{company.can_manage && <Pressable style={styles.edit} onPress={() => router.push({ pathname: '/edit-professional-profile', params: { companyId: company.id } })}><Ionicons name="create-outline" size={17} color={FioColors.orange} /><Text style={styles.editText}>Editar</Text></Pressable>}</View>
    {!!company.description && <Card title="SOBRE"><Text style={styles.body}>{company.description}</Text></Card>}
    <Card title="CONTATO DA EMPRESA">{company.phone && <Row icon="call-outline" text={company.phone} />}{company.whatsapp && <Row icon="logo-whatsapp" text={company.whatsapp} />}{company.email && <Row icon="mail-outline" text={company.email} />}{company.website && <Row icon="globe-outline" text={company.website} />}{company.instagram && <Row icon="logo-instagram" text={company.instagram} />}{!company.phone && !company.whatsapp && !company.email && <Text style={styles.muted}>Nenhum contato público informado.</Text>}</Card>
    <Card title="SERVIÇOS E ATUAÇÃO"><Text style={styles.body}>{company.services?.length ? company.services.join(' · ') : 'Serviços ainda não informados.'}</Text>{company.coverage_area && <Row icon="location-outline" text={company.coverage_area} />}</Card>
    <Card title="EQUIPE VINCULADA">{team.length ? team.map((member) => <Pressable key={member.user_id} style={styles.member} onPress={() => router.push({ pathname: '/public-profile', params: { userId: member.user_id } })}><View style={styles.memberAvatar}>{member.avatar_url ? <Image source={{ uri: member.avatar_url }} style={styles.image} /> : <Ionicons name="person-outline" size={20} color={FioColors.green} />}</View><View style={styles.identity}><Text style={styles.memberName}>{member.display_name}</Text><Text style={styles.muted}>{member.role_title || member.job_title || 'Profissional'}</Text></View><Ionicons name="chevron-forward" size={18} color={FioColors.textSoft} /></Pressable>) : <Text style={styles.muted}>Nenhum integrante público informado.</Text>}{company.can_manage && <Pressable style={styles.teamButton} onPress={() => router.push({ pathname: '/company-team', params: { companyId: company.id } })}><Text style={styles.teamButtonText}>Gerenciar equipe</Text></Pressable>}</Card>
    <View style={styles.note}><Ionicons name="shield-checkmark-outline" size={18} color={FioColors.green} /><Text style={styles.noteText}>Esta página mostra somente informações públicas da empresa e da equipe.</Text></View>
  </ScrollView></View>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.section}>{title}</Text>{children}</View>; }
function Row({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) { return <View style={styles.row}><Ionicons name={icon} size={18} color={FioColors.green} /><Text style={styles.body}>{text}</Text></View>; }
const styles = StyleSheet.create({ page:{flex:1,backgroundColor:FioColors.canvas},loading:{flex:1,alignItems:'center',justifyContent:'center',gap:16,backgroundColor:FioColors.canvas},content:{width:'100%',maxWidth:720,alignSelf:'center',padding:14,paddingBottom:60},top:{minHeight:64,flexDirection:'row',alignItems:'center',gap:13},brand:{flex:1},brandName:{fontSize:18,fontWeight:'900',color:FioColors.text},brandSub:{fontSize:9,color:FioColors.gold},cover:{height:150,alignItems:'center',justifyContent:'center',overflow:'hidden',borderRadius:FioRadius.large,backgroundColor:FioColors.inkSoft},image:{width:'100%',height:'100%'},hero:{marginTop:-32,marginHorizontal:9,padding:15,paddingTop:42,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:FioColors.line,borderRadius:FioRadius.large,backgroundColor:FioColors.surface,...FioShadow},logo:{position:'absolute',top:-43,left:15,width:82,height:82,alignItems:'center',justifyContent:'center',overflow:'hidden',borderWidth:4,borderColor:FioColors.greenSoft,borderRadius:20,backgroundColor:FioColors.gold},initial:{fontSize:28,fontWeight:'900',color:FioColors.ink},identity:{flex:1},name:{fontSize:21,fontWeight:'900',color:FioColors.text},kind:{marginTop:3,fontSize:12,fontWeight:'800',color:FioColors.green},location:{marginTop:5,fontSize:10,color:FioColors.textMuted},edit:{flexDirection:'row',alignItems:'center',gap:4,padding:9,borderRadius:10,backgroundColor:FioColors.orangeSoft},editText:{fontSize:10,fontWeight:'900',color:FioColors.orange},card:{marginTop:12,padding:17,borderWidth:1,borderColor:FioColors.line,borderRadius:FioRadius.large,backgroundColor:FioColors.surface},section:{marginBottom:11,fontSize:10,fontWeight:'900',letterSpacing:1.1,color:FioColors.green},body:{flexShrink:1,fontSize:12,lineHeight:18,color:FioColors.text},muted:{fontSize:10,color:FioColors.textMuted},row:{marginTop:8,flexDirection:'row',alignItems:'center',gap:9},member:{minHeight:58,flexDirection:'row',alignItems:'center',gap:10,borderTopWidth:1,borderTopColor:FioColors.line},memberAvatar:{width:39,height:39,alignItems:'center',justifyContent:'center',overflow:'hidden',borderRadius:20,backgroundColor:FioColors.greenSoft},memberName:{fontSize:12,fontWeight:'900',color:FioColors.text},teamButton:{minHeight:40,marginTop:12,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:FioColors.greenSoft},teamButtonText:{fontSize:10,fontWeight:'900',color:FioColors.green},note:{marginTop:12,flexDirection:'row',gap:8,padding:14},noteText:{flex:1,fontSize:10,lineHeight:15,color:FioColors.textMuted},error:{color:FioColors.danger},backText:{color:FioColors.green,fontWeight:'800'} });
