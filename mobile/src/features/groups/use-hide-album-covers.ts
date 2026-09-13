import { useSyncExternalStore } from 'react';

import {
  hideAlbumCoversKey,
  loadBooleanPreference,
  subscribeToPreference,
} from '@/features/settings/settings-storage';

/**
 * Cache module de la préférence « masquer les pochettes » : une seule lecture
 * AsyncStorage pour toutes les lignes de morceau, puis mise à jour par les
 * écouteurs de préférence (le réglage écrit la même clé).
 */
let hidden = false;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function refresh(): Promise<void> {
  loading ??= loadBooleanPreference(hideAlbumCoversKey)
    .then((value) => {
      hidden = value;
    })
    .catch(() => undefined)
    .finally(() => {
      loaded = true;
      loading = null;
      notify();
    });
  return loading;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribe = subscribeToPreference(hideAlbumCoversKey, () => {
    loading = null;
    void refresh();
  });
  if (!loaded && !loading) void refresh();
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
}

function snapshot(): boolean {
  return hidden;
}

/** `true` quand l'utilisateur a demandé à masquer les pochettes d'album. */
export function useHideAlbumCovers(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Réservé aux tests : remet le cache à zéro. */
export function resetHideAlbumCoversCache(): void {
  hidden = false;
  loaded = false;
  loading = null;
}
