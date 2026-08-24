import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FioColors } from '@/constants/fio-theme';

export const FIO_CLIENT_SIDEBAR_WIDTH = 86;
const items: { label: string; href: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Página inicial', href: '/client/home', icon: 'home-outline' },
  { label: 'Minhas obras', href: '/client/works', icon: 'business-outline' },
  { label: 'Meu FIO', href: '/client/fio', icon: 'pulse-outline' },
  { label: 'Configurações', href: '/client/settings', icon: 'settings-outline' },
];
export function FioClientSidebar({ hasProfessionalAccess = false }: { hasProfessionalAccess?: boolean }) {
  const router = useRouter(); const pathname = usePathname(); const insets = useSafeAreaInsets();
  return <View style={[styles.bar, { paddingTop: Math.max(14, insets.top), paddingBottom: Math.max(14, insets.bottom) }]}><View style={styles.mark}><Text style={styles.letter}>F</Text></View><Text style={styles.caption}>CLIENTE</Text><View style={styles.items}>{items.map((item) => { const active = pathname.startsWith(item.href); return <Pressable key={item.href} style={[styles.item, active && styles.active]} onPress={() => router.replace(item.href as never)}><Ionicons name={item.icon} size={21} color={active ? FioColors.textOnAccent : FioColors.green} /><Text numberOfLines={1} style={[styles.label, active && styles.labelActive]}>{item.label}</Text></Pressable>; })}</View>{hasProfessionalAccess && <Pressable style={styles.switchArea} onPress={() => router.replace('/home')}><Ionicons name="briefcase-outline" size={18} color={FioColors.gold}/><Text style={styles.switchText}>Área profissional</Text></Pressable>}</View>;
}
const styles = StyleSheet.create({ bar:{position:'absolute',left:0,top:0,bottom:0,width:FIO_CLIENT_SIDEBAR_WIDTH,zIndex:100,paddingHorizontal:7,backgroundColor:FioColors.surfaceMuted,borderRightWidth:1,borderRightColor:FioColors.line},mark:{width:38,height:38,alignSelf:'center',alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:FioColors.surfaceRaised,borderWidth:1,borderColor:FioColors.lineStrong},letter:{fontSize:22,fontFamily:'serif',fontWeight:'900',color:FioColors.gold},caption:{marginTop:8,textAlign:'center',fontSize:8,fontWeight:'900',letterSpacing:1,color:FioColors.gold},items:{flex:1,marginTop:18,gap:8},item:{minHeight:62,alignItems:'center',justifyContent:'center',gap:4,borderRadius:12},active:{backgroundColor:FioColors.green},label:{fontSize:8,fontWeight:'900',color:FioColors.textMuted,textAlign:'center'},labelActive:{color:FioColors.textOnAccent},switchArea:{minHeight:56,alignItems:'center',justifyContent:'center',gap:4,borderTopWidth:1,borderTopColor:FioColors.line},switchText:{fontSize:8,fontWeight:'900',color:FioColors.gold,textAlign:'center'} });
