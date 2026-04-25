import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

describe('newsWorker.js — source code checks', () => {
  const src = readFileSync(join(ROOT, 'src', 'home', 'newsWorker.js'), 'utf-8');

  it('should not reference window or document globals', () => {
    assert.ok(!src.includes('window.'), 'must not reference window');
    assert.ok(!src.includes('document.'), 'must not reference document');
    assert.ok(!src.includes('window['), 'must not reference window');
  });

  it('should use self.postMessage for communication', () => {
    assert.ok(src.includes('self.postMessage'), 'must use self.postMessage');
  });

  it('should define a fetch interval of 1 hour (3600000ms)', () => {
    assert.ok(src.includes('3600000'), 'polling interval must be 3600000ms (1 hour)');
  });

  it('should send message types: news, error, unchanged', () => {
    assert.ok(src.includes("'news'"), 'must define news message type');
    assert.ok(src.includes("'error'"), 'must define error message type');
    assert.ok(src.includes("'unchanged'"), 'must define unchanged message type');
  });
});

describe('hash utility (crypto.subtle)', () => {
  async function computeHash(data) {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('should produce consistent hash for the same input', async () => {
    const a = await computeHash('test-data');
    const b = await computeHash('test-data');
    assert.equal(a, b, 'same input must produce same hash');
    assert.equal(a.length, 64, 'SHA-256 hash must be 64 hex chars');
  });

  it('should produce different hashes for different inputs', async () => {
    const a = await computeHash('aaa');
    const b = await computeHash('bbb');
    assert.notEqual(a, b, 'different inputs must produce different hashes');
  });
});