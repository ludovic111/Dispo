import { NativeModule, registerWebModule } from 'expo';

import type { NativeDocumentPreviewResult } from './DispoDocumentPreview.types';

// Le navigateur reste le repli explicite sur le web : aucun fichier privé
// n'est copié dans un stockage public ou persistant par ce module.
class DispoDocumentPreviewModule extends NativeModule {
  async openAsync(): Promise<NativeDocumentPreviewResult> {
    return { localUri: '', status: 'viewerUnavailable' };
  }

  async releaseAsync(): Promise<void> {}
}

export default registerWebModule(DispoDocumentPreviewModule, 'DispoDocumentPreview');
