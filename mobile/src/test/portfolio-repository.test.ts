import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { DemoVideo } from '@/features/portfolio/portfolio-model';
import { removeDemoVideo } from '@/features/portfolio/portfolio-repository';
import { getSupabaseClient } from '@/services/supabase/client';

jest.mock('@/services/supabase/client', () => ({ getSupabaseClient: jest.fn() }));

const mockedClient = jest.mocked(getSupabaseClient);
const userId = '11111111-1111-4111-8111-111111111111';
const video: DemoVideo = {
  date: '2026-09-03',
  id: '22222222-2222-4222-8222-222222222222',
  path: `${userId}/video.mp4`,
  thumbUrl: `https://example.supabase.co/storage/v1/object/public/demo-videos/${userId}/thumb.jpg`,
  title: 'Concert local',
  url: `https://example.supabase.co/storage/v1/object/public/demo-videos/${userId}/video.mp4`,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('suppression transactionnelle des vidéos', () => {
  it('restaure la référence JSON si Storage refuse la suppression', async () => {
    const single = jest
      .fn<() => Promise<{ data: { id: string }; error: null }>>()
      .mockResolvedValueOnce({ data: { id: userId }, error: null })
      .mockResolvedValueOnce({ data: { id: userId }, error: null });
    const select = jest.fn(() => ({ single }));
    const eq = jest.fn(() => ({ select }));
    const update = jest.fn(() => ({ eq }));
    const storageError = new Error('storage_delete_failed');
    const remove = jest.fn(async () => ({ error: storageError }));
    mockedClient.mockReturnValue({
      from: jest.fn(() => ({ update })),
      storage: { from: jest.fn(() => ({ remove })) },
    } as never);

    await expect(removeDemoVideo(userId, [video], video)).rejects.toBe(storageError);
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { demo_videos: [] });
    expect(update).toHaveBeenNthCalledWith(2, {
      demo_videos: [
        {
          date: '2026-09-03',
          id: video.id,
          path: video.path,
          thumb: video.thumbUrl,
          title: 'Concert local',
          url: video.url,
        },
      ],
    });
    expect(remove).toHaveBeenCalledWith([video.path, `${userId}/thumb.jpg`]);
  });
});
