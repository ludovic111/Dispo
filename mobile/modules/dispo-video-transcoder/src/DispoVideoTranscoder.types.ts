export interface NativeVideoTranscodeResult {
  durationMs: number;
  fileSize: number;
  hasAudio: boolean;
  height: number;
  mimeType: string;
  uri: string;
  width: number;
}

export interface VideoTranscodeResult {
  durationMs: number;
  fileSize: number;
  hasAudio: boolean;
  height: number;
  mimeType: 'video/mp4';
  uri: string;
  width: number;
}

export type VideoTranscodeErrorCode =
  | 'video_transcode_cancelled'
  | 'video_transcode_failed'
  | 'video_transcode_invalid_output'
  | 'video_transcode_invalid_source'
  | 'video_transcoder_unavailable';

export interface VideoTranscodeOptions {
  jobId?: string;
  signal?: AbortSignal;
}
