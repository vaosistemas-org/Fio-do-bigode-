import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { FioPageHeader } from '@/components/fio-shell/FioPageHeader';
import { FioColors, FioRadius } from '@/constants/fio-theme';

export default function MessagesScreen() {
  return (
    <View style={styles.page}>
      <FioPageHeader
        eyebrow="CENTRAL"
        title="Mensagens"
        subtitle="Conversas ligadas às suas obras e aos seus vínculos."
      />
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <Ionicons name="chatbubbles-outline" size={28} color={FioColors.gold} />
          </View>
          <Text style={styles.title}>Nenhuma conversa ainda</Text>
          <Text style={styles.text}>
            A central já ocupa o lugar correto na navegação. As conversas serão
            conectadas aqui sem misturá-las com o FIO das obras.
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: FioColors.canvas },
  content: { flex: 1, width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16, paddingTop: 24 },
  card: { alignItems: 'center', padding: 30, borderWidth: 1, borderColor: FioColors.line, borderRadius: FioRadius.large, backgroundColor: FioColors.surface },
  icon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: FioColors.goldSoft },
  title: { marginTop: 13, fontSize: 17, fontWeight: '900', color: FioColors.text },
  text: { maxWidth: 420, marginTop: 7, textAlign: 'center', fontSize: 12, lineHeight: 18, color: FioColors.textMuted },
});
