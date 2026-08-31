import { describe, expect, it, jest } from '@jest/globals';

import { splitSecureValue } from '@/services/storage/secure-storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 1,
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

describe('stockage chiffré découpé', () => {
  it('conserve exactement les contenus longs dans l’ordre', () => {
    const value = 'session:'.repeat(800);
    const chunks = splitSecureValue(value, 257);

    expect(chunks.every((chunk) => chunk.length <= 257)).toBe(true);
    expect(chunks.join('')).toBe(value);
  });

  it('représente aussi une valeur vide et refuse une taille invalide', () => {
    expect(splitSecureValue('', 8)).toEqual(['']);
    expect(() => splitSecureValue('x', 0)).toThrow('secure_storage_invalid_chunk_size');
  });
});
