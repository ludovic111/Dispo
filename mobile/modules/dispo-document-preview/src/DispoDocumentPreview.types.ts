export type NativeDocumentPreviewStatus = 'opened' | 'viewerUnavailable';

export interface NativeDocumentPreviewResult {
  localUri: string;
  status: NativeDocumentPreviewStatus;
}

export interface DocumentPreviewInput {
  extension: string;
  signedUrl: string;
  title: string;
}

export type DocumentPreviewOutcome = 'browser' | 'native' | 'shared';
