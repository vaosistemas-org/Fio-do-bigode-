import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

type ProfileAvatarProps = {
  userId: string;
  fullName: string;
  avatarUrl: string;
  editable?: boolean;
  onUploaded?: (url: string) => void;
};

export function ProfileAvatar({
  userId,
  fullName,
  avatarUrl,
  editable = false,
  onUploaded,
}: ProfileAvatarProps) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  async function uploadImage(asset: ImagePicker.ImagePickerAsset) {
    try {
      setUploading(true);
      setMessage('');

      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
        setMessage('A foto deve ter no máximo 5 MB.');
        return;
      }

      const arrayBuffer = await fetch(asset.uri).then((response) =>
        response.arrayBuffer()
      );

      const path = `${userId}/avatar`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, arrayBuffer, {
          contentType: asset.mimeType ?? 'image/jpeg',
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        setMessage(uploadError.message);
        return;
      }

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const publicUrl = `${data.publicUrl}?v=${Date.now()}`;

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          avatar_url: publicUrl,
        })
        .eq('id', userId);

      if (profileError) {
        setMessage(profileError.message);
        return;
      }

      onUploaded?.(publicUrl);
      setMessage('Foto atualizada com sucesso.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível enviar a foto.'
      );
    } finally {
      setUploading(false);
    }
  }

  async function choosePhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0]);
    }
  }

  async function takePhoto() {
    const permission =
      await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setMessage('Permita o acesso à câmera para tirar uma foto.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0]);
    }
  }

  return (
    <View style={styles.container}>
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={styles.avatarImage}
        />
      ) : (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {fullName.trim().charAt(0).toUpperCase() || 'F'}
          </Text>
        </View>
      )}

      {editable && (
        <View style={styles.actions}>
          <Pressable
            style={styles.primaryButton}
            onPress={choosePhoto}
            disabled={uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
              </Text>
            )}
          </Pressable>

          <Pressable
            style={styles.secondaryButton}
            onPress={takePhoto}
            disabled={uploading}
          >
            <Text style={styles.secondaryButtonText}>
              Tirar foto
            </Text>
          </Pressable>
        </View>
      )}

      {!!message && (
        <Text style={styles.message}>{message}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },

  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4E7E3',
  },

  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },

  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#5F7567',
  },

  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },

  primaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E07A3A',
  },

  primaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  secondaryButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D8DCDA',
    backgroundColor: '#FFFFFF',
  },

  secondaryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#596269',
  },

  message: {
    marginTop: 10,
    fontSize: 12,
    textAlign: 'center',
    color: '#5F7567',
  },
});