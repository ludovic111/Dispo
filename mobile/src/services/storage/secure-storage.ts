import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const chunkSize = 1800;

export function splitSecureValue(value: string, size = chunkSize): string[] {
  if (size < 1) throw new Error('secure_storage_invalid_chunk_size');
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += size) {
    chunks.push(value.slice(offset, offset + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

function secureKey(key: string): string {
  return `dispo.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

async function removeSecureValue(key: string): Promise<void> {
  const root = secureKey(key);
  const rawCount = await SecureStore.getItemAsync(`${root}.count`);
  const count = Number(rawCount);
  if (Number.isInteger(count) && count > 0 && count < 64) {
    await Promise.all(
      Array.from({ length: count }, (_, index) => SecureStore.deleteItemAsync(`${root}.${index}`)),
    );
  }
  await SecureStore.deleteItemAsync(`${root}.count`);
}

export const secureSessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return AsyncStorage.getItem(key);
    const root = secureKey(key);
    const rawCount = await SecureStore.getItemAsync(`${root}.count`);
    const count = Number(rawCount);
    if (Number.isInteger(count) && count > 0 && count < 64) {
      const chunks = await Promise.all(
        Array.from({ length: count }, (_, index) => SecureStore.getItemAsync(`${root}.${index}`)),
      );
      if (chunks.every((chunk): chunk is string => chunk !== null)) return chunks.join('');
      await removeSecureValue(key);
    }

    // Migration unique de l'ancien stockage non chiffré utilisé par le socle.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy !== null) {
      await this.setItem(key, legacy);
      await AsyncStorage.removeItem(key);
    }
    return legacy;
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(key);
      return;
    }
    await Promise.all([removeSecureValue(key), AsyncStorage.removeItem(key)]);
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(key, value);
      return;
    }
    await removeSecureValue(key);
    const root = secureKey(key);
    const chunks = splitSecureValue(value);
    await Promise.all(
      chunks.map((chunk, index) =>
        SecureStore.setItemAsync(`${root}.${index}`, chunk, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
        }),
      ),
    );
    await SecureStore.setItemAsync(`${root}.count`, String(chunks.length), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  },
};
