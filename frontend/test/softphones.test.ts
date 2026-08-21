import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { APPROVED_SOFTPHONE_HOSTS, isApprovedSoftphoneUrl, SOFTPHONE_DOWNLOADS } from '../src/softphones';

describe('softphone download guidance', () => {
  test('contains only approved HTTPS landing pages', () => {
    assert.equal(SOFTPHONE_DOWNLOADS.length, 3);
    assert.equal(new Set(SOFTPHONE_DOWNLOADS.map((entry) => entry.id)).size, SOFTPHONE_DOWNLOADS.length);

    for (const entry of SOFTPHONE_DOWNLOADS) {
      const url = new URL(entry.url);
      assert.equal(url.protocol, 'https:');
      assert.ok(APPROVED_SOFTPHONE_HOSTS.includes(url.hostname));
      assert.equal(isApprovedSoftphoneUrl(entry.url), true);
      assert.doesNotMatch(url.pathname, /\.(?:exe|msi|dmg|deb|rpm|apk|zip)$/i);
      assert.equal(url.username, '');
      assert.equal(url.password, '');
      assert.equal(url.search, '');
      assert.ok(entry.platforms.length > 0);
      assert.ok(entry.licence.length > 0);
    }
  });

  test('rejects unapproved, insecure, malformed and lookalike URLs', () => {
    assert.equal(isApprovedSoftphoneUrl('http://www.linphone.org/en/download/'), false);
    assert.equal(isApprovedSoftphoneUrl('https://linphone.org.example.test/download'), false);
    assert.equal(isApprovedSoftphoneUrl('https://example.test/softphone'), false);
    assert.equal(isApprovedSoftphoneUrl('not a URL'), false);
  });
});
