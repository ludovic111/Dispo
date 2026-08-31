import { describe, expect, it, jest } from '@jest/globals';

import {
  createVideoTranscoderBridge,
  normalizeVideoTranscodeResult,
  VIDEO_TRANSCODE_CONTRACT,
  VideoTranscodeError,
} from '../../modules/dispo-video-transcoder';
import type { DispoVideoTranscoderNativeModule } from '../../modules/dispo-video-transcoder/src/DispoVideoTranscoderModule';

const result = {
  durationMs: 120_000,
  fileSize: 30_000_000,
  hasAudio: true,
  height: 720,
  mimeType: 'video/mp4',
  uri: 'file:///cache/dispo-video-transcoder-job.mp4',
  width: 1280,
};

function nativeModule(
  overrides: Partial<DispoVideoTranscoderNativeModule> = {},
): DispoVideoTranscoderNativeModule {
  return {
    addListener: jest.fn(),
    cancelAsync: jest.fn(async () => undefined),
    emit: jest.fn(),
    listenerCount: jest.fn(),
    removeAllListeners: jest.fn(),
    removeListener: jest.fn(),
    removeOutputAsync: jest.fn(async () => undefined),
    startObserving: jest.fn(),
    stopObserving: jest.fn(),
    transcodeAsync: jest.fn(async () => result),
    ...overrides,
  } as unknown as DispoVideoTranscoderNativeModule;
}

describe('contrat du transcodeur vidéo', () => {
  it('fixe une sortie H.264 MP4 720p autour de 2 Mbit/s', () => {
    expect(VIDEO_TRANSCODE_CONTRACT).toEqual({
      bitRate: 2_000_000,
      maxDurationMs: 181_000,
      maxLongSide: 1_280,
      maxShortSide: 720,
      mimeType: 'video/mp4',
    });
    expect(normalizeVideoTranscodeResult(result)).toEqual(result);
  });

  it('refuse une sortie hors contrat', () => {
    expect(() => normalizeVideoTranscodeResult({ ...result, width: 1920 })).toThrow(
      new VideoTranscodeError('video_transcode_invalid_output'),
    );
    expect(() =>
      normalizeVideoTranscodeResult({ ...result, uri: 'https://example.com/a.mp4' }),
    ).toThrow(new VideoTranscodeError('video_transcode_invalid_output'));
  });

  it('supprime une sortie native qui viole le contrat du bridge', async () => {
    const module = nativeModule({
      transcodeAsync: jest.fn(async () => ({ ...result, width: 1920 })),
    });
    await expect(
      createVideoTranscoderBridge(module, () => 'job-invalid')('file:///cache/input.mov'),
    ).rejects.toMatchObject({ code: 'video_transcode_invalid_output' });
    expect(module.removeOutputAsync).toHaveBeenCalledWith(result.uri);
  });

  it('propage une annulation au job natif', async () => {
    let rejectNative: (error: Error) => void = () => undefined;
    const module = nativeModule({
      transcodeAsync: jest.fn<(sourceUri: string, jobId: string) => Promise<typeof result>>(
        () =>
          new Promise<typeof result>((_, reject) => {
            rejectNative = reject;
          }),
      ),
    });
    const controller = new AbortController();
    const pending = createVideoTranscoderBridge(module, () => 'job-1')('file:///cache/input.mov', {
      signal: controller.signal,
    });
    controller.abort();
    rejectNative(new Error('video_transcode_cancelled'));
    await expect(pending).rejects.toMatchObject({ code: 'video_transcode_cancelled' });
    expect(module.cancelAsync).toHaveBeenCalledWith('job-1');
  });

  it('échoue explicitement sans module natif', async () => {
    await expect(
      createVideoTranscoderBridge(null)('file:///cache/input.mov'),
    ).rejects.toMatchObject({ code: 'video_transcoder_unavailable' });
  });
});
