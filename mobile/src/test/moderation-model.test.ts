import { describe, expect, it } from '@jest/globals';

import {
  isAccountWriteBlocked,
  moderationCopyKeys,
  moderationErrorCode,
  moderationErrorCopyKey,
  parseModerationState,
} from '@/features/moderation/moderation-model';

describe('moderation model', () => {
  it('maps the four server codes and ignores anything else', () => {
    expect(moderationErrorCode({ code: '42501', message: 'account_suspended' })).toBe(
      'account_suspended',
    );
    expect(moderationErrorCode({ message: 'rate_limited' })).toBe('rate_limited');
    expect(moderationErrorCode('content_not_allowed')).toBe('content_not_allowed');
    expect(moderationErrorCode({ message: 'new row violates row-level security' })).toBeNull();
    expect(moderationErrorCode(null)).toBeNull();
    expect(moderationErrorCopyKey({ message: 'account_banned' }, 'fallback')).toBe(
      moderationCopyKeys.account_banned,
    );
    expect(moderationErrorCopyKey(new Error('boom'), 'fallback')).toBe('fallback');
    expect(isAccountWriteBlocked({ message: 'account_suspended' })).toBe(true);
    expect(isAccountWriteBlocked({ message: 'rate_limited' })).toBe(false);
  });

  it('parses the moderation state payload defensively', () => {
    expect(
      parseModerationState({
        reason: 'strikes',
        status: 'suspended',
        strikes: 3,
        suspended_until: '2026-09-20T10:00:00+00:00',
      }),
    ).toEqual({
      reason: 'strikes',
      status: 'suspended',
      strikes: 3,
      suspendedUntil: '2026-09-20T10:00:00+00:00',
    });
    expect(parseModerationState({ status: 'weird', strikes: -2 })).toEqual({
      reason: null,
      status: 'active',
      strikes: 0,
      suspendedUntil: null,
    });
    expect(parseModerationState(undefined).status).toBe('active');
  });
});
