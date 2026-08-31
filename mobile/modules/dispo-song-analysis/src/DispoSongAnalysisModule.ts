import { NativeModule, requireOptionalNativeModule } from 'expo';

import type { SongAnalysisResult } from './DispoSongAnalysis.types';

declare class DispoSongAnalysisModule extends NativeModule {
  analyzePreviewAsync(previewUrl: string): Promise<SongAnalysisResult>;
}

export default requireOptionalNativeModule<DispoSongAnalysisModule>('DispoSongAnalysis');
