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
  terracotta: '#FFB04A',
  sage: '#74B892',
  background: '#242824',
  white: '#2E332F',
  border: '#687069',
  muted: '#C0C7C1',
};

function FioLine() {
  return (
    <View style={styles.fioLine}>
      <View style={[styles.fioStraight, styles.fioOrange]} />
      <View style={styles.fioRise} />
      <View style={[styles.fioStraight, styles.fioGreen]} />
    </View>
  );
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isRecoveringPassword, setIsRecoveringPassword] =
    useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');

  async function handleLogin() {
    setErrorMessage('');
    setRecoveryMessage('');

    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail.');
      return;
    }

    if (!password) {
      setErrorMessage('Informe sua senha.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage('E-mail ou senha inválidos.');
        return;
      }

     
    } catch {
      setErrorMessage(
        'Não foi possível entrar. Verifique sua conexão e tente novamente.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleForgotPassword() {
    setErrorMessage('');
    setRecoveryMessage('');
    setIsRecoveringPassword(true);
  }

  function handleBackToLogin() {
    setErrorMessage('');
    setRecoveryMessage('');
    setIsRecoveringPassword(false);
  }

  async function handleSendRecoveryEmail() {
    setErrorMessage('');
    setRecoveryMessage('');

    if (!email.trim()) {
      setErrorMessage('Informe seu e-mail.');
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: 'http://localhost:8081/reset-password',
        }
      );

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setRecoveryMessage(
        'Enviamos um link de recuperação para o seu e-mail.'
      );
    } catch {
      setErrorMessage(
        'Não foi possível enviar o e-mail. Verifique sua conexão e tente novamente.'
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
          <View style={styles.brandArea}>
            <View style={styles.logoRow}>
              <View style={styles.logoAccent} />

              <Text style={styles.logo}>FIO</Text>
            </View>

            <Text style={styles.logoSubtitle}>
              GESTÃO DE OBRAS
            </Text>

            <Text style={styles.tagline}>
              Segue o fio da sua obra.
            </Text>

            <FioLine />
          </View>

          <View style={styles.formArea}>
            <Text style={styles.title}>
              {isRecoveringPassword
                ? 'Recuperar senha'
                : 'Entrar na sua conta'}
            </Text>

            <Text style={styles.label}>E-mail</Text>

            <TextInput
              testID="login-email"
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={COLORS.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />

            {!isRecoveringPassword && (
              <>
                <Text style={styles.label}>Senha</Text>

                <View style={styles.passwordContainer}>
                  <TextInput
                    testID="login-password"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Digite sua senha"
                    placeholderTextColor={COLORS.muted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    style={styles.passwordInput}
                  />

                  <Pressable
                    testID="login-password-toggle"
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

                <Pressable
                  testID="login-forgot-password"
                  style={styles.forgotPassword}
                  onPress={handleForgotPassword}
                >
                  <Text style={styles.forgotPasswordText}>
                    Esqueci minha senha
                  </Text>
                </Pressable>
              </>
            )}

            {!!errorMessage && (
              <Text style={styles.errorText}>
                {errorMessage}
              </Text>
            )}

            {!!recoveryMessage && (
              <Text style={styles.recoveryText}>
                {recoveryMessage}
              </Text>
            )}

            <Pressable
              testID="login-submit"
              onPress={
                isRecoveringPassword
                  ? handleSendRecoveryEmail
                  : handleLogin
              }
              disabled={loading}
              style={({ pressed }) => [
                styles.loginButton,
                pressed && styles.loginButtonPressed,
                loading && styles.loginButtonDisabled,
              ]}
            >
              <Text style={styles.loginButtonText}>
                {loading
                  ? 'Aguarde...'
                  : isRecoveringPassword
                    ? 'Enviar link de recuperação'
                    : 'Entrar'}
              </Text>
            </Pressable>

            {isRecoveringPassword ? (
              <Pressable
                style={styles.backToLoginButton}
                onPress={handleBackToLogin}
              >
                <Text style={styles.backToLoginText}>
                  Voltar para o login
                </Text>
              </Pressable>
            ) : (
              <View style={styles.signupArea}>
                <Text style={styles.signupText}>
                  Ainda não tem uma conta?
                </Text>

                <Pressable
                  onPress={() => router.push('/signup')}
                >
                  <Text style={styles.signupLink}>
                    Criar conta
                  </Text>
                </Pressable>
              </View>
            )}

            <View style={styles.footer}>
              <View style={styles.securityDot} />

              <Text style={styles.securityText}>
                Acesso seguro e confidencial
              </Text>
            </View>
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
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },

  content: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },

  brandArea: {
    alignItems: 'center',
    marginBottom: 48,
  },

  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },

  logoAccent: {
    position: 'absolute',
    left: -2,
    bottom: 7,
    width: 30,
    height: 3,
    backgroundColor: COLORS.orange,
    borderRadius: 2,
  },

  logo: {
    fontSize: 54,
    lineHeight: 58,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.graphite,
  },

  logoSubtitle: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: COLORS.graphite,
  },

  tagline: {
    marginTop: 18,
    fontSize: 16,
    color: COLORS.muted,
  },

  fioLine: {
    width: 245,
    height: 28,
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },

  fioStraight: {
    flex: 1,
    height: 2,
  },

  fioOrange: {
    backgroundColor: COLORS.orange,
  },

  fioGreen: {
    backgroundColor: COLORS.sage,
  },

  fioRise: {
    width: 62,
    height: 20,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderColor: COLORS.graphite,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },

  formArea: {
    width: '100%',
  },

  title: {
    marginBottom: 28,
    fontSize: 25,
    fontWeight: '700',
    color: COLORS.graphite,
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
    marginBottom: 10,
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

  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 28,
  },

  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.sage,
  },

  errorText: {
    marginBottom: 14,
    fontSize: 13,
    color: '#B42318',
  },

  recoveryText: {
    marginBottom: 14,
    fontSize: 13,
    color: COLORS.sage,
  },

  loginButton: {
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.orange,
  },

  loginButtonPressed: {
    opacity: 0.86,
  },

  loginButtonDisabled: {
    opacity: 0.6,
  },

  loginButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },

  signupArea: {
    alignItems: 'center',
    marginTop: 24,
  },

  signupText: {
    fontSize: 13,
    color: COLORS.muted,
  },

  signupLink: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.sage,
  },

  backToLoginButton: {
    alignItems: 'center',
    marginTop: 20,
  },

  backToLoginText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.sage,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 38,
  },

  securityDot: {
    width: 7,
    height: 7,
    marginRight: 8,
    borderRadius: 4,
    backgroundColor: COLORS.sage,
  },

  securityText: {
    fontSize: 12,
    color: COLORS.muted,
  },
});
