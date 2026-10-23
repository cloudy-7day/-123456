const noDiagnostics={record:async()=>{},list:async()=>[]};
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { DeepSeekClient } from '../src/deepseek.mjs';
let web;
try { web = await import('../server.mjs'); } catch {}

test('DeepSeek handles JSON responses and rejects truncated results', async () => {
  const client = new DeepSeekClient({ apiKey: 'test-key', model: 'test-model', fetchImpl: async (url, opts) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(JSON.parse(opts.body).response_format.type, 'json_object');
    return { ok: true, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }) };
  } });
  await assert.rejects(client.generate({ input: {}, sources: [], outputSchema: {}, system: 'json' }), /截断/);
});
test('DeepSeek will not send credentials to an unrecognized remote host', () => {
  assert.throws(() => new DeepSeekClient({ apiKey: 'test', baseUrl: 'https://example.com' }), /官方API/);
});
test('local page and contracts load; invalid input and cross-origin requests do not generate', async () => {
  assert.ok(web?.createApp);
  const server = web.createApp({ scenarioDependencies:{diagnostics:noDiagnostics}, settings: { port: 0 }, run: () => assert.fail('must not run') });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /门店增长/);
    const schema = await fetch(base + '/api/contracts').then(r => r.json()); assert.ok(schema.input.required.includes('product'));
    const invalid = await fetch(base + '/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(invalid.status, 400);
    const foreign = await fetch(base + '/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: '{}' });
    assert.equal(foreign.status, 403);
    const secret = await fetch(base + '/.env.local'); assert.equal(secret.status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
test('HTTP preserves Chinese characters split across request chunks', async () => {
  let received;
  const server = web.createApp({ scenarioDependencies:{diagnostics:noDiagnostics}, settings: { port: 0 }, run: async input => { received = input; throw Error('test finished before output save'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const input = { product: '测试电脑', audience: '大学新生', scenario: '课堂笔记', platform: '朋友圈' };
  const body = Buffer.from(JSON.stringify(input));
  const split = body.indexOf(Buffer.from('朋友')) + 1;
  try {
    const response = new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port: server.address().port, path: '/api/run', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
        let data = ''; res.on('data', b => data += b); res.on('end', () => resolve({ status: res.statusCode, data }));
      });
      request.on('error', reject);
      request.write(body.subarray(0, split));
      setTimeout(() => request.end(body.subarray(split)), 15);
    });
    const result = await response;
    assert.equal(result.status, 200);
    assert.deepEqual(received, input);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
