import { test } from 'node:test';
import assert from 'node:assert/strict';
let api;
try { api = await import('../src/ima.mjs'); } catch {}

test('ima business failure is not treated as a successful retrieval', () => {
  assert.ok(api);
  assert.throws(() => api.unwrap({ code: 200002, msg: 'skill auth failed' }), /200002.*skill auth failed/);
});
test('supports actual kb_id/kb_name fields and documented id/name fields', () => {
  assert.ok(api);
  assert.deepEqual(api.normalizeBase({ kb_id: 'a', kb_name: '华为' }), { id: 'a', name: '华为' });
  assert.deepEqual(api.normalizeBase({ id: 'a', name: '华为' }), { id: 'a', name: '华为' });
});
test('empty search falls back to paginated product directory and reads original', async () => {
  assert.ok(api);
  const calls = [];
  const call = async (name, body) => {
    calls.push([name, body]);
    if (name === 'search_knowledge_base') return { info_list: [{ kb_id: 'kb', kb_name: '比赛库' }], is_end: true };
    if (name === 'search_knowledge') return { info_list: [], is_end: true };
    if (name === 'get_knowledge_list') {
      if (!body.folder_id) return { knowledge_list: [{ media_id: 'p1', title: 'P1-产品参数库', media_type: 0 }], is_end: true };
      if (body.folder_id === 'p1' && !body.cursor) return { knowledge_list: [], is_end: false, next_cursor: 'page2' };
      if (body.folder_id === 'p1') return { knowledge_list: [{ media_id: 'model', title: 'HUAWEI MateBook 14', media_type: 0 }], is_end: true };
      if (body.folder_id === 'model') return { knowledge_list: [{ media_id: 'article', title: 'article.md', media_type: 7 }], is_end: true };
    }
    if (name === 'get_media_info') return { media_type: 7, url_info: { url: 'https://example.com/source.md?signature=private' } };
    assert.fail('Unexpected call: ' + name);
  };
  const client = new api.ImaClient({ kbName: '比赛库', call, fetchText: async () => '真实测试原文' });
  const result = await client.retrieve({ product: 'HUAWEI MateBook 14' });
  assert.equal(result.sources[0].text, '真实测试原文');
  assert.ok(calls.some(([name, b]) => name === 'get_knowledge_list' && b.cursor === 'page2'));
  assert.ok(!JSON.stringify(result).includes('signature='));
  assert.ok(!JSON.stringify(result).includes('media_id'));
});
test('cannot silently choose an unrelated knowledge base', async () => {
  assert.ok(api);
  const client = new api.ImaClient({ kbName: '指定库', call: async () => ({ info_list: [{ kb_id: 'x', kb_name: '其他库' }], is_end: true }) });
  await assert.rejects(client.resolveBase(), /指定库/);
});
test('directory fallback rejects duplicate product identities across system branches', async () => {
  const call = async (endpoint, body) => {
    if (endpoint === 'search_knowledge') return { info_list: [] };
    const trees = {
      root: [{ media_id: 'p1', title: 'P1-产品参数库', media_type: 99 }],
      p1: [{ media_id: 'harmony', title: '01-鸿蒙电脑', media_type: 99 }, { media_id: 'windows', title: '02-MateBook-Windows', media_type: 99 }],
      harmony: [{ media_id: 'a', title: 'HUAWEI MateBook Pro', media_type: 99 }],
      windows: [{ media_id: 'b', title: 'HUAWEI MateBook Pro', media_type: 99 }],
      a: [{ media_id: 'doc-a', title: '产品事实.md', media_type: 7 }],
      b: [{ media_id: 'doc-b', title: '产品事实.md', media_type: 7 }],
    };
    return { knowledge_list: trees[body.folder_id || 'root'], is_end: true };
  };
  const client = new api.ImaClient({ kbName: '比赛库', call });
  await assert.rejects(client.productFolder({ id: 'kb', name: '比赛库' }, 'HUAWEI MateBook Pro', () => {}), /多个事实目录/);
});
test('one failed optional image keeps readable facts and the remaining images', async () => {
  const client = new api.ImaClient({
    kbName: '比赛库',
    call: async (endpoint, body) => {
      if (endpoint === 'get_media_info') return { url_info: { url: `https://example.com/${body.media_id}` } };
      if (endpoint === 'get_knowledge_list') return { knowledge_list: [{ media_id: 'bad', title: 'bad.png', media_type: 9 }, { media_id: 'good', title: 'good.png', media_type: 9 }], is_end: true };
      assert.fail(endpoint);
    },
    fetchText: async () => '已读取的产品原文',
    saveImage: async info => { if (info.url.endsWith('/bad')) throw Error('图片读取失败'); return 'output/media/good.png'; },
  });
  client.resolveBase = async () => ({ id: 'kb', name: '比赛库' });
  client.productFolder = async () => ({ pathname: 'P1/产品', items: [{ media_id: 'doc', title: '产品事实.md', media_type: 7 }, { media_id: 'images', title: 'images', media_type: 99 }] });
  const result = await client.retrieve({ product: '产品' });
  assert.equal(result.sources[0].text, '已读取的产品原文');
  assert.equal(result.sources[1].kind, 'image');
  assert.equal(result.sources[1].ref, 'I1');
  assert.ok(result.warnings.some(x => x.includes('bad.png')));
});
