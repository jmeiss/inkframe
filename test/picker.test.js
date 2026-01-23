import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { pickPhoto, clearHistory, getHistoryStatus } from '../src/selection/picker.js';

describe('picker', () => {
  beforeEach(() => {
    clearHistory();
  });

  describe('pickPhoto', () => {
    it('should return null for empty array', () => {
      assert.strictEqual(pickPhoto([]), null);
    });

    it('should return null for null input', () => {
      assert.strictEqual(pickPhoto(null), null);
    });

    it('should return a photo from the array', () => {
      const photos = [
        { url: 'https://example.com/1.jpg', timestamp: new Date() },
        { url: 'https://example.com/2.jpg', timestamp: new Date() },
      ];

      const picked = pickPhoto(photos);
      assert.ok(picked);
      assert.ok(photos.some((p) => p.url === picked.url));
    });

    it('should add picked photo to history', () => {
      const photos = [{ url: 'https://example.com/1.jpg', timestamp: new Date() }];

      assert.strictEqual(getHistoryStatus().size, 0);
      pickPhoto(photos);
      assert.strictEqual(getHistoryStatus().size, 1);
    });

    it('should avoid recently shown photos', () => {
      const photos = [
        { url: 'https://example.com/1.jpg', timestamp: new Date() },
        { url: 'https://example.com/2.jpg', timestamp: new Date() },
      ];

      // Pick first photo
      const first = pickPhoto(photos);

      // Pick again - should get the other one
      const second = pickPhoto(photos);

      assert.notStrictEqual(first.url, second.url);
    });

    it('should reset history when all photos shown', () => {
      const photos = [{ url: 'https://example.com/1.jpg', timestamp: new Date() }];

      // Pick the only photo
      pickPhoto(photos);
      assert.strictEqual(getHistoryStatus().size, 1);

      // Pick again - history should reset and return the same photo
      const second = pickPhoto(photos);
      assert.ok(second);
      assert.strictEqual(second.url, 'https://example.com/1.jpg');
    });

    it('should handle photos without timestamps', () => {
      const photos = [
        { url: 'https://example.com/1.jpg', timestamp: null },
        { url: 'https://example.com/2.jpg' }, // undefined timestamp
      ];

      const picked = pickPhoto(photos);
      assert.ok(picked);
    });

    it('should categorize photos by age', () => {
      const now = Date.now();
      const recentDate = new Date(now - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const oldDate = new Date(now - 180 * 24 * 60 * 60 * 1000); // 180 days ago

      const photos = [
        { url: 'https://example.com/recent.jpg', timestamp: recentDate },
        { url: 'https://example.com/old.jpg', timestamp: oldDate },
      ];

      // Pick multiple times to statistically verify weighting works
      // (This is a probabilistic test, but with 80/20 weighting over many picks,
      // we should see recent photos picked more often)
      const picks = { recent: 0, old: 0 };

      for (let i = 0; i < 100; i++) {
        clearHistory();
        const picked = pickPhoto(photos);
        if (picked.url.includes('recent')) {
          picks.recent++;
        } else {
          picks.old++;
        }
      }

      // With 80/20 weighting, recent should be picked significantly more often
      // Allow some variance for randomness
      assert.ok(
        picks.recent > picks.old,
        `Expected recent (${picks.recent}) > old (${picks.old})`
      );
    });
  });

  describe('clearHistory', () => {
    it('should clear the history', () => {
      const photos = [{ url: 'https://example.com/1.jpg', timestamp: new Date() }];

      pickPhoto(photos);
      assert.strictEqual(getHistoryStatus().size, 1);

      clearHistory();
      assert.strictEqual(getHistoryStatus().size, 0);
    });
  });

  describe('getHistoryStatus', () => {
    it('should return size and maxSize', () => {
      const status = getHistoryStatus();
      assert.ok('size' in status);
      assert.ok('maxSize' in status);
      assert.strictEqual(typeof status.size, 'number');
      assert.strictEqual(typeof status.maxSize, 'number');
    });
  });
});
