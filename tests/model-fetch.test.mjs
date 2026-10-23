import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createModelFetch } from '../src/model-fetch.mjs';

function mockSpawn({ output = '{"ok":true}\n200', code = 0, wait = false } = {}) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => { child.killed = true; return true; };
    let config = ''; child.stdin.on('data', data => { config += data.toString(); });
    calls.push({ command, args, options, child, get config() { return config; } });
    child.stdin.on('finish', () => { if (!wait) queueMicrotask(() => { child.stdout.write(output); child.emit('close', code); }); });
    return child;
  };
  return { calls, spawnImpl };
}

test('native transport preserves fetch and rejects unknown transports', () => {
  assert.equal(createModelFetch(), globalThis.fetch);
  assert.throws(() => createModelFetch('other'), /transport/i);
});

test('curl passes credentials, URL and body only through quoted stdin config', async () => {
  const mock = mockSpawn();
  const fetch = createModelFetch('curl', mock);
  const result = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer secret-key', 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'quote" and slash\\\nline' }) });
  assert.equal(result.ok, true); assert.equal(result.status, 200); assert.deepEqual(await result.json(), { ok: true });
  const call = mock.calls[0];
  assert.deepEqual(call.args, ['--disable', '--config', '-']);
  assert.equal(call.options.windowsHide, true);
  assert.ok(call.config.includes('Bearer secret-key'));
  assert.ok(call.config.includes('url = "https://api.deepseek.com/chat/completions"'));
  assert.ok(call.config.includes('connect-timeout = 20'));
  assert.ok(call.config.includes('no-insecure'));
  assert.ok(call.config.includes('no-location'));
  assert.ok(call.config.includes('\\\\'));
});

test('curl returns HTTP failures without retry or raw stderr disclosure', async () => {
  const mock = mockSpawn({ output: '{"error":"denied"}\n401' });
  const result = await createModelFetch('curl', mock)('https://api.deepseek.com/models');
  assert.equal(result.ok, false); assert.equal(result.status, 401); assert.equal(mock.calls.length, 1);
  const failed = mockSpawn({ code: 56 });
  await assert.rejects(createModelFetch('curl', failed)('https://api.deepseek.com/models'), /transport failed/i);
});

test('curl rejects unsafe destinations and malformed header injection before spawn', async () => {
  const mock = mockSpawn(); const fetch = createModelFetch('curl', mock);
  for (const url of ['https://evil.test', 'http://api.deepseek.com/models', 'https://api.deepseek.com.evil.test', 'https://user:pass@api.deepseek.com/models', 'file:///private']) await assert.rejects(fetch(url), /URL|address/i);
  await assert.rejects(fetch('https://api.deepseek.com/models', { headers: { Authorization: 'Bearer key\r\nurl=evil' } }), /header/i);
  assert.equal(mock.calls.length, 0);
  assert.equal((await fetch('http://127.0.0.1:1234/models')).status, 200);
});

test('curl supports abort before and during request and kills child', async () => {
  const mock = mockSpawn({ wait: true }); const fetch = createModelFetch('curl', mock);
  const before = new AbortController(); before.abort();
  await assert.rejects(fetch('https://api.deepseek.com/models', { signal: before.signal }), { name: 'AbortError' });
  assert.equal(mock.calls.length, 0);
  const during = new AbortController(); const pending = fetch('https://api.deepseek.com/models', { signal: during.signal });
  during.abort(); await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(mock.calls[0].child.killed, true);
});

test('curl bounds stdout and sanitizes process errors', async () => {
  const mock = mockSpawn({ wait: true });
  const pending = createModelFetch('curl', mock)('https://api.deepseek.com/models');
  mock.calls[0].child.stdout.write(Buffer.alloc(8 * 1024 * 1024 + 1));
  await assert.rejects(pending, /too large/i);
  assert.equal(mock.calls[0].child.killed, true);
  const other = mockSpawn({ wait: true });
  const failed = createModelFetch('curl', other)('https://api.deepseek.com/models');
  other.calls[0].child.emit('error', new Error('secret-key in raw spawn details'));
  await assert.rejects(failed, e => !e.message.includes('secret-key'));
});
