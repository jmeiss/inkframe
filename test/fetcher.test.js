import { describe, it } from 'node:test';
import assert from 'node:assert';
import { buildImageUrl } from '../src/album/fetcher.js';

describe('fetcher', () => {
  describe('buildImageUrl', () => {
    it('should append size parameters to URL', () => {
      const url = 'https://lh3.googleusercontent.com/abc123';
      const result = buildImageUrl(url, 800, 480, 'center');

      assert.ok(result.includes('=w800'));
      assert.ok(result.includes('-h480'));
      assert.ok(result.includes('-c')); // center crop flag
    });

    it('should use -no for no crop mode', () => {
      const url = 'https://lh3.googleusercontent.com/abc123';
      const result = buildImageUrl(url, 800, 480, 'none');

      assert.ok(result.includes('-no'));
      assert.ok(!result.includes('-c'));
    });

    it('should use -p for smart crop mode', () => {
      const url = 'https://lh3.googleusercontent.com/abc123';
      const result = buildImageUrl(url, 800, 480, 'smart');

      assert.ok(result.includes('-p'));
    });

    it('should replace existing size parameters', () => {
      const url = 'https://lh3.googleusercontent.com/abc123=w1200-h900-c';
      const result = buildImageUrl(url, 800, 480, 'center');

      assert.ok(result.includes('=w800-h480-c'));
      assert.ok(!result.includes('=w1200'));
    });

    it('should handle URLs without existing parameters', () => {
      const url = 'https://lh3.googleusercontent.com/abc123';
      const result = buildImageUrl(url, 640, 480, 'center');

      assert.strictEqual(result, 'https://lh3.googleusercontent.com/abc123=w640-h480-c');
    });

    it('should default to no crop', () => {
      const url = 'https://lh3.googleusercontent.com/abc123';
      const result = buildImageUrl(url, 800, 480);

      assert.ok(result.includes('-no'));
    });
  });
});
