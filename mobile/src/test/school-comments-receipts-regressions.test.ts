import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { type MusicGroup, removeSongCommentFromGroups } from '@/features/groups/group-model';

const source = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('lot écoles, commentaires et coches', () => {
  it('propose le même annuaire multi-écoles dans le flux SOS avec tous ses états', () => {
    const screen = source('src/app/(tabs)/sos.tsx');
    expect(screen).toContain('useSchoolDirectory()');
    expect(screen).toContain('setSelectedSchoolIds');
    expect(screen).toContain('selectedSchoolIds.includes(school.id)');
    expect(screen).toContain("t('Effacer les écoles')");
    expect(screen).toContain('schoolDirectory.isLoading');
    expect(screen).toContain('schoolDirectory.isError');
    expect(screen).toContain('schoolDirectory.hasNextPage');
  });

  it('ne garde qu’un seul accès Mes démos sur le profil propriétaire', () => {
    const profile = source('src/features/profiles/profile-detail.tsx');
    expect(profile.match(/router\.push\('\/profile\/demos' as never\)/g)).toHaveLength(1);
    expect(profile).toContain("title={t('Démos')}");
  });

  it('protège le compositeur multiligne du clavier et le révèle à chaque focus', () => {
    const song = source('src/features/groups/group-song-screen.tsx');
    expect(song).toContain('automaticallyAdjustKeyboardInsets');
    expect(song).toContain('keyboardDismissMode');
    expect(song).toContain("behavior={Platform.OS === 'android' ? 'padding' : undefined}");
    expect(song).toContain('scrollResponderScrollNativeHandleToKeyboard');
    expect(song).toContain('ref={commentInputRef}');
    expect(song).toContain('keyboardInset');
    expect(song).toContain('event.endCoordinates.height');
    expect(song).toContain('Keyboard.metrics()');
    expect(song).toContain("Dimensions.get('window').height * 0.48");
    expect(song).toContain('multiline');
    expect(song).toContain('onFocus={revealCommentComposer}');
    expect(song).toContain('onPressIn={revealCommentComposer}');
  });

  it('confirme la suppression et n’affiche qu’une coche persistée sur ses commentaires', () => {
    const song = source('src/features/groups/group-song-screen.tsx');
    expect(song).toContain("Alert.alert(t('Supprimer ce commentaire ?')");
    expect(song).toContain('<ReceiptChecks receipt="sent" />');
    expect(song).toContain('item.authorId === userId');
  });

  it('retire immédiatement un commentaire du cache ciblé sans toucher aux autres groupes', () => {
    const groups = [
      { comments: [{ id: 'remove' }, { id: 'keep' }], id: 'group-1' },
      { comments: [{ id: 'other' }], id: 'group-2' },
    ] as MusicGroup[];

    expect(removeSongCommentFromGroups(groups, 'group-1', 'remove')).toMatchObject([
      { comments: [{ id: 'keep' }], id: 'group-1' },
      { comments: [{ id: 'other' }], id: 'group-2' },
    ]);
    expect(groups[0]?.comments.map((comment) => comment.id)).toEqual(['remove', 'keep']);
  });

  it('conserve la suppression RLS pour l’auteur ou le leader du groupe seulement', () => {
    const migration = source(
      '../supabase/migrations/20260803150443_v13_song_docs_and_comments.sql',
    );
    expect(migration).toContain('create policy song_comments_delete_author_or_leader');
    expect(migration).toContain('author_id = (select auth.uid())');
    expect(migration).toContain('or public.is_group_leader(group_id)');
  });

  it('conserve les trois statuts privés fondés sur des horodatages serveur réels', () => {
    const model = source('src/features/messages/message-model.ts');
    const bubble = source('src/features/messages/message-bubble.tsx');
    const repository = source('src/features/messages/message-repository.ts');
    expect(model).toContain("if (message.readAt) return 'read'");
    expect(model).toContain("if (message.deliveredAt) return 'delivered'");
    expect(bubble).toContain(
      'mine ? <ReceiptChecks receipt={receiptForMessage(message)} /> : null',
    );
    expect(repository).toContain("'delivered_at'");
    expect(repository).toContain("'read_at'");
  });

  it('fournit les nouveaux libellés dans les neuf langues prises en charge', () => {
    const locales = ['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'zh-Hans'];
    const keys = [
      'Supprimer ce commentaire ?',
      "Le commentaire n'a pas pu être supprimé. Réessaie.",
      'Aucun SOS ne correspond aux écoles sélectionnées.',
      'Sélectionne une ou plusieurs écoles pour filtrer les SOS.',
      'Aucun SOS pour ces écoles',
      'Aucune école sélectionnée',
    ];
    for (const locale of locales) {
      const translations = JSON.parse(source(`src/i18n/locales/${locale}.json`)) as Record<
        string,
        string
      >;
      for (const key of keys) expect(translations[key]).toBeTruthy();
    }
  });
});
