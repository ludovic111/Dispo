import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render } from '@testing-library/react-native';
import type { TFunction } from 'i18next';
import { Alert } from 'react-native';

import { groupMessageFromRealtimeRow } from '@/features/groups/group-repository';
import {
  isModeratedMessage,
  ModeratedMessageText,
  reportSendFailure,
} from '@/features/messages/moderated-message';
import { moderatedMessagePlaceholder } from '@/features/moderation/moderation-model';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../modules/dispo-document-preview', () => ({ openDocumentPreview: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));
jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    dark: true,
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));

const t = ((key: string) => key) as unknown as TFunction;

const row = {
  attachment_name: null,
  attachment_path: null,
  attachment_size: null,
  attachment_type: null,
  created_at: '2026-09-13T10:00:00Z',
  deleted_at: null,
  edited_at: null,
  group_id: 'group',
  id: 'message',
  reply_to_id: null,
  sender_id: 'sender',
  text: moderatedMessagePlaceholder,
};

describe('moderated messages', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('detects the server flag and the stored placeholder alike', () => {
    expect(isModeratedMessage({ moderated: true, text: 'anything' })).toBe(true);
    expect(isModeratedMessage({ text: moderatedMessagePlaceholder })).toBe(true);
    expect(isModeratedMessage({ moderated: false, text: 'Salut' })).toBe(false);
  });

  it('maps the group_messages.moderated column into the model', () => {
    const flagged = groupMessageFromRealtimeRow({ ...row, moderated: true }, 'me');
    expect(flagged.moderated).toBe(true);
    const plain = groupMessageFromRealtimeRow({ ...row, text: 'Salut' }, 'me');
    expect(plain.moderated).toBe(false);
  });

  it('renders the translated moderation copy in italic', async () => {
    const screen = await render(<ModeratedMessageText mine={false} />);
    const text = screen.getByText('Message retiré par la modération');
    expect(text).toBeTruthy();
    expect(text.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontStyle: 'italic' })]),
    );
  });

  it('turns moderation and rate-limit codes into an alert and keeps other errors inline', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const inline = jest.fn();
    reportSendFailure({ code: '54000', message: 'rate_limited' }, t, 'fallback', inline);
    expect(alert).toHaveBeenCalledWith(
      'Message non envoyé',
      'Tu vas un peu vite. Attends un instant avant de réessayer.',
    );
    expect(inline).not.toHaveBeenCalled();

    reportSendFailure({ message: 'account_suspended' }, t, 'fallback', inline);
    expect(alert).toHaveBeenLastCalledWith(
      'Message non envoyé',
      expect.stringContaining('suspendu'),
    );
    reportSendFailure({ message: 'content_not_allowed' }, t, 'fallback', inline);
    expect(alert).toHaveBeenLastCalledWith(
      'Message non envoyé',
      expect.stringContaining('règles de la communauté'),
    );
    expect(inline).not.toHaveBeenCalled();

    reportSendFailure(new Error('network'), t, 'fallback', inline);
    expect(inline).toHaveBeenCalledWith('fallback');
    expect(alert).toHaveBeenCalledTimes(3);
  });
});
