import { describe, expect, it, jest } from '@jest/globals';

import {
  documentPreviewDescriptor,
  isSafeSignedDocumentUrl,
  openDocumentPreviewWithDependencies,
} from '../../modules/dispo-document-preview';

const signedUrl =
  'https://project.supabase.co/storage/v1/object/sign/group-docs/private/score.pdf?token=short-lived';

function dependencies(
  overrides: Partial<Parameters<typeof openDocumentPreviewWithDependencies>[1]> = {},
): Parameters<typeof openDocumentPreviewWithDependencies>[1] {
  return {
    browserOpen: jest.fn(async () => undefined),
    nativeModule: null,
    share: jest.fn(async () => undefined),
    sharingAvailable: jest.fn(async () => false),
    ...overrides,
  };
}

describe('prévisualisation native privée des documents', () => {
  it('conserve un nom lisible et une extension cohérente', () => {
    expect(documentPreviewDescriptor('../../ Set % Été.PDF ', ' PDF ')).toEqual({
      extension: 'pdf',
      fileName: 'Set Été.pdf',
      mimeType: 'application/pdf',
    });
    expect(documentPreviewDescriptor('Photo répétition', 'jpeg').fileName).toBe(
      'Photo répétition.jpeg',
    );
    expect(() => documentPreviewDescriptor('Archive', 'zip')).toThrow(
      'group_document_type_invalid',
    );
  });

  it('refuse une URL publique, non HTTPS ou sans jeton court', () => {
    expect(isSafeSignedDocumentUrl(signedUrl)).toBe(true);
    expect(isSafeSignedDocumentUrl('https://project.supabase.co/public/score.pdf')).toBe(false);
    expect(isSafeSignedDocumentUrl(signedUrl.replace('https:', 'http:'))).toBe(false);
  });

  it('ne déclenche aucun repli quand le viewer natif s’ouvre', async () => {
    const releaseAsync = jest.fn(async () => undefined);
    const nativeModule = {
      openAsync: jest.fn(async () => ({ localUri: 'file:///cache/score.pdf', status: 'opened' })),
      releaseAsync,
    } as never;
    const deps = dependencies({ nativeModule });

    await expect(
      openDocumentPreviewWithDependencies(
        { extension: 'pdf', signedUrl, title: 'Ma partition' },
        deps,
      ),
    ).resolves.toBe('native');
    expect(deps.share).not.toHaveBeenCalled();
    expect(deps.browserOpen).not.toHaveBeenCalled();
    expect(releaseAsync).not.toHaveBeenCalled();
  });

  it('partage le fichier privé en cache seulement si aucun viewer ne répond', async () => {
    const releaseAsync = jest.fn(async () => undefined);
    const nativeModule = {
      openAsync: jest.fn(async () => ({
        localUri: 'file:///cache/score.pdf',
        status: 'viewerUnavailable',
      })),
      releaseAsync,
    } as never;
    const deps = dependencies({
      nativeModule,
      sharingAvailable: jest.fn(async () => true),
    });

    await expect(
      openDocumentPreviewWithDependencies(
        { extension: 'pdf', signedUrl, title: 'Ma partition' },
        deps,
      ),
    ).resolves.toBe('shared');
    expect(deps.share).toHaveBeenCalledWith('file:///cache/score.pdf', {
      dialogTitle: 'Ma partition.pdf',
      mimeType: 'application/pdf',
    });
    expect(deps.browserOpen).not.toHaveBeenCalled();
    expect(releaseAsync).toHaveBeenCalledWith('file:///cache/score.pdf');
  });

  it('ouvre l’URL signée dans le navigateur uniquement après absence des viewers', async () => {
    const releaseAsync = jest.fn(async () => undefined);
    const nativeModule = {
      openAsync: jest.fn(async () => ({
        localUri: 'file:///cache/score.pdf',
        status: 'viewerUnavailable',
      })),
      releaseAsync,
    } as never;
    const deps = dependencies({ nativeModule });

    await expect(
      openDocumentPreviewWithDependencies(
        { extension: 'pdf', signedUrl, title: 'Ma partition' },
        deps,
      ),
    ).resolves.toBe('browser');
    expect(deps.browserOpen).toHaveBeenCalledWith(signedUrl);
    expect(releaseAsync).toHaveBeenCalledWith('file:///cache/score.pdf');
  });

  it('ne masque jamais une erreur native par un navigateur', async () => {
    const nativeModule = {
      openAsync: jest.fn(async () => {
        throw new Error('document_preview_download_failed');
      }),
      releaseAsync: jest.fn(async () => undefined),
    } as never;
    const deps = dependencies({ nativeModule });

    await expect(
      openDocumentPreviewWithDependencies(
        { extension: 'pdf', signedUrl, title: 'Ma partition' },
        deps,
      ),
    ).rejects.toThrow('document_preview_download_failed');
    expect(deps.share).not.toHaveBeenCalled();
    expect(deps.browserOpen).not.toHaveBeenCalled();
  });
});
