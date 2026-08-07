import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
async function handleLogout() {
  await supabase.auth.signOut();
}
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>FIO DO BIGODE</Text>
        <Text style={styles.title}>Minhas obras</Text>
        <Text style={styles.subtitle}>
          Acompanhe o andamento, as pendências e as próximas visitas.
        </Text>
      </View>

<Pressable onPress={handleLogout}>
  <Text>Sair</Text>
</Pressable>

      <View style={styles.summary}>
        <View>
          <Text style={styles.summaryNumber}>3</Text>
          <Text style={styles.summaryLabel}>Obras ativas</Text>
        </View>

        <View>
          <Text style={styles.summaryNumber}>5</Text>
          <Text style={styles.summaryLabel}>Pendências</Text>
        </View>

        <View>
          <Text style={styles.summaryNumber}>2</Text>
          <Text style={styles.summaryLabel}>Visitas hoje</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Obras recentes</Text>

        <Pressable>
          <Text style={styles.link}>Ver todas</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View>
            <Text style={styles.clientName}>Residência Almeida</Text>
            <Text style={styles.address}>Florianópolis · SC</Text>
          </View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>Em montagem</Text>
          </View>
        </View>

        <Text style={styles.progressLabel}>Progresso da obra</Text>

        <View style={styles.progressBackground}>
          <View style={styles.progressValue} />
        </View>

        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>65% concluída</Text>
          <Text style={styles.nextVisit}>Próxima visita: 8 de agosto</Text>
        </View>

        <Pressable style={styles.cardButton}>
          <Text style={styles.cardButtonText}>Abrir obra</Text>
        </Pressable>
      </View>

      <Pressable style={styles.newProjectButton}>
        <Text style={styles.newProjectButtonText}>+ Nova obra</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5F4F0',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },

  header: {
    marginBottom: 24,
  },

  brand: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#6D6A63',
    marginBottom: 10,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#181816',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#6D6A63',
  },

  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#181816',
    borderRadius: 18,
    padding: 20,
    marginBottom: 30,
  },

  summaryNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  summaryLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#C9C7BF',
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#181816',
  },

  link: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6D6A63',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 22,
  },

  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },

  clientName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#181816',
  },

  address: {
    marginTop: 4,
    fontSize: 13,
    color: '#77746D',
  },

  statusBadge: {
    backgroundColor: '#EEECE6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#514F49',
  },

  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#514F49',
    marginBottom: 8,
  },

  progressBackground: {
    height: 8,
    backgroundColor: '#E5E2DA',
    borderRadius: 20,
    overflow: 'hidden',
  },

  progressValue: {
    width: '65%',
    height: '100%',
    backgroundColor: '#181816',
    borderRadius: 20,
  },

  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
    marginBottom: 20,
  },

  progressText: {
    fontSize: 12,
    color: '#514F49',
  },

  nextVisit: {
    fontSize: 12,
    color: '#77746D',
  },

  cardButton: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#181816',
    borderRadius: 12,
    paddingVertical: 13,
  },

  cardButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#181816',
  },

  newProjectButton: {
    alignItems: 'center',
    backgroundColor: '#181816',
    borderRadius: 14,
    paddingVertical: 16,
  },

  newProjectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});