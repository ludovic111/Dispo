import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { uploadProfileAvatar } from '@/features/profiles/profile-edit-repository';

/**
 * Même chemin que « Modifier mon profil » : galerie, recadrage carré, 800 px JPEG, puis
 * envoi dans le bucket `avatars` (qui met aussi `profiles.photo_url` à jour).
 * Retourne `null` si l'utilisateur annule.
 */
export async function pickAndUploadOnboardingPhoto(userId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsEditing: true,
    aspect: [1, 1],
    mediaTypes: ['images'],
    quality: 1,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const resize =
    (asset.width ?? 0) >= (asset.height ?? 0)
      ? { resize: { width: 800 } }
      : { resize: { height: 800 } };
  const resized = await manipulateAsync(asset.uri, [resize], {
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  const bytes = await fetch(resized.uri).then((response) => response.arrayBuffer());
  return uploadProfileAvatar(userId, bytes);
}
