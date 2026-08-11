import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';
import { ProfileAvatar } from '@/components/profile-avatar';

const JOB_OPTIONS = [
  'Montador',
  'Gestor de obras',
  'Marceneiro',
  'Arquiteto',
  'Engenheiro',
  'Outro',
];

export default function EditProfileScreen() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [customJobTitle, setCustomJobTitle] = useState('');
  const [coverageArea, setCoverageArea] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [userId, setUserId] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setMessage('');

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setMessage('Não foi possível identificar sua conta.');
      setLoading(false);
      return;
    }

    setUserId(user.id);
    setEmail(user.email ?? '');

    const { data, error } = await supabase
      .from('profiles')
      .select(
        'full_name, phone, job_title, coverage_area, avatar_url'
      )
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      setLoading(false);
      return;
    }

    if (data) {
      setFullName(data.full_name ?? '');
      setPhone(data.phone ?? '');
      setCoverageArea(data.coverage_area ?? '');
      setAvatarUrl(data.avatar_url ?? '');

      const savedJobTitle = data.job_title ?? '';

      if (JOB_OPTIONS.includes(savedJobTitle)) {
        setJobTitle(savedJobTitle);
        setCustomJobTitle('');
      } else if (savedJobTitle) {
        setJobTitle('Outro');
        setCustomJobTitle(savedJobTitle);
      }
    }

    setLoading(false);
  }

  async function handleSave() {
    setMessage('');

    const finalJobTitle =
      jobTitle === 'Outro'
        ? customJobTitle.trim()
        : jobTitle.trim();

    if (!fullName.trim()) {
      setMessage('Informe seu nome completo.');
      return;
    }

    if (!phone.trim()) {
      setMessage('Informe seu telefone.');
      return;
    }

    if (!finalJobTitle) {
      setMessage('Informe sua função.');
      return;
    }

    if (!coverageArea.trim()) {
      setMessage('Informe sua área de atuação.');
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

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim(),
        job_title: finalJobTitle,
        coverage_area: coverageArea.trim(),
      })
      .eq('id', user.id);

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.replace('/profile');
  }

  function handleCancel() {
    router.replace('/profile');
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
       {userId && (
  <ProfileAvatar
    userId={userId}
    fullName={fullName}
    avatarUrl={avatarUrl}
    editable
    onUploaded={setAvatarUrl}
  />
)}

        <Text style={styles.title}>Editar perfil</Text>

        <Text style={styles.subtitle}>
          Atualize suas informações profissionais no FIO.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>
          DADOS DO PERFIL
        </Text>

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
          <Text style={styles.disabledText}>
            {email}
          </Text>
        </View>

        <Text style={styles.helper}>
          O e-mail é vinculado à sua conta e não pode ser
          alterado aqui.
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

        <Text style={styles.label}>Função</Text>

        <View style={styles.options}>
          {JOB_OPTIONS.map((option) => {
            const selected = jobTitle === option;

            return (
              <Pressable
                key={option}
                style={[
                  styles.option,
                  selected && styles.optionSelected,
                ]}
                onPress={() => setJobTitle(option)}
              >
                <Text
                  style={[
                    styles.optionText,
                    selected && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {jobTitle === 'Outro' && (
          <>
            <Text style={styles.label}>
              Qual função?
            </Text>

            <TextInput
              style={styles.input}
              value={customJobTitle}
              onChangeText={setCustomJobTitle}
              placeholder="Digite sua função"
              placeholderTextColor="#8A9094"
            />
          </>
        )}

        <Text style={styles.label}>
          Área de atuação
        </Text>

        <TextInput
          style={styles.input}
          value={coverageArea}
          onChangeText={setCoverageArea}
          placeholder="Ex.: Florianópolis e região"
          placeholderTextColor="#8A9094"
        />
      </View>

      {!!message && (
        <Text style={styles.message}>
          {message}
        </Text>
      )}

      <Pressable
        style={[
          styles.saveButton,
          saving && styles.buttonDisabled,
        ]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveButtonText}>
            Salvar alterações
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.cancelButton}
        onPress={handleCancel}
        disabled={saving}
      >
        <Text style={styles.cancelButtonText}>
          Cancelar
        </Text>
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
    backgroundColor: '#F7F7F5',
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
    backgroundColor: '#F7F7F5',
  },

  header: {
    marginBottom: 28,
  },

  brand: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2C343A',
    letterSpacing: 2,
  },

  brandSubtitle: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#5F7567',
    letterSpacing: 2,
  },

  profileHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },

  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4E7E3',
    marginBottom: 16,
  },

  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    marginBottom: 16,
  },

  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#5F7567',
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2C343A',
  },

  subtitle: {
    marginTop: 7,
    fontSize: 14,
    color: '#687177',
    textAlign: 'center',
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E7E9E6',
  },

  sectionTitle: {
    marginBottom: 20,
    fontSize: 11,
    fontWeight: '800',
    color: '#5F7567',
    letterSpacing: 1.4,
  },

  label: {
    marginTop: 14,
    marginBottom: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#2C343A',
  },

  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#2C343A',
    backgroundColor: '#FFFFFF',
  },

  disabledInput: {
    minHeight: 50,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E1E3E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F3F4F2',
  },

  disabledText: {
    fontSize: 15,
    color: '#687177',
  },

  helper: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: '#8A9094',
  },

  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  option: {
    borderWidth: 1,
    borderColor: '#D8DCDA',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
  },

  optionSelected: {
    borderColor: '#E07A3A',
    backgroundColor: '#FFF2EA',
  },

  optionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#596269',
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

  saveButton: {
    minHeight: 54,
    marginTop: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07A3A',
  },

  saveButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  cancelButton: {
    minHeight: 50,
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D8DCDA',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },

  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#596269',
  },

  buttonDisabled: {
    opacity: 0.65,
  },

  footer: {
    marginTop: 24,
    textAlign: 'center',
    fontSize: 12,
    color: '#8A9094',
  },
});