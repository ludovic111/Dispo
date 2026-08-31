import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';

import type {
  DocumentPreviewInput,
  DocumentPreviewOutcome,
} from './src/DispoDocumentPreview.types';
import DispoDocumentPreviewModule, {
  type DispoDocumentPreviewNativeModule,
} from './src/DispoDocumentPreviewModule';

const documentMimeTypes = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
} as const;

export type SupportedDocumentExtension = keyof typeof documentMimeTypes;

interface DocumentPreviewDependencies {
  browserOpen: (url: string) => Promise<unknown>;
  nativeModule: DispoDocumentPreviewNativeModule | null;
  share: (localUri: string, options: { dialogTitle: string; mimeType: string }) => Promise<void>;
  sharingAvailable: () => Promise<boolean>;
}

export interface DocumentPreviewDescriptor {
  extension: SupportedDocumentExtension;
  fileName: string;
  mimeType: (typeof documentMimeTypes)[SupportedDocumentExtension];
}

function normalizedExtension(value: string): SupportedDocumentExtension {
  const extension = value.trim().toLowerCase();
  if (extension in documentMimeTypes) return extension as SupportedDocumentExtension;
  throw new Error('group_document_type_invalid');
}

function sanitizedStem(value: string, extension: SupportedDocumentExtension): string {
  const withoutMatchingExtension = value
    .trim()
    .replace(new RegExp(`\\.${extension}$`, 'iu'), '')
    .normalize('NFC');
  const cleaned = withoutMatchingExtension
    .replace(/[\u0000-\u001f\u007f/\\:*?"<>|%]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+/gu, '')
    .replace(/[. ]+$/gu, '')
    .trim();
  return Array.from(cleaned || 'Document')
    .slice(0, 100)
    .join('');
}

export function documentPreviewDescriptor(
  title: string,
  rawExtension: string,
): DocumentPreviewDescriptor {
  const extension = normalizedExtension(rawExtension);
  return {
    extension,
    fileName: `${sanitizedStem(title, extension)}.${extension}`,
    mimeType: documentMimeTypes[extension],
  };
}

export function isSafeSignedDocumentUrl(value: string): boolean {
  if (!value || value.trim() !== value || value.length > 8_192) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      Boolean(url.hostname) &&
      Boolean(url.searchParams.get('token'))
    );
  } catch {
    return false;
  }
}

export async function openDocumentPreviewWithDependencies(
  input: DocumentPreviewInput,
  dependencies: DocumentPreviewDependencies,
): Promise<DocumentPreviewOutcome> {
  if (!isSafeSignedDocumentUrl(input.signedUrl)) throw new Error('document_preview_url_invalid');
  const descriptor = documentPreviewDescriptor(input.title, input.extension);
  const native = dependencies.nativeModule;
  let localUri = '';

  if (native) {
    const result = await native.openAsync(
      input.signedUrl,
      descriptor.fileName,
      descriptor.mimeType,
    );
    if (result.status === 'opened') return 'native';
    localUri = result.localUri;
  }

  try {
    if (localUri.startsWith('file://')) {
      try {
        if (await dependencies.sharingAvailable()) {
          await dependencies.share(localUri, {
            dialogTitle: descriptor.fileName,
            mimeType: descriptor.mimeType,
          });
          return 'shared';
        }
      } catch {
        // Le partage est uniquement un repli après absence de viewer. Si lui
        // aussi est indisponible, le navigateur reçoit la même URL signée.
      }
    }

    await dependencies.browserOpen(input.signedUrl);
    return 'browser';
  } finally {
    if (native && localUri.startsWith('file://')) {
      await native.releaseAsync(localUri).catch(() => undefined);
    }
  }
}

export function openDocumentPreview(input: DocumentPreviewInput): Promise<DocumentPreviewOutcome> {
  return openDocumentPreviewWithDependencies(input, {
    browserOpen: (url) => WebBrowser.openBrowserAsync(url),
    nativeModule: DispoDocumentPreviewModule,
    share: (localUri, options) => Sharing.shareAsync(localUri, options),
    sharingAvailable: () => Sharing.isAvailableAsync(),
  });
}

export type { DocumentPreviewInput, DocumentPreviewOutcome };
