import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { GroupMembersScreen } from '@/features/groups/group-members-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-router/react-navigation', () => ({ useHeaderHeight: () => 80 }));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'fr' } }),
}));
jest.mock('@/theme/theme-context', () => ({
  useDispoTheme: () => ({
    palette: jest
      .requireActual<typeof import('@/theme/tokens')>('@/theme/tokens')
      .paletteFor('dark'),
  }),
}));
jest.mock('@/components/ui/screen', () => ({
  Screen: ({ children }: { children: ReactNode }) => children,
  EmptyState: () => null,
  ErrorState: () => null,
  LoadingState: () => null,
}));
let mockUser = 'leader';
jest.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({ session: { user: { id: mockUser } } }),
}));
let mockMembers: { id: string; name: string; role: string; isManual: boolean; kind: string }[] = [];
const mockAdd = jest.fn<(input: unknown, options: { onSuccess: () => void }) => void>();
jest.mock('@/features/groups/group-queries', () => ({
  useGroup: () => ({
    data: { id: 'group', leaderId: 'leader', members: mockMembers, pendingInvitations: [] },
  }),
  useGroupProfileCandidates: () => ({ data: [] }),
  useAddManualGroupMember: () => ({ mutate: mockAdd }),
  useUpdateManualGroupMember: () => ({ mutate: jest.fn() }),
  useRemoveManualGroupMember: () => ({ mutate: jest.fn() }),
  useCancelGroupInvitation: () => ({}),
  useInviteGroupMember: () => ({}),
}));
beforeEach(() => {
  mockUser = 'leader';
  mockMembers = [];
  mockAdd.mockReset();
});
it('adds a named member without inviting or creating a profile and closes the form on success', async () => {
  mockAdd.mockImplementation((_input, options) => {
    mockMembers = [
      { id: 'manual', name: 'Camille', role: 'Saxophone', kind: 'permanent', isManual: true },
    ];
    options.onSuccess();
  });
  const view = await render(<GroupMembersScreen groupId="group" />);
  await fireEvent.press(view.getByRole('button', { name: 'Ajouter sans compte Dispo' }));
  expect(view.getByRole('button', { name: 'Ajouter au groupe' })).toBeDisabled();
  await fireEvent.changeText(view.getByLabelText('Nom du membre'), 'Camille');
  await fireEvent.changeText(view.getByLabelText('Rôle du membre'), 'Saxophone');
  await fireEvent.press(view.getByRole('button', { name: 'Ajouter au groupe' }));
  expect(mockAdd).toHaveBeenCalledWith(
    { groupId: 'group', name: 'Camille', role: 'Saxophone', kind: 'permanent' },
    expect.anything(),
  );
  await waitFor(() => expect(view.getByText('Camille')).toBeTruthy());
  expect(view.queryByLabelText('Nom du membre')).toBeNull();
  expect(view.getByText('Sans compte Dispo')).toBeTruthy();
  expect(view.queryByText('Nommer leader')).toBeNull();
  await view.unmount();
});
it('lets a regular member see the manual roster without management actions', async () => {
  mockUser = 'member';
  mockMembers = [
    { id: 'manual', name: 'Camille', role: 'Saxophone', kind: 'permanent', isManual: true },
  ];
  const view = await render(<GroupMembersScreen groupId="group" />);
  expect(view.getByText('Camille')).toBeTruthy();
  expect(view.queryByText('Ajouter sans compte Dispo')).toBeNull();
  expect(view.queryByText('Modifier')).toBeNull();
  expect(view.queryByText('Exclure')).toBeNull();
  await view.unmount();
});
