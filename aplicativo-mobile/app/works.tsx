import { useRouter } from 'expo-router';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function WorksScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brand}>FIO</Text>
          <Text style={styles.brandSubtitle}>GESTÃO DE OBRAS</Text>
        </View>

        <Pressable
          style={styles.profileButton}
          onPress={() => router.push('/profile')}
        >
          <Text style={styles.profileButtonText}>Meu FIO</Text>
        </Pressable>
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Minhas obras</Text>

        <Text style={styles.subtitle}>
          Acompanhe o andamento, as pendências e as próximas visitas.
        </Text>
      </View>

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

      <Text style={styles.sectionTitle}>Obras recentes</Text>

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

          <Text style={styles.nextVisit}>
            Próxima visita: 8 de agosto
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F7F7F5',
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 34,
  },

  brand: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#2C343A',
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: '#5F7567',
  },

  profileButton: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },

  profileButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  header: {
    marginBottom: 24,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2C343A',
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    lineHeight: 23,
    color: '#687177',
  },

  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#2C343A',
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
    color: '#D7DBD8',
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2C343A',
    marginBottom: 14,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E7E9E6',
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
    color: '#2C343A',
  },

  address: {
    marginTop: 4,
    fontSize: 13,
    color: '#777D80',
  },

  statusBadge: {
    backgroundColor: '#EEF1ED',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5F7567',
  },

  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#596269',
    marginBottom: 8,
  },

  progressBackground: {
    height: 8,
    backgroundColor: '#E5E7E4',
    borderRadius: 20,
    overflow: 'hidden',
  },

  progressValue: {
    width: '65%',
    height: '100%',
    backgroundColor: '#5F7567',
    borderRadius: 20,
  },

  progressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 9,
  },

  progressText: {
    fontSize: 12,
    color: '#596269',
  },

  nextVisit: {
    fontSize: 12,
    color: '#777D80',
  },
});