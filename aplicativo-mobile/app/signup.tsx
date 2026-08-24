import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

const COLORS = {
  graphite: '#F2F3EF',
  orange: '#FFB04A',
  sage: '#74B892',
  background: '#242824',
  white: '#2E332F',
  border: '#687069',
  muted: '#C0C7C1',
};

export default function SignupScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSignup() {
    setErrorMessage('');
    setSuccessMessage('');

    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail.');
      return;
    }

    if (!password) {
      setErrorMessage('Crie uma senha.');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('As senhas não coincidem.');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        /*
         * Não forçamos nenhuma rota aqui.
         * O _layout.tsx percebe que o usuário entrou
         * e que o perfil ainda está incompleto.
         * Então ele abre Complete Profile automaticamente.
         */
        return;
      }

      setSuccessMessage(
        'Conta criada. Verifique seu e-mail para confirmar o cadastro e depois entre no FIO.'
      );
    } catch {
      setErrorMessage(
        'Não foi possível criar a conta. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="light" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.topBar}>
            <View>
              <Text style={styles.logo}>FIO</Text>
              <Text style={styles.logoSubtitle}>
                GESTÃO DE OBRAS
              </Text>
            </View>

            <Pressable
              style={styles.backButton}
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.backButtonText}>
                Entrar
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>Criar conta</Text>

          <Text style={styles.subtitle}>
          Crie seu acesso. As possibilidades aumentam conforme seus vínculos e perfis.
          </Text>

          <Text style={styles.label}>E-mail</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />

          <Text style={styles.label}>Senha</Text>

          <View style={styles.passwordContainer}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Crie sua senha"
              placeholderTextColor={COLORS.muted}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={styles.passwordInput}
            />

            <Pressable
              onPress={() =>
                setShowPassword((current) => !current)
              }
              hitSlop={10}
            >
              <Text style={styles.passwordToggle}>
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.label}>
            Confirmar senha
          </Text>

          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Digite sua senha novamente"
            placeholderTextColor={COLORS.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={styles.input}
          />

          {!!errorMessage && (
            <Text style={styles.errorText}>
              {errorMessage}
            </Text>
          )}

          {!!successMessage && (
            <Text style={styles.successText}>
              {successMessage}
            </Text>
          )}

          <Pressable
            onPress={handleSignup}
            disabled={loading}
            style={({ pressed }) => [
              styles.signupButton,
              pressed && styles.buttonPressed,
              loading && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.signupButtonText}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Text>
          </Pressable>

          <View style={styles.loginArea}>
            <Text style={styles.loginText}>
              Já possui uma conta?
            </Text>

            <Pressable
              onPress={() => router.replace('/login')}
            >
              <Text style={styles.loginLink}>
                Entrar no FIO
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },

  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 48,
  },

  logo: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.graphite,
  },

  logoSubtitle: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: COLORS.sage,
  },

  backButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: COLORS.white,
  },

  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.graphite,
  },

  title: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.graphite,
  },

  subtitle: {
    marginTop: 8,
    marginBottom: 32,
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.muted,
  },

  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.graphite,
  },

  input: {
    width: '100%',
    height: 54,
    marginBottom: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    fontSize: 16,
    color: COLORS.graphite,
  },

  passwordContainer: {
    width: '100%',
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.white,
  },

  passwordInput: {
    flex: 1,
    height: '100%',
    paddingRight: 12,
    fontSize: 16,
    color: COLORS.graphite,
  },

  passwordToggle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.sage,
  },

  errorText: {
    marginBottom: 16,
    fontSize: 13,
    color: '#B42318',
  },

  successText: {
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.sage,
  },

  signupButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.orange,
  },

  signupButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  buttonPressed: {
    opacity: 0.86,
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  loginArea: {
    alignItems: 'center',
    marginTop: 30,
  },

  loginText: {
    fontSize: 13,
    color: COLORS.muted,
  },

  loginLink: {
    marginTop: 7,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.sage,
  },
});
