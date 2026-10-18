import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runPipeline, validate } from '../src/pipeline.mjs';
import { runShadowBatch } from '../src/shadow-batch.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL('../handoffs/output-results/examples/' + name, import.meta.url)));
const input = read('output-task.json');
const adapt = fixture => read(fixture).sources.map(s => ({ ref:s.id, kind:s.type, text:s.text, title:s.title }));
const sources = adapt('source-fixture.json');
const run = (output, refs=sources) => runPipeline(input, {retrieve:async()=>({sources:refs}),generate:async()=>structuredClone(output)});

test('output handoff is accepted by real pipeline with explicit draft delivery state', async()=>{
  const result=await run(read('expected-output.json'));
  assert.equal(result.delivery?.status,'draft');
  assert.equal(result.checks.semantic_review,'not_performed');
});
test('conflicting evidence returns a blocked result without loosening required input',async()=>{
  const result=await run(read('expected/conflicting-facts.json'),adapt('conflict-source-fixture.json'));
  assert.equal(result.delivery?.status,'blocked');
  assert.ok(result.delivery.reasons.length);
  assert.equal(result.output.content.body,'');
  assert.throws(()=>validate({product:''},{type:'object',required:['product'],properties:{product:{type:'string'}}}),/必填/);
});
test('missing images preserve text draft and report exact image deficit',async()=>{
  const result=await run(read('expected/student-no-images.json'),sources.filter(s=>s.kind==='text'));
  assert.equal(result.delivery?.status,'needs_images');
  assert.equal(result.delivery.missing_images,3);
});
test('partially empty content cannot be mistaken for a blocked result',async()=>{
  const output=read('expected-output.json');output.content.title='';
  await assert.rejects(run(output),/必填/);
});
test('duplicate follow-up days cannot pass the integrated pipeline',async()=>{
  const output=read('expected-output.json');output.follow_up[1].day=1;
  await assert.rejects(run(output),/1.*3.*7/);
});
test('image references must also appear in source_refs',async()=>{
  const output=read('expected-output.json');output.source_refs=output.source_refs.filter(r=>r!=='I3');
  await assert.rejects(run(output),/引用/);
});
test('unused sources cannot inflate the reference list',async()=>{
  const output=read('expected-output.json');output.source_refs.push('S2');
  await assert.rejects(run(output,[...sources,{ref:'S2',kind:'text',text:'unused'}]),/引用/);
});
test('blocked platform is retained but never marks a batch complete',async()=>{
  const result=await runShadowBatch({analysis_id:'test',tasks:[input],customer_context:{}},{model:'test'},()=>{}, {
    ima:{retrieve:async()=>({sources:adapt('conflict-source-fixture.json')})},
    ds:{generate:async()=>read('expected/conflicting-facts.json')}
  });
  assert.equal(result.complete,false);
  assert.equal(result.results.length,1);
  assert.equal(result.results[0].result.delivery.status,'blocked');
  assert.equal(result.blocked.length,1);
});
