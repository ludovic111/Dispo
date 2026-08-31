import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { NativeVideoTranscodeResult } from './DispoVideoTranscoder.types';

export interface DispoVideoTranscoderNativeModule extends NativeModule {
  cancelAsync(jobId: string): Promise<void>;
  removeOutputAsync(outputUri: string): Promise<void>;
  transcodeAsync(sourceUri: string, jobId: string): Promise<NativeVideoTranscodeResult>;
}

export default requireOptionalNativeModule<DispoVideoTranscoderNativeModule>(
  'DispoVideoTranscoder',
);
