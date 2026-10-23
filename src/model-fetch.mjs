import { spawn } from 'node:child_process';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const quoted = value => '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t').replace(/\v/g, '\\v') + '"';
const abortError = () => Object.assign(new Error('Model request aborted'), { name: 'AbortError' });

/** Optional local workaround for environments where native Node TLS is unavailable. */
export function createModelFetch(transport = 'native', { spawnImpl = spawn } = {}) {
  if (transport === 'native') return globalThis.fetch;
  if (transport !== 'curl') throw Error('Unknown model HTTP transport');
  return async function curlFetch(address, options = {}) {
    let url;
    try { url = new URL(address); } catch { throw Error('Invalid model URL'); }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol) ||
        !(loopback || url.protocol === 'https:' && url.hostname === 'api.deepseek.com')) throw Error('Model URL must use official HTTPS or a loopback address');
    if (options.signal?.aborted) throw abortError();
    const method = String(options.method || 'GET').toUpperCase();
    if (!/^[A-Z]+$/.test(method)) throw Error('Invalid model request method');
    let headers;
    try { headers = new Headers(options.headers || {}); } catch { throw Error('Invalid model request header'); }
    const config = [
      `url = ${quoted(url.href)}`, `request = ${quoted(method)}`,
      'silent', 'no-location', 'no-insecure', 'max-time = 120', 'connect-timeout = 20',
      'proto = "=http,https"', 'write-out = "\\n%{http_code}"',
      ...[...headers].map(([name, value]) => `header = ${quoted(`${name}: ${value}`)}`),
    ];
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body !== 'string') throw Error('Model HTTP body must be a string');
      if (options.body.includes('\0')) throw Error('Invalid model HTTP body');
      // data-raw prevents an initial @ from becoming a local file read.
      config.push(`data-raw = ${quoted(options.body)}`);
    }
    return new Promise((resolve, reject) => {
      let child, settled = false, size = 0;
      const chunks = [];
      const finish = (error, response) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(response);
      };
      const stop = error => { finish(error); child?.kill(); };
      const onAbort = () => stop(abortError());
      try {
        // --disable must be first: a local .curlrc must not enable redirects or disable TLS validation.
        child = spawnImpl(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--disable', '--config', '-'], {
          windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch { finish(new Error('Model HTTP transport failed')); return; }
      child.on('error', () => finish(new Error('Model HTTP transport failed')));
      child.stdin.on('error', () => stop(new Error('Model HTTP transport failed')));
      // Never expose curl's stderr: it may include URLs or authentication details.
      child.stderr.resume();
      child.stdout.on('data', chunk => {
        if (settled) return;
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_RESPONSE_BYTES) { stop(new Error('Model HTTP response too large')); return; }
        chunks.push(bytes);
      });
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) { finish(new Error('Model HTTP transport failed')); return; }
        const raw = Buffer.concat(chunks).toString('utf8');
        const boundary = raw.lastIndexOf('\n');
        const statusText = raw.slice(boundary + 1);
        if (boundary < 0 || !/^[1-5]\d{2}$/.test(statusText)) { finish(new Error('Invalid model HTTP response')); return; }
        const status = Number(statusText), body = raw.slice(0, boundary);
        finish(null, { ok: status >= 200 && status < 300, status,
          async json() { try { return JSON.parse(body); } catch { throw Error('Invalid model JSON response'); } } });
      });
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) { onAbort(); return; }
      child.stdin.end(config.join('\n') + '\n');
    });
  };
}
