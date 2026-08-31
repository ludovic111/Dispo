import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { NativeDocumentPreviewResult } from './DispoDocumentPreview.types';

export interface DispoDocumentPreviewNativeModule extends NativeModule {
  openAsync(
    signedUrl: string,
    fileName: string,
    mimeType: string,
  ): Promise<NativeDocumentPreviewResult>;
  releaseAsync(localUri: string): Promise<void>;
}

export default requireOptionalNativeModule<DispoDocumentPreviewNativeModule>(
  'DispoDocumentPreview',
);
