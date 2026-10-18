import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, ROOT, readJson, safeError } from './src/config.mjs';
import { validate } from './src/pipeline.mjs';
import { execute, doctor } from './src/runtime.mjs';

export function createApp({ settings = config(), run, check } = {}) {
  let busy = false;
  const server = http.createServer(async (req, res) => {
    // The container sits behind the Studio HTTPS reverse proxy.
    // Accept its public host while keeping browser requests same-origin.
    const requestHost = req.headers.host;
    const forwardedHost = req.headers['x-forwarded-host'];
    const allowedHosts = [requestHost, forwardedHost].filter(host => typeof host === 'string' && /^[a-z0-9.\-]+(?::\d+)?$/i.test(host));
    const reply = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'self' https://modelscope.cn https://*.modelscope.cn https://modelscope.ai https://*.modelscope.ai");
    if (!allowedHosts.includes(requestHost)) return reply(403, { error: '不支持的访问地址' });
    if (req.headers.origin && !allowedHosts.some(host => ['http', 'https'].some(protocol => req.headers.origin === `${protocol}://${host}`))) return reply(403, { error: '只允许同源请求' });
    try {
      const route = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (req.method === 'GET' && route === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(await fs.readFile(path.join(ROOT, 'public/index.html')));
      }
      if (req.method === 'GET' && route === '/api/contracts') return reply(200, { input: readJson('contracts/input.schema.json'), output: readJson('contracts/output.schema.json') });
      if (req.method === 'GET' && route === '/api/status') return reply(200, await (check || (() => doctor(settings)))());
      if (req.method === 'GET' && /^\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(route)) {
        const ext = route.split('.').pop();
        const data = await fs.readFile(path.join(ROOT, 'output/media', path.basename(route)));
        res.writeHead(200, { 'Content-Type': { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[ext] });
        return res.end(data);
      }
      if (req.method === 'GET' && route === '/api/latest') {
        try { return reply(200, JSON.parse(await fs.readFile(path.join(ROOT, 'output/latest.json'), 'utf8'))); }
        catch { return reply(404, { error: '还没有保存的运行结果' }); }
      }
      if (req.method === 'POST' && route === '/api/run') {
        if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: '需要JSON输入' });
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 16384) return reply(413, { error: '输入过长' });
          chunks.push(chunk);
        }
        const text = Buffer.concat(chunks).toString('utf8');
        let input;
        try { input = JSON.parse(text); validate(input, readJson('contracts/input.schema.json')); }
        catch (error) { return reply(400, { error: safeError(error) }); }
        if (busy) return reply(409, { error: '已有任务运行中，请稍后重试' });
        busy = true;
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
        const send = value => { if (!res.destroyed) res.write(JSON.stringify(value) + '\n'); };
        try {
          const result = await (run || ((task, progress) => execute(task, progress, settings)))(input, message => send({ type: 'progress', message }));
          await fs.mkdir(path.join(ROOT, 'output'), { recursive: true });
          await fs.writeFile(path.join(ROOT, 'output/latest.json'), JSON.stringify(result, null, 2));
          send({ type: 'result', result });
        } catch (error) { send({ type: 'error', message: safeError(error) }); }
        finally { busy = false; res.end(); }
        return;
      }
      reply(404, { error: '未找到该页面或文件' });
    } catch (error) {
      if (!res.headersSent) reply(error.code === 'ENOENT' ? 404 : 500, { error: safeError(error) });
      else res.end();
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const settings = config();
  createApp({ settings }).listen(settings.port, settings.host, () => console.log(`门店增长智能体：http://${settings.host}:${settings.port}`));
}
