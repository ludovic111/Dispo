import { describe, expect, it } from '@jest/globals';

import { redirectSystemPath } from '@/app/+native-intent';

describe('native authentication routing', () => {
  it('keeps callback credentials out of the navigation route for cold and warm starts', () => {
    for (const initial of [true, false]) {
      expect(
        redirectSystemPath({
          path: 'dispo://login-callback#access_token=test&refresh_token=test',
          initial,
        }),
      ).toBe('/');
      expect(
        redirectSystemPath({ path: 'dispo-dev://login-callback?code=test&type=recovery', initial }),
      ).toBe('/');
    }
  });
  it('preserves ordinary deep links and relative routes', () => {
    for (const path of ['dispo://repertoire/profile-id', '/groups/example', 'invalid URL']) {
      expect(redirectSystemPath({ path, initial: false })).toBe(path);
    }
  });
});
