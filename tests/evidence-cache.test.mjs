import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let api; try { api=await import('../src/evidence-cache.mjs'); } catch {}

test('explicit cache preserves source date, rejects another product and does not call live ima',async()=>{
  assert.ok(api?.retrieveEvidence,'cache retrieval module required');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'store-evidence-'));
  try {
    const file=path.join(dir,'saved.json');
    await fs.writeFile(file,JSON.stringify({input:{product:'test product'},meta:{created_at:'2026-10-17T10:00:00Z',knowledge_base:'test base'},sources:[{ref:'S1',kind:'text',text:'saved real-source shape',title:'test',url:'https://example.test/private-link'}]}));
    const live={retrieve:()=>assert.fail('cache mode must not invoke live API')};
    const evidence=await api.retrieveEvidence(live,{product:'test product'},{evidenceCacheFile:file,kbName:'test base'},()=>{});
    assert.equal(evidence.retrieval.mode,'cached');
    assert.equal(evidence.retrieval.source_created_at,'2026-10-17T10:00:00Z');
    assert.equal(evidence.sources[0].url,undefined);
    assert(evidence.warnings.some(x=>x.includes('缓存')));
    const saved=JSON.parse(await fs.readFile(file,'utf8'));
    saved.meta.retrieval={mode:'cached',source_created_at:'2026-09-01T10:00:00Z'};
    await fs.writeFile(file,JSON.stringify(saved));
    const reused=await api.retrieveEvidence(live,{product:'test product'},{evidenceCacheFile:file,kbName:'test base'},()=>{});
    assert.equal(reused.retrieval.source_created_at,'2026-09-01T10:00:00Z','cached generation must not reset source age');
    await assert.rejects(api.retrieveEvidence(live,{product:'other'},{evidenceCacheFile:file,kbName:'test base'},()=>{}),/型号/);
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('default mode uses live retrieval and never silently falls back on quota failure',async()=>{
  assert.ok(api?.retrieveEvidence);
  await assert.rejects(api.retrieveEvidence({retrieve:async()=>{throw Error('ima 220021');}},{product:'x'},{},()=>{}),/220021/);
});
