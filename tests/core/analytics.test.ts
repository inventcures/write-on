import { describe, expect, it } from 'vitest';
import { pageLocation, shouldCount } from '../../src/ui/analytics';

describe('visit counting', () => {
  it('counts only on the live site, and never when the browser asks not to be tracked', () => {
    expect(shouldCount('write-on.up.railway.app', {})).toBe(true);
    expect(shouldCount('localhost', {})).toBe(false);
    expect(shouldCount('write-on.up.railway.app', { doNotTrack: '1' })).toBe(false);
    expect(shouldCount('write-on.up.railway.app', { globalPrivacyControl: true })).toBe(false);
  });

  it('reports the page and its utm_ tags, nothing else', () => {
    expect(pageLocation('https://write-on.up.railway.app/?utm_source=linkedin&utm_medium=social&utm_campaign=write-on-launch-2026-11&utm_content=li-post-app&signin=google#x')).toBe(
      'https://write-on.up.railway.app/?utm_source=linkedin&utm_medium=social&utm_campaign=write-on-launch-2026-11&utm_content=li-post-app',
    );
    expect(pageLocation('https://write-on.up.railway.app/?signin=google-new')).toBe('https://write-on.up.railway.app/');
  });
});
