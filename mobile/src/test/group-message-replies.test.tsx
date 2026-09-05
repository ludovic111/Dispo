import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import { GroupMessagesTab } from '@/features/groups/group-messages-tab';
import { type GroupMessage, type MusicGroup } from '@/features/groups/group-model';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-i18next', () => ({
  ...jest.requireActual<typeof import('react-i18next')>('react-i18next'),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/features/messages/message-attachments', () => ({
  MessageAttachmentCard: () => null,
  PendingAttachmentChip: () => null,
}));
jest.mock('@/features/messages/message-controls', () => ({
  MessageDayDivider: () => null,
  TypingBubble: () => null,
}));
jest.mock('@/features/messages/message-repository', () => ({ openMessageAttachment: jest.fn() }));
const original: GroupMessage = {
  id: 'question',
  groupId: 'group',
  senderId: 'other',
  senderName: 'François',
  senderPhotoUrl: null,
  text: 'Quelle tonalité pour la jam ?',
  createdAt: '2026-09-05T12:00:00Z',
  editedAt: null,
  deletedAt: null,
  attachmentName: null,
  attachmentPath: null,
  attachmentSize: null,
  attachmentType: null,
  reactions: [],
};
const response: GroupMessage = {
  ...original,
  id: 'answer',
  senderId: 'me',
  senderName: 'Moi',
  text: 'En mi bémol',
  replyToId: original.id,
  createdAt: '2026-09-05T12:01:00Z',
};
let mockMessages: GroupMessage[] = [];
let mockOriginals: GroupMessage[] = [];
const mockSend = jest.fn<(input: unknown, options: { onError: (error: Error) => void }) => void>();
const mockEdit = jest.fn();
jest.mock('@/features/groups/group-queries', () => ({
  useGroupMessages: () => ({ data: { pages: [{ items: mockMessages }] }, pingTyping: jest.fn() }),
  useGroupReplyMessages: () => ({ data: mockOriginals }),
  useGroupMessageReaction: () => ({ mutate: jest.fn() }),
  useDeleteGroupMessage: () => ({ mutate: jest.fn() }),
  useEditGroupMessage: () => ({ mutate: mockEdit }),
  useSendGroupMessage: () => ({ mutate: mockSend }),
}));

describe('targeted group replies', () => {
  beforeEach(() => {
    mockMessages = [original];
    mockOriginals = [];
    mockSend.mockReset();
    mockEdit.mockReset();
  });
  const show = () => render(<GroupMessagesTab group={{ id: 'group' } as MusicGroup} userId="me" />);

  it('keeps the draft when cancelling and sends a normal message without a quote', async () => {
    const view = await show();
    await fireEvent.changeText(view.getByLabelText('Message au groupe'), 'Mon texte');
    await fireEvent.press(view.getByRole('button', { name: 'Répondre' }));
    expect(mockSend).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: 'Annuler la réponse' }));
    expect(view.getByLabelText('Message au groupe').props.value).toBe('Mon texte');
    await fireEvent.press(view.getByRole('button', { name: 'Envoyer' }));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Mon texte', replyToId: null }),
      expect.any(Object),
    );
  });

  it('sends the original ID separately and restores both quote and text after failure', async () => {
    const view = await show();
    await fireEvent.press(view.getByText(original.text));
    expect(view.getByRole('button', { name: 'Annuler la réponse' })).toBeTruthy();
    await fireEvent.changeText(view.getByLabelText('Message au groupe'), 'En mi bémol');
    await fireEvent.press(view.getByRole('button', { name: 'Envoyer' }));
    expect(mockSend).toHaveBeenCalledWith(
      { attachment: null, groupId: 'group', text: 'En mi bémol', replyToId: 'question' },
      expect.any(Object),
    );
    await act(() => mockSend.mock.calls[0]?.[1].onError(new Error('network')));
    expect(view.getByLabelText('Message au groupe').props.value).toBe('En mi bémol');
    expect(view.getByRole('button', { name: 'Annuler la réponse' })).toBeTruthy();
  });

  it('displays an older original outside the loaded page and opens its full quote', async () => {
    mockMessages = [response];
    mockOriginals = [original];
    const view = await show();
    expect(view.getByText(original.text)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'Afficher le message d’origine' }));
    expect(view.getByText('Message d’origine')).toBeTruthy();
    expect(
      view.getAllByText(original.text).some((text) => text.props.numberOfLines === undefined),
    ).toBe(true);
  });

  it('uses a live deletion over a stale fetched quote without exposing the deleted text', async () => {
    mockMessages = [response, { ...original, deletedAt: '2026-09-05T12:03:00Z', text: '' }];
    mockOriginals = [original];
    const view = await show();
    expect(view.queryByText(original.text)).toBeNull();
    expect(view.getAllByText('Message supprimé').length).toBe(2);
    expect(view.getAllByRole('button', { name: 'Répondre' }).length).toBe(1);
  });

  it('shows an unavailable original without fabricating a quotation', async () => {
    mockMessages = [response];
    const view = await show();
    expect(view.getByText('Message indisponible')).toBeTruthy();
    expect(view.queryByText(original.text)).toBeNull();
  });

  it('clears reply mode when editing an existing answer', async () => {
    mockMessages = [response];
    mockOriginals = [original];
    const view = await show();
    await fireEvent.press(view.getByRole('button', { name: 'Répondre' }));
    await fireEvent.press(view.getByRole('button', { name: 'Modifier' }));
    expect(view.queryByRole('button', { name: 'Annuler la réponse' })).toBeNull();
    await fireEvent.changeText(view.getByLabelText('Message au groupe'), 'En mi bémol, confirmé');
    await fireEvent.press(view.getByRole('button', { name: 'Enregistrer' }));
    expect(mockEdit).toHaveBeenCalledWith(
      { groupId: 'group', messageId: 'answer', text: 'En mi bémol, confirmé' },
      expect.any(Object),
    );
    expect(mockSend).not.toHaveBeenCalled();
  });
});
