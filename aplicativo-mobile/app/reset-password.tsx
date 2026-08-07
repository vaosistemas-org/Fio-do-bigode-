import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
const [confirmPassword, setConfirmPassword] = useState('');
const [message, setMessage] = useState('');

const router = useRouter();

  async function handleSavePassword() {
  setMessage('');

  if (!password || !confirmPassword) {
    setMessage('Preencha os dois campos.');
    return;
  }

  if (password !== confirmPassword) {
    setMessage('As senhas não coincidem.');
    return;
  }

   const { error } = await supabase.auth.updateUser({
  password,
});

if (error) {
  setMessage(error.message);
  return;
}

await supabase.auth.signOut({ scope: 'local' });

setMessage('Senha alterada com sucesso.');

setTimeout(() => {
  router.replace('/login');
}, 1500);
}

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Criar nova senha</Text>

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Digite a nova senha"
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirme a nova senha"
        secureTextEntry
        autoCapitalize="none"
        style={styles.input}
      />

{message ? (
  <Text style={styles.messageText}>
    {message}
  </Text>
) : null}

      <Pressable style={styles.button} onPress={handleSavePassword}>
        <Text style={styles.buttonText}>Salvar nova senha</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: '#F7F7F5',
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2C343A',
  },

  input: {
    width: '100%',
    maxWidth: 360,
    height: 54,
    marginTop: 24,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#D8D9D6',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    fontSize: 16,
    color: '#2C343A',
  },

  button: {
    width: '100%',
    maxWidth: 360,
    height: 56,
    marginTop: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#E07A3A',
  },

  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

messageText: {
  width: '100%',
  maxWidth: 360,
  marginTop: 16,
  fontSize: 13,
  color: '#B42318',
},
});