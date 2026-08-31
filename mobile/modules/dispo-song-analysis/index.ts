import type { SongAnalysisResult } from './src/DispoSongAnalysis.types';
import DispoSongAnalysisModule from './src/DispoSongAnalysisModule';

const MUSICAL_KEY_PATTERN = /^[A-G](?:[♭♯])?m?$/u;
const BLOCKED_PREVIEW_HOST_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.lan',
  '.home',
  '.corp',
];

export function normalizeSongAnalysis(result: Partial<SongAnalysisResult>): SongAnalysisResult {
  const key = typeof result.key === 'string' ? result.key.trim() : '';
  return {
    key: MUSICAL_KEY_PATTERN.test(key) ? key : null,
    tempoBpm:
      typeof result.tempoBpm === 'number' &&
      Number.isFinite(result.tempoBpm) &&
      result.tempoBpm >= 40 &&
      result.tempoBpm <= 240
        ? Math.round(result.tempoBpm)
        : null,
  };
}

export function isSafeSongPreviewUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !value || value.length > 2_048 || value.trim() !== value)
    return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && url.port !== '443') ||
      !host.includes('.') ||
      host.endsWith('.') ||
      host.includes(':')
    )
      return false;
    const labels = host.split('.');
    if (
      labels.length < 2 ||
      labels.some(
        (label) =>
          !label || label.startsWith('-') || label.endsWith('-') || !/^[a-z0-9-]+$/u.test(label),
      )
    )
      return false;
    if (labels.length === 4 && labels.every((label) => /^\d{1,3}$/u.test(label))) return false;
    return !BLOCKED_PREVIEW_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  } catch {
    return false;
  }
}

export async function analyzeSongPreview(previewUrl: string | null): Promise<SongAnalysisResult> {
  if (!isSafeSongPreviewUrl(previewUrl) || !DispoSongAnalysisModule)
    return { key: null, tempoBpm: null };
  try {
    const result = await DispoSongAnalysisModule.analyzePreviewAsync(previewUrl);
    return normalizeSongAnalysis(result);
  } catch {
    return { key: null, tempoBpm: null };
  }
}

export type { SongAnalysisResult };
