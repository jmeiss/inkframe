import { test } from 'node:test';
import assert from 'node:assert/strict';
import { imageErrorHandler } from '../src/middleware/errorHandler.js';
import { setCurrentImageCache, clearImageCache } from '../src/processing/pipeline.js';

function fakeRes() {
  const res = { sent: null, type() { return res; }, status() { return res; }, send(b) { res.sent = b; return res; }, json(j) { res.sent = j; return res; } };
  return res;
}

test('an image route keeps the last photo when fetching a new one fails', () => {
  const last = Buffer.from('last photo');
  setCurrentImageCache({ buffer: last });
  const res = fakeRes();
  imageErrorHandler(new Error('fetch failed'), { path: '/api/next' }, res);
  assert.equal(res.sent, last);
  clearImageCache();
});

test('an API route still answers the error as JSON', () => {
  setCurrentImageCache({ buffer: Buffer.from('last photo') });
  const res = fakeRes();
  imageErrorHandler(new Error('fetch failed'), { path: '/api/status' }, res);
  assert.deepEqual(res.sent, { error: 'fetch failed' });
  clearImageCache();
});
