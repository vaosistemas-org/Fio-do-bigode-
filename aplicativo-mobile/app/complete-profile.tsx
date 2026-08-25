import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ProfileAvatar } from '@/components/profile-avatar';
import { supabase } from '@/lib/supabase';

export default function CompleteProfileScreen() {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? '');
    const { data } = await supabase
      .from('profiles')
      .select('full_name, phone, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setFullName(data.full_name ?? '');
      setPhone(data.phone ?? '');
      setAvatarUrl(data.avatar_url ?? '');
    }

    setLoading(false);
  }

  async function handleSave() {
    setMessage('');

    if (!fullName.trim()) {
      setMessage('Informe seu nome completo.');
      return;
    }

    if (!phone.trim()) {
      setMessage('Informe seu telefone.');
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage('Não foi possível identificar sua conta.');
      setSaving(false);
      return;
    }

    const { error } = await supabase.rpc('save_my_profile', {
      p_full_name: fullName.trim(),
      p_phone: phone.trim(),
    });

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    const { error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError) {
      setMessage(
        'Perfil salvo, mas não foi possível atualizar sua sessão.'
      );
      setSaving(false);
      return;
    }

    setSaving(false);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.brand}>FIO</Text>
        <Text style={styles.brandSubtitle}>
          GESTÃO DE OBRAS
        </Text>
      </View>

      <View style={styles.profileHeader}>
        <View style={styles.avatarWrapper}>
          {userId && (
            <ProfileAvatar
              userId={userId}
              fullName={fullName}
              avatarUrl={avatarUrl}
              editable
              onUploaded={setAvatarUrl}
            />
          )}
        </View>

        <Text style={styles.title}>Complete seu perfil</Text>

        <Text style={styles.subtitle}>Comece com seus dados básicos. Perfis profissionais e empresas podem ser adicionados depois.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>DADOS BÁSICOS</Text>

        <Text style={styles.label}>Nome completo</Text>

        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Seu nome completo"
          placeholderTextColor="#8A9094"
        />

        <Text style={styles.label}>E-mail</Text>

        <View style={styles.disabledInput}>
          <Text style={styles.disabledText}>{email}</Text>
        </View>

        <Text style={styles.helper}>
          O e-mail pertence à sua conta e não é alterado aqui.
        </Text>

        <Text style={styles.label}>Telefone</Text>

        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="(00) 00000-0000"
          placeholderTextColor="#8A9094"
          keyboardType="phone-pad"
        />

      </View>

      {!!message && (
        <Text style={styles.message}>{message}</Text>
      )}

      <Pressable
        style={[
          styles.button,
          saving && styles.buttonDisabled,
        ]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>
            Salvar e continuar
          </Text>
        )}
      </Pressable>

      <Text style={styles.footer}>
        Segue o fio da sua obra.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#242824',
  },

  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 48,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#242824',
  },

  header: {
    marginBottom: 34,
  },

  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F2F3EF',
    letterSpacing: 2,
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#74B892',
    letterSpacing: 2,
  },

  profileHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },

  avatarWrapper: {
    marginBottom: 16,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F2F3EF',
  },

  subtitle: {
    maxWidth: 360,
    marginTop: 8,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: '#687177',
  },

  card: {
    backgroundColor: '#2E332F',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E7E9E6',
  },

  sectionTitle: {
    marginBottom: 20,
    fontSize: 11,
    fontWeight: '800',
    color: '#74B892',
    letterSpacing: 1.4,
  },

  label: {
    marginTop: 14,
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#F2F3EF',
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#F2F3EF',
    backgroundColor: '#2E332F',
  },

  disabledInput: {
    minHeight: 50,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4C534D',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#292E2A',
  },

  disabledText: {
    fontSize: 15,
    color: '#C0C7C1',
  },

  helper: {
    marginTop: 6,
    fontSize: 11,
    color: '#8A9094',
  },

  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  option: {
    borderWidth: 1,
    borderColor: '#687069',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#2E332F',
  },

  optionSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#4B3B25',
  },

  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C0C7C1',
  },

  optionTextSelected: {
    color: '#A65B32',
  },

  message: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 13,
    color: '#A65B32',
  },

  button: {
    minHeight: 54,
    marginTop: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07A3A',
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 12,
    color: '#8A9094',
  },
});
