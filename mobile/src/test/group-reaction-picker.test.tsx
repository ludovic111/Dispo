import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { GroupMessagesTab } from '@/features/groups/group-messages-tab';
import {
  GROUP_REACTION_EMOJIS,
  type GroupMessage,
  type MusicGroup,
} from '@/features/groups/group-model';

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
const mockReact = jest.fn();
const mockMessage: GroupMessage = {
  id: 'message',
  groupId: 'group',
  senderId: 'leader',
  senderName: 'Piano',
  senderPhotoUrl: null,
  text: 'Bienvenue',
  createdAt: '2026-09-04T16:00:00Z',
  editedAt: null,
  deletedAt: null,
  attachmentName: null,
  attachmentPath: null,
  attachmentSize: null,
  attachmentType: null,
  reactions: [],
};
jest.mock('@/features/groups/group-queries', () => ({
  useGroupMessages: () => ({ data: { pages: [{ items: [mockMessage] }] } }),
  useGroupMessageReaction: () => ({ mutate: mockReact, isPending: false }),
  useDeleteGroupMessage: () => ({ mutate: jest.fn() }),
  useEditGroupMessage: () => ({ mutate: jest.fn() }),
  useSendGroupMessage: () => ({ mutate: jest.fn() }),
}));

describe('group reaction chooser', () => {
  beforeEach(() => {
    mockReact.mockClear();
    mockMessage.reactions = [];
  });
  it.each(GROUP_REACTION_EMOJIS)(
    'opens without sending and sends the selected %s',
    async (emoji) => {
      const view = await render(
        <GroupMessagesTab group={{ id: 'group' } as MusicGroup} userId="leader" />,
      );
      await fireEvent.press(view.getByRole('button', { name: 'Réagir' }));
      expect(mockReact).not.toHaveBeenCalled();
      for (const choice of GROUP_REACTION_EMOJIS)
        expect(view.getByRole('button', { name: `Réagir ${choice}` })).toBeTruthy();
      await fireEvent.press(view.getByRole('button', { name: `Réagir ${emoji}` }));
      expect(mockReact).toHaveBeenCalledWith(
        { emoji, groupId: 'group', message: mockMessage },
        expect.any(Object),
      );
      expect(view.queryByRole('button', { name: `Réagir ${emoji}` })).toBeNull();
    },
  );
  it('can close without reacting and exposes the existing reaction for removal', async () => {
    mockMessage.reactions = [{ emoji: '😂', count: 1, reactedByMe: true }];
    const view = await render(
      <GroupMessagesTab group={{ id: 'group' } as MusicGroup} userId="leader" />,
    );
    await fireEvent.press(view.getByRole('button', { name: 'Réagir' }));
    expect(view.getByRole('button', { name: 'Réagir 😂' }).props.accessibilityState.selected).toBe(
      true,
    );
    await fireEvent.press(view.getByRole('button', { name: 'Fermer' }));
    expect(mockReact).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: '😂, 1' }));
    expect(mockReact).toHaveBeenCalledWith(
      expect.objectContaining({ emoji: '😂', message: mockMessage }),
      expect.any(Object),
    );
  });
});
