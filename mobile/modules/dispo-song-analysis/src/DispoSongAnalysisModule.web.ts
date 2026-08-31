import { NativeModule, registerWebModule } from 'expo';

import type { SongAnalysisResult } from './DispoSongAnalysis.types';

// DispoSongAnalysisModule is not available on the web platform.
class DispoSongAnalysisModule extends NativeModule {
  async analyzePreviewAsync(): Promise<SongAnalysisResult> {
    return { key: null, tempoBpm: null };
  }
}

export default registerWebModule(DispoSongAnalysisModule, 'DispoSongAnalysis');
