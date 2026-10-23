import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createKnowledgeSearch} from '../src/retrieval/index.mjs';
import {loadSearchCorpus} from '../src/retrieval/corpus.mjs';
import {cosine} from '../src/retrieval/lexical.mjs';
import {LocalKnowledge} from '../src/local-knowledge.mjs';
const digest=s=>createHash('sha256').update(s).digest('hex');
async function fixture(t){
 await fs.mkdir(path.join(process.cwd(),'output'),{recursive:true});
 const root=await fs.mkdtemp(path.join(process.cwd(),'output','pc-retrieval-')),knowledgeDir=path.join(root,'knowledge'),cacheDir=path.join(root,'cache');
 await fs.mkdir(path.join(knowledgeDir,'assets'),{recursive:true});t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const kb='测试资料库_v1';
 const products=[{id:'pc-a',name:'MateBook A（Windows）',model:'MateBook A',system:'Windows',path:kb+'/P1-产品参数库/Windows/MateBook A'},{id:'pc-b',name:'MateBook B（鸿蒙）',model:'MateBook B',system:'HarmonyOS',path:kb+'/P1-产品参数库/鸿蒙/MateBook B'}];
 const files=[];
 async function add(relative,text){const hash=digest(text),asset={title:path.posix.basename(relative),path:kb+'/'+relative,file:'assets/'+hash+'.md',sha256:hash};files.push(asset);await fs.writeFile(path.join(knowledgeDir,asset.file),text);return asset;}
 await add('P1-产品参数库/Windows/MateBook A/产品事实.md','# MateBook A\n## 显示\n支持外接显示器，便于审阅合同。\n## 适用条件\n仅指定接口及配置支持；须搭配兼容线缆。');
 await add('P1-产品参数库/鸿蒙/MateBook B/产品事实.md','# MateBook B\n## 显示\n支持外接显示器，便于审阅合同。');
 await add('P2-卖点话术库/MateBook A/移动办公.md','# 移动办公\n## 携带\n随身轻便，往返课堂与宿舍。\n## 限制\n携带条件包含充电器，不承诺所有场合。');
 await add('P2-卖点话术库/MateBook B/移动办公.md','# 移动办公\n## 携带\n随身轻便，往返课堂与宿舍。');
 await add('P8-客户场景库/法律服务/访谈.md','# 法律服务\n## 场景\n审阅合同和法院专网登录。\n## 案例性质\n虚构参考情景，不能作为真实客户结果。');
 await add('P7-常见问题库/打印机.md','# 打印机\n## 连接\n确认打印机型号和驱动版本。');
 await add('P6-营销素材库/小红书.md','# 小红书\n## 文风\n用短段落讲清楚课堂协作，不虚构个人体验。');
 for(const product of products){product.documents=files.filter(a=>a.path.startsWith(product.path+'/'));product.images=[];}
 const catalog={schema_version:1,knowledge_base:kb,archive_version:'v1',products,files};
 const save=()=>fs.writeFile(path.join(knowledgeDir,'catalog.json'),JSON.stringify(catalog));await save();
 return {knowledgeDir,cacheDir,catalog,save,add};
}
// This explicit test double supplies controlled vectors only in temporary test indexes.
// Production uses the real transformer model from embedding.mjs.
function fakeEmbedder(){return {id:'test-controlled-vectors-v1',calls:0,async embed(texts){this.calls++;return texts.map(text=>/随身轻便|背包太沉/.test(text)?[1,0,0]:/打印机/.test(text)?[0,1,0]:[0,0,1]);}};}

test('platform filters only explicit style channels and diversified results include each matching requested type',async t=>{
 const f=await fixture(t);
 for(const channel of ['公众号','朋友圈','门店海报长图','微博','抖音','小红书']){
   await f.add(`P6-营销素材库/${channel}/课堂.md`,'# 课堂\n课堂课堂课堂，打印机审阅合同随身轻便。');
 }
 await f.add('P7-常见问题库/公众号连接问题.md','# 课堂问答\n课堂打印机如何连接？');
 await f.save();
 const search=createKnowledgeSearch(f),types=['product_guidance','scenario','faq','style'];
 const result=await search.search('课堂打印机审阅合同随身轻便',{productId:'pc-a',types,platform:'小红书',diversifyTypes:true,mode:'lexical',limit:4});
 assert.deepEqual(new Set(result.results.map(hit=>hit.source_type)),new Set(types));
 assert.ok(result.results.filter(hit=>hit.source_type==='style').every(hit=>! /公众号|朋友圈|海报|长图|微博|抖音/.test(hit.source_path)));
 const faq=await search.search('课堂',{types:['faq'],platform:'小红书',mode:'lexical'});
 assert.ok(faq.results.some(hit=>hit.source_path.includes('公众号连接问题')),'non-style sources must not be channel filtered');
 const none=await search.search('绝不匹配词xyz987',{types,platform:'小红书',diversifyTypes:true,mode:'lexical',limit:4});
 assert.equal(none.results.length,0);
});

test('diversification retains low-ranked matching types beyond the first sixty chunks',async t=>{
 const f=await fixture(t);
 for(let i=0;i<65;i++)await f.add(`P6-营销素材库/小红书/课堂${i}.md`,'# 课堂\n课堂打印机课堂审阅合同随身轻便。');
 await f.save();
 const result=await createKnowledgeSearch(f).search('课堂打印机审阅合同随身轻便',{productId:'pc-a',types:['style','faq','scenario','product_guidance'],platform:'小红书',diversifyTypes:true,mode:'lexical',limit:4});
 assert.equal(new Set(result.results.map(hit=>hit.source_type)).size,4);
});

test('catalog hash, product ownership, complete qualifiers and fictional status survive chunking',async t=>{
 const f=await fixture(t),corpus=await loadSearchCorpus(f.knowledgeDir);
 const fact=corpus.chunks.find(c=>c.product_id==='pc-a'&&c.section.endsWith('显示'));
 assert.equal(fact.source_type,'product_fact');assert.equal(fact.supports_product_fact,true);
 assert.match(fact.text,/仅指定接口及配置支持；须搭配兼容线缆/);assert.equal(fact.source_sha256.length,64);
 const scene=corpus.chunks.find(c=>c.source_type==='scenario');assert.equal(scene.fictional,true);assert.equal(scene.supports_product_fact,false);
 const source=f.catalog.files[0];await fs.writeFile(path.join(f.knowledgeDir,source.file),'tampered');
 await assert.rejects(loadSearchCorpus(f.knowledgeDir),/完整性校验失败/);
});

test('identical model labels across systems cannot leak through unscoped mentions',async t=>{
 const f=await fixture(t);
 f.catalog.products[1].model='MateBook A';
 const text='# 场景\nMateBook A 随身轻便',hash=digest(text);
 const asset={title:'系统不明.md',path:f.catalog.knowledge_base+'/P8-客户场景库/系统不明.md',file:'assets/'+hash+'.md',sha256:hash};
 f.catalog.files.push(asset);await fs.writeFile(path.join(f.knowledgeDir,asset.file),text);
 await f.save();
 const search=createKnowledgeSearch(f);
 const result=await search.search('随身轻便',{productId:'pc-b',types:['product_guidance'],mode:'lexical'});
 assert.ok(!result.results.some(hit=>hit.source_path.includes('/MateBook A/')),'ambiguous model folder cannot be attributed to one system');
 const unscoped=await search.search('随身轻便',{productId:'pc-a',types:['scenario'],mode:'lexical'});
 assert.ok(!unscoped.results.some(hit=>hit.source_path===asset.path),'ambiguous model mention cannot select a system');
});

test('one source contributes at most two chunks and every hit keeps original qualifiers',async t=>{
 const f=await fixture(t),search=createKnowledgeSearch(f);
 const result=await search.search('随身轻便充电器携带',{productId:'pc-a',mode:'lexical',limit:30});
 const counts=new Map();
 for(const hit of result.results){counts.set(hit.source_path,(counts.get(hit.source_path)||0)+1);}
 assert.ok([...counts.values()].every(count=>count<=2));
 const guidance=result.results.find(hit=>hit.source_type==='product_guidance');
 assert.match(guidance.text,/携带条件包含充电器，不承诺所有场合/);
});
test('lexical retrieval excludes wrong-model facts and requires product selection for every fact',async t=>{
 const f=await fixture(t),search=createKnowledgeSearch(f);
 const noProduct=await search.search('外接显示器审阅合同',{types:['product_fact'],mode:'lexical'});assert.deepEqual(noProduct.results,[]);
 const selected=await search.search('外接显示器审阅合同',{productId:'pc-a',types:['product_fact'],mode:'lexical'});
 assert.ok(selected.results.length);assert.ok(selected.results.every(x=>x.product_id==='pc-a'));
 assert.equal(selected.mode,'lexical');assert.ok(selected.results[0].scores.lexical>0);assert.equal(selected.results[0].ranks.vector,null);
 const guidance=await search.search('随身轻便',{productId:'pc-a',types:['product_guidance'],mode:'lexical'});
 assert.ok(guidance.results.length);assert.ok(guidance.results.every(x=>x.product_id==='pc-a'&&!x.supports_product_fact));
});
test('missing vector index is explicit lexical fallback and never downloads a model during search',async t=>{
 const f=await fixture(t),embedder=fakeEmbedder(),search=createKnowledgeSearch({...f,embedder});
 const result=await search.search('法院专网',{mode:'hybrid'});
 assert.equal(result.mode,'lexical_fallback');assert.equal(result.requested_mode,'hybrid');assert.match(result.warnings.join(''),/尚未构建/);assert.equal(embedder.calls,0);
});
test('hybrid RRF uses injected semantic vectors, scopes models and reuses a validated index',async t=>{
 const f=await fixture(t),embedder=fakeEmbedder(),search=createKnowledgeSearch({...f,embedder});
 const built=await search.build({batchSize:3});assert.equal(built.vector_ready,true);assert.equal(built.vector_count,built.chunk_count);
 const literal=await search.search('背包太沉',{productId:'pc-a',types:['product_guidance'],mode:'lexical'});assert.equal(literal.results.length,0);
 const hybrid=await search.search('背包太沉',{productId:'pc-a',types:['product_guidance'],mode:'hybrid'});
 assert.equal(hybrid.mode,'hybrid');assert.equal(hybrid.results[0].product_id,'pc-a');assert.ok(hybrid.results[0].ranks.vector);assert.equal(hybrid.results[0].ranks.lexical,null);
 assert.match(hybrid.results[0].text,/充电器/);assert.ok(!hybrid.results.some(x=>x.product_id==='pc-b'));
 const second=createKnowledgeSearch({...f,embedder});const before=embedder.calls;const reused=await second.build();assert.equal(reused.reused,true);assert.equal(embedder.calls,before);
});
test('vector cache integrity and query embedding failure cannot masquerade as hybrid success',async t=>{
 const f=await fixture(t),embedder=fakeEmbedder(),search=createKnowledgeSearch({...f,embedder});await search.build();
 embedder.embed=async()=>{throw Error('test offline');};
 const result=await search.search('法院专网',{mode:'vector'});assert.equal(result.mode,'lexical_fallback');assert.match(result.warnings[0],/查询向量不可用/);
 const meta=JSON.parse(await fs.readFile(path.join(f.cacheDir,'index.json'),'utf8'));await fs.writeFile(path.join(f.cacheDir,meta.file),'tampered');
 const fresh=createKnowledgeSearch({...f,embedder});const invalid=await fresh.search('法院专网');assert.equal(invalid.mode,'lexical_fallback');assert.match(invalid.warnings[0],/完整性校验失败/);
});
test('invalid zero/dimension embeddings fail build instead of producing fabricated vectors',async t=>{
 const f=await fixture(t),search=createKnowledgeSearch({...f,embedder:{id:'bad',embed:async texts=>texts.map(()=>[0,0])}});
 await assert.rejects(search.build(),/无效向量/);assert.equal(search.status().vector_ready,false);
 assert.throws(()=>cosine([1,2],[1]),/维度/);
 await assert.rejects(search.search('合同',{productId:'unknown'}),/不在资料目录/);
});

test('local generation keeps complete P1 evidence and adds scoped guidance without promoting it to facts',async t=>{
 const f=await fixture(t),search=createKnowledgeSearch(f);
 const local=new LocalKnowledge({...f,searchMode:'lexical',searchClient:search,localOutputRoot:f.cacheDir});
 const result=await local.retrieve({product:f.catalog.products[0].name,scenario:'随身轻便，课堂和合同审阅',audience:'学生',platform:'小红书'});
 const facts=result.sources.filter(s=>s.kind==='text');
 assert.equal(facts.length,1);assert.match(facts[0].text,/适用条件[\s\S]*须搭配兼容线缆/);assert.equal(facts[0].truncated,false);
 const guidance=result.context_retrieval.results;
 assert.ok(guidance.length>0);assert.ok(guidance.every(s=>s.supports_product_fact===false));
 assert.ok(!guidance.some(s=>s.product_id==='pc-b'));assert.equal(result.context_retrieval.mode,'lexical');
 assert.match(guidance[0].usage,/不得作为产品能力/);
});

test('a running search instance notices an index built after its earlier fallback',async t=>{
 const f=await fixture(t),embedder=fakeEmbedder(),reader=createKnowledgeSearch({...f,embedder});
 assert.equal((await reader.search('随身轻便')).mode,'lexical_fallback');
 assert.equal(reader.status().vector_ready,false);
 const writer=createKnowledgeSearch({...f,embedder});await writer.build();
 const recovered=await reader.search('随身轻便');
 assert.equal(recovered.mode,'hybrid');assert.equal(reader.status().vector_ready,true);
 assert.equal(recovered.warnings.length,0);
});
test('a running search instance detects changed, corrupt, repaired and removed index files',async t=>{
 const f=await fixture(t),embedder=fakeEmbedder(),search=createKnowledgeSearch({...f,embedder});await search.build();
 const manifest=path.join(f.cacheDir,'index.json'),meta=JSON.parse(await fs.readFile(manifest,'utf8')),binary=path.join(f.cacheDir,meta.file);
 const original=await fs.readFile(binary),corrupt=Buffer.from(original);corrupt[0]^=255;
 // Same byte length: integrity detection depends on changed metadata, not only size.
 await fs.writeFile(binary,corrupt);
 const failed=await search.search('随身轻便');assert.equal(failed.mode,'lexical_fallback');assert.match(failed.warnings[0],/完整性校验失败/);assert.equal(search.status().vector_ready,false);
 await fs.writeFile(binary,original);
 assert.equal((await search.search('随身轻便')).mode,'hybrid');
 const replacement={...meta,built_at:'2030-01-01T00:00:00Z'};
 await fs.writeFile(manifest+'.replacement',JSON.stringify(replacement));await fs.rename(manifest+'.replacement',manifest);
 assert.equal((await search.search('随身轻便')).mode,'hybrid');assert.equal(search.status().built_at,replacement.built_at);
 await fs.writeFile(manifest,JSON.stringify({...replacement,corpus_fingerprint:'wrong'}));
 assert.equal((await search.search('随身轻便')).mode,'lexical_fallback');assert.equal(search.status().vector_ready,false);
 await fs.writeFile(manifest,JSON.stringify(replacement));assert.equal((await search.search('随身轻便')).mode,'hybrid');
 await fs.unlink(manifest);assert.equal((await search.search('随身轻便')).mode,'lexical_fallback');assert.equal(search.status().vector_ready,false);
});
