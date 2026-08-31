import { NativeModule, registerWebModule } from 'expo';

import type { NativeVideoTranscodeResult } from './DispoVideoTranscoder.types';

class DispoVideoTranscoderModule extends NativeModule {
  async cancelAsync(): Promise<void> {}

  async removeOutputAsync(): Promise<void> {}

  async transcodeAsync(): Promise<NativeVideoTranscodeResult> {
    throw new Error('video_transcoder_unavailable');
  }
}

export default registerWebModule(DispoVideoTranscoderModule, 'DispoVideoTranscoder');
