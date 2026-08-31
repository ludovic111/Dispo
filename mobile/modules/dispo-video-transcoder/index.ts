import { randomUUID } from 'expo-crypto';

import type {
  NativeVideoTranscodeResult,
  VideoTranscodeErrorCode,
  VideoTranscodeOptions,
  VideoTranscodeResult,
} from './src/DispoVideoTranscoder.types';
import DispoVideoTranscoderModule, {
  type DispoVideoTranscoderNativeModule,
} from './src/DispoVideoTranscoderModule';

export const VIDEO_TRANSCODE_CONTRACT = Object.freeze({
  bitRate: 2_000_000,
  maxDurationMs: 181_000,
  maxLongSide: 1_280,
  maxShortSide: 720,
  mimeType: 'video/mp4' as const,
});

export class VideoTranscodeError extends Error {
  readonly code: VideoTranscodeErrorCode;

  constructor(code: VideoTranscodeErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'VideoTranscodeError';
    this.code = code;
  }
}

function finitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizedEvenDimension(value: unknown): number | null {
  if (!finitePositive(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 2 && rounded % 2 === 0 ? rounded : null;
}

export function normalizeVideoTranscodeResult(
  result: Partial<NativeVideoTranscodeResult>,
): VideoTranscodeResult {
  const width = normalizedEvenDimension(result.width);
  const height = normalizedEvenDimension(result.height);
  const uri = typeof result.uri === 'string' ? result.uri.trim() : '';
  const outputPath = uri.toLocaleLowerCase('en').split('?')[0] ?? '';
  if (
    !uri.startsWith('file://') ||
    !outputPath.endsWith('.mp4') ||
    !outputPath.includes('/dispo-video-transcoder-') ||
    result.mimeType?.toLocaleLowerCase('en') !== VIDEO_TRANSCODE_CONTRACT.mimeType ||
    !finitePositive(result.durationMs) ||
    result.durationMs > VIDEO_TRANSCODE_CONTRACT.maxDurationMs ||
    !finitePositive(result.fileSize) ||
    width === null ||
    height === null ||
    Math.max(width, height) > VIDEO_TRANSCODE_CONTRACT.maxLongSide ||
    Math.min(width, height) > VIDEO_TRANSCODE_CONTRACT.maxShortSide ||
    typeof result.hasAudio !== 'boolean'
  ) {
    throw new VideoTranscodeError('video_transcode_invalid_output');
  }
  return {
    durationMs: Math.round(result.durationMs),
    fileSize: Math.round(result.fileSize),
    hasAudio: result.hasAudio,
    height,
    mimeType: VIDEO_TRANSCODE_CONTRACT.mimeType,
    uri,
    width,
  };
}

function mappedNativeError(error: unknown): VideoTranscodeError {
  if (error instanceof VideoTranscodeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('video_transcode_cancelled')) {
    return new VideoTranscodeError('video_transcode_cancelled', error);
  }
  if (message.includes('video_transcode_invalid_source')) {
    return new VideoTranscodeError('video_transcode_invalid_source', error);
  }
  return new VideoTranscodeError('video_transcode_failed', error);
}

export function createVideoTranscoderBridge(
  nativeModule: DispoVideoTranscoderNativeModule | null,
  createJobId: () => string = randomUUID,
) {
  return async function transcodeVideo(
    sourceUri: string,
    options: VideoTranscodeOptions = {},
  ): Promise<VideoTranscodeResult> {
    if (!nativeModule) throw new VideoTranscodeError('video_transcoder_unavailable');
    if (!sourceUri.startsWith('file://') && !sourceUri.startsWith('content://')) {
      throw new VideoTranscodeError('video_transcode_invalid_source');
    }
    if (options.signal?.aborted) {
      throw new VideoTranscodeError('video_transcode_cancelled');
    }

    const jobId = options.jobId ?? createJobId();
    if (!jobId || jobId.length > 128) {
      throw new VideoTranscodeError('video_transcode_invalid_source');
    }
    const cancel = () => {
      void nativeModule.cancelAsync(jobId).catch(() => undefined);
    };
    options.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const nativeResult = await nativeModule.transcodeAsync(sourceUri, jobId);
      try {
        return normalizeVideoTranscodeResult(nativeResult);
      } catch (error) {
        if (typeof nativeResult.uri === 'string') {
          await nativeModule.removeOutputAsync(nativeResult.uri).catch(() => undefined);
        }
        throw error;
      }
    } catch (error) {
      throw mappedNativeError(error);
    } finally {
      options.signal?.removeEventListener('abort', cancel);
    }
  };
}

export const transcodePortfolioVideo = createVideoTranscoderBridge(DispoVideoTranscoderModule);

export function isVideoTranscoderAvailable(): boolean {
  return DispoVideoTranscoderModule !== null;
}

export type {
  NativeVideoTranscodeResult,
  VideoTranscodeErrorCode,
  VideoTranscodeOptions,
  VideoTranscodeResult,
};
