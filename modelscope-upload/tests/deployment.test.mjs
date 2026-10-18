import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createApp } from '../server.mjs';

test('cloud host and HTTPS proxy requests work; unrelated origins stay blocked', async () => {
  const server = createApp({ settings: { port: 0 }, run: () => assert.fail('invalid input must not generate') });
  server.listen(0, '0.0.0.0');
  await once(server, 'listening');
  const request = (url, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method, headers }, res => {
      let data = ''; res.on('data', chunk => data += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data }));
    });
    req.on('error', reject); req.end(body);
  });
  try {
    assert.equal(server.address().address, '0.0.0.0');
    const page = await request('/', { Host: 'demo.modelscope.cn' });
    assert.equal(page.status, 200);
    assert.match(page.headers['content-security-policy'], /frame-ancestors .*https:\/\/\*\.modelscope.cn/);
    const schema = await request('/api/contracts', { Host: 'demo.modelscope.cn', Origin: 'https://demo.modelscope.cn' });
    assert.equal(schema.status, 200);
    assert.ok(JSON.parse(schema.data).input.required.includes('product'));
    const proxy = { Host: 'container:7860', 'X-Forwarded-Host': 'demo.modelscope.cn', Origin: 'https://demo.modelscope.cn', 'Content-Type': 'application/json' };
    assert.equal((await request('/api/run', proxy, 'POST', '{}')).status, 400);
    assert.equal((await request('/api/run', { ...proxy, Origin: 'https://unrelated.example' }, 'POST', '{}')).status, 403);
    assert.equal((await request('/.env.local', { Host: 'demo.modelscope.cn' })).status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
