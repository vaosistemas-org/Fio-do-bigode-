import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';
import { supabase } from '@/lib/supabase';

type Counts = { active: number; invitations: number; requests: number };

export default function LinksScreen() {
  const router = useRouter();
  const [counts, setCounts] = useState<Counts>({ active: 0, invitations: 0, requests: 0 });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    const [contexts, invitations, requests] = await Promise.all([
      supabase.rpc('get_my_company_contexts'),
      supabase.rpc('get_my_company_invitations'),
      supabase.rpc('get_pending_company_links'),
    ]);

    const error = contexts.error || invitations.error || requests.error;
    if (error) setMessage(error.message);
    setCounts({
      active: Array.isArray(contexts.data) ? contexts.data.length : 0,
      invitations: Array.isArray(invitations.data) ? invitations.data.length : 0,
      requests: Array.isArray(requests.data) ? requests.data.length : 0,
    });
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="REDE PROFISSIONAL"
        title="Vínculos"
        subtitle="Busque, aceite ou recuse vínculos em um único lugar."
        actionIcon="refresh-outline"
        actionLabel="Atualizar vínculos"
        onAction={load}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={FioColors.gold} />
        ) : (
          <>
            <View style={styles.summary}>
              <Summary value={counts.active} label="Ativos" />
              <Summary value={counts.invitations} label="Convites" />
              <Summary value={counts.requests} label="Solicitações" />
            </View>

            {!!message && <Text style={styles.error}>{message}</Text>}

            <View style={styles.actions}>
              <LinkAction
                icon="search-outline"
                title="Buscar vínculo"
                subtitle="Encontre uma empresa no FIO"
                onPress={() => router.push('/company-link')}
              />
              <LinkAction
                icon="mail-unread-outline"
                title="Convites recebidos"
                subtitle={`${counts.invitations} aguardando sua resposta`}
                badge={counts.invitations}
                onPress={() => router.push('/company-invitations')}
              />
              <LinkAction
                icon="people-outline"
                title="Solicitações para analisar"
                subtitle="Aprove ou recuse vínculos com sua empresa"
                badge={counts.requests}
                onPress={() => router.push('/company-link-requests')}
              />
              <LinkAction
                icon="storefront-outline"
                title="Meus vínculos ativos"
                subtitle="Veja as empresas às quais você está ligado"
                onPress={() => router.push('/company')}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Summary({ value, label }: { value: number; label: string }) {
  return <View style={styles.summaryItem}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>;
}

function LinkAction({ icon, title, subtitle, badge, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable style={styles.action} onPress={onPress}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={22} color={FioColors.green} /></View>
      <View style={styles.actionIdentity}><Text style={styles.actionTitle}>{title}</Text><Text style={styles.actionSubtitle}>{subtitle}</Text></View>
      {!!badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      <Ionicons name="chevron-forward-outline" size={19} color={FioColors.textSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { width: '100%', maxWidth: 800, alignSelf: 'center', padding: 16, paddingTop: 24, paddingBottom: 70 },
  summary: { flexDirection: 'row', borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 17 },
  summaryValue: { fontSize: 23, fontWeight: '900', color: FioColors.text },
  summaryLabel: { marginTop: 3, fontSize: 9, color: FioColors.textMuted },
  actions: { marginTop: 15, gap: 9 },
  action: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.medium, backgroundColor: FioColors.surface },
  actionIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: FioColors.greenSoft },
  actionIdentity: { flex: 1, minWidth: 0 },
  actionTitle: { fontSize: 13, fontWeight: '900', color: FioColors.text },
  actionSubtitle: { marginTop: 3, fontSize: 9, lineHeight: 13, color: FioColors.textMuted },
  badge: { minWidth: 25, height: 25, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.orange },
  badgeText: { fontSize: 9, fontWeight: '900', color: FioColors.white },
  error: { marginTop: 12, padding: 12, borderRadius: 11, color: FioColors.danger, backgroundColor: FioColors.dangerSoft },
});
