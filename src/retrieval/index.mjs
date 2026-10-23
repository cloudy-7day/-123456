import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import { loadSearchCorpus, SOURCE_TYPES, sha256 } from './corpus.mjs';
import { buildLexicalIndex, lexicalRanking, cosine } from './lexical.mjs';
import { createLocalEmbedder, EMBEDDING_MODEL } from './embedding.mjs';

const INDEX_VERSION = 1;
const MODES = ['hybrid','lexical','vector'];
const styleChannels=[['小红书',/小红书|\bxhs\b/i],['公众号',/公众号|微信公众|微信推文/],['朋友圈',/朋友圈/],['微博',/微博/],['抖音',/抖音/],['视频号',/视频号/],['知乎',/知乎/],['B站',/B站|bilibili/i]];
function matchesStylePlatform(chunk,platform){
  if(chunk.source_type!=='style'||!platform)return true;
  const selected=styleChannels.find(([,pattern])=>pattern.test(platform));
  if(!selected)return true;
  const label=`${chunk.source_path} ${chunk.title}`;
  if(selected[0]==='小红书'&&/海报|长图/.test(label))return false;
  return !styleChannels.some(([channel,pattern])=>channel!==selected[0]&&pattern.test(label));
}
const safeReason = error => String(error?.message || error).replace(/https?:\/\/\S+/g,'[模型服务地址]').slice(0,220);
const jsonRead = async file => JSON.parse(await fs.readFile(file,'utf8'));
async function atomicJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary,JSON.stringify(value));
  // Windows scanners may briefly hold the destination after an earlier read.
  // Keep atomic replacement; never delete a valid manifest as a workaround.
  for(let attempt=0;;attempt++){
    try{await fs.rename(temporary,file);break;}
    catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=4)throw error;await delay(25*(attempt+1));}
  }
}
function vectorBytes(rows, dimensions) {
  const bytes = Buffer.alloc(rows.length * dimensions * 4);
  rows.forEach((row,i) => {
    if ((!Array.isArray(row) && !ArrayBuffer.isView(row)) || row.length !== dimensions || !row.every(Number.isFinite) || !row.some(x=>x!==0)) throw Error('Embedding 返回无效向量，停止构建。');
    row.forEach((value,j)=>bytes.writeFloatLE(value,(i*dimensions+j)*4));
  });
  return bytes;
}
function readVectors(bytes, dimensions, count) {
  if(bytes.length!==dimensions*count*4)throw Error('向量缓存长度不匹配。');
  const all=new Float32Array(dimensions*count);
  for(let i=0;i<all.length;i++)all[i]=bytes.readFloatLE(i*4);
  return Array.from({length:count},(_,i)=>all.subarray(i*dimensions,(i+1)*dimensions));
}
export function createKnowledgeSearch({knowledgeDir,cacheDir,embedder} = {}) {
  if (!knowledgeDir) throw Error('必须指定 knowledgeDir。');
  knowledgeDir=path.resolve(knowledgeDir);
  cacheDir=path.resolve(cacheDir || process.env.SEARCH_CACHE_DIR || path.join(knowledgeDir,'..','output','search-cache'));
  const provider=embedder ? (typeof embedder==='function' ? {id:embedder.id||'injected-embedder',embed:embedder} : embedder) : createLocalEmbedder({cacheDir});
  if(typeof provider.embed!=='function')throw Error('embedder 必须提供 embed(texts)。');
  const modelId=provider.id||'injected-embedder';
  let corpus,lexical,stamp,loadPromise,buildPromise,vectors=null,indexWarning='';
  let indexStamp,vectorStamp,vectorFile,vectorLoadPromise;
  const fileStamp=stat=>`${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.ino}`;
  let state={state:'unloaded',ready:false,vector_ready:false,model:embedder?modelId:EMBEDDING_MODEL,embedding_id:modelId,document_count:0,chunk_count:0,vector_count:0,source_counts:{},cache_dir:cacheDir};
  async function ensureCorpus() {
    const stat=await fs.stat(path.join(knowledgeDir,'catalog.json')),nextStamp=`${stat.size}:${stat.mtimeMs}`;
    if(corpus&&stamp===nextStamp)return corpus;
    if(loadPromise)return loadPromise;
    loadPromise=(async()=>{
      state={...state,state:'loading',ready:false};
      const next=await loadSearchCorpus(knowledgeDir);
      // Include chunk IDs so a changed splitting strategy cannot reuse incompatible vectors.
      next.fingerprint=sha256(`${INDEX_VERSION}\n${next.fingerprint}\n${next.chunks.map(c=>c.id).join('\n')}`);
      corpus=next;lexical=buildLexicalIndex(corpus.chunks);stamp=nextStamp;vectors=null;indexStamp=undefined;vectorStamp=undefined;vectorFile=undefined;indexWarning='';
      state={...state,state:'lexical_ready',ready:true,vector_ready:false,document_count:corpus.documentCount,chunk_count:corpus.chunks.length,vector_count:0,source_counts:corpus.sourceCounts,fingerprint:corpus.fingerprint};
      return corpus;
    })().finally(()=>{loadPromise=null;});
    return loadPromise;
  }
  function validMetadata(meta) {
    return meta.version===INDEX_VERSION&&meta.corpus_fingerprint===corpus.fingerprint&&meta.embedding_id===modelId&&Number.isInteger(meta.dimensions)&&meta.dimensions>0&&meta.dimensions<=8192;
  }
  function invalidateVectors(error) {
    vectors=null;
    indexWarning=error.code==='ENOENT'?'向量索引尚未构建或文件已移除，本次仅使用词法检索。':safeReason(error);
    state={...state,state:state.state==='building'?'building':'lexical_ready',vector_ready:false,
      vector_count:state.state==='building'?state.vector_count:0,dimensions:null,built_at:null};
  }
  async function refreshVectors() {
    // Check the small manifest and file metadata on every query. Re-read/hash the large
    // binary only when a manifest or binary has changed; a missing index is retried.
    const indexPath=path.join(cacheDir,'index.json');
    let nextIndexStamp,nextVectorStamp;
    try{nextIndexStamp=fileStamp(await fs.stat(indexPath,{bigint:true}));}
    catch(error){indexStamp=undefined;vectorStamp=undefined;vectorFile=undefined;invalidateVectors(error);return null;}
    if(nextIndexStamp===indexStamp&&vectors){
      if(!vectorFile)return vectors; // Cached invalid manifest; its next change retries it.
      try{nextVectorStamp=fileStamp(await fs.stat(vectorFile,{bigint:true}));}
      catch(error){vectorStamp=undefined;invalidateVectors(error);return null;}
      if(nextVectorStamp===vectorStamp)return vectors;
    }
    indexStamp=nextIndexStamp;vectorStamp=undefined;vectorFile=undefined;
    try {
      const meta=await jsonRead(indexPath);
      if(!validMetadata(meta)||meta.count!==corpus.chunks.length||!/^vectors-[a-f0-9]{64}\.bin$/.test(meta.file||''))throw Error('向量索引与当前资料或模型不一致，请重新构建。');
      vectorFile=path.join(cacheDir,meta.file);
      vectorStamp=fileStamp(await fs.stat(vectorFile,{bigint:true}));
      const bytes=await fs.readFile(vectorFile);
      if(sha256(bytes)!==meta.sha256)throw Error('向量索引完整性校验失败，请重新构建。');
      vectors=readVectors(bytes,meta.dimensions,meta.count);indexWarning='';
      state={...state,state:'hybrid_ready',vector_ready:true,vector_count:meta.count,dimensions:meta.dimensions,built_at:meta.built_at,last_error:null};
    }catch(error){invalidateVectors(error);}
    return vectors;
  }
  async function loadVectors() {
    if(!vectorLoadPromise)vectorLoadPromise=refreshVectors().finally(()=>{vectorLoadPromise=null;});
    return vectorLoadPromise;
  }
  function allowedChunk(chunk, options) {
    if(options.types&&!options.types.includes(chunk.source_type))return false;
    if(!matchesStylePlatform(chunk,options.platform))return false;
    // Facts always require one explicitly selected product; semantic similarity cannot select it.
    if(chunk.supports_product_fact&&(!options.productId||chunk.product_id!==options.productId))return false;
    if(options.productId){
      if(chunk.product_ids.length&&(chunk.product_ids.length!==1||chunk.product_ids[0]!==options.productId))return false;
      if(chunk.mentioned_product_ids.some(id=>id!==options.productId))return false;
      const selected=corpus.catalog.products.find(p=>p.id===options.productId);
      if(chunk.system&&selected?.system!==chunk.system)return false;
    }
    return true;
  }
  async function search(query,{productId,types,limit=6,mode='hybrid',platform,diversifyTypes=false}={}) {
    if(typeof query!=='string'||!query.trim()||query.length>12000)throw Error('检索问题不能为空且不得超过 12000 字。');
    if(!MODES.includes(mode))throw Error('检索模式必须为 hybrid、lexical 或 vector。');
    if(types&&(!Array.isArray(types)||types.some(x=>!SOURCE_TYPES.includes(x))))throw Error('检索资料类型无效。');
    if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('检索数量必须为 1–30。');
    await ensureCorpus();
    if(productId&&!corpus.catalog.products.some(p=>p.id===productId))throw Error('检索型号不在资料目录中。');
    const allow=chunk=>allowedChunk(chunk,{productId,types,platform});
    // Keep matching minority types available even when style dominates the top 60.
    const candidateLimit=diversifyTypes?corpus.chunks.length:Math.max(60,limit*5);
    const lexicalHits=lexicalRanking(lexical,query,allow,candidateLimit);
    let vectorHits=[],actualMode=mode,warnings=[];
    if(mode!=='lexical'){
      await loadVectors();
      if(!vectors){actualMode='lexical_fallback';warnings.push(indexWarning||'向量索引不可用，本次仅使用词法检索。');}
      else {
        try{
          const queryRows=await provider.embed([query]);
          if(!Array.isArray(queryRows)||queryRows.length!==1)throw Error('查询 embedding 返回数量无效。');
          vectorHits=corpus.chunks.flatMap((chunk,i)=>allow(chunk)?[{chunk,score:cosine(queryRows[0],vectors[i])}]:[])
            .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.chunk.id.localeCompare(b.chunk.id)).slice(0,candidateLimit);
        }catch(error){actualMode='lexical_fallback';warnings.push(`查询向量不可用，本次仅使用词法检索：${safeReason(error)}`);}
      }
    }
    const fused=new Map();
    function add(hits,type){hits.forEach((hit,i)=>{
      const result=fused.get(hit.chunk.id)||{...hit.chunk,ranks:{lexical:null,vector:null},scores:{lexical:null,vector:null,rrf:0},matched_terms:[]};
      result.ranks[type]=i+1;result.scores[type]=hit.score;result.scores.rrf+=1/(60+i+1);
      if(type==='lexical')result.matched_terms=hit.matched_terms;
      fused.set(hit.chunk.id,result);
    });}
    if(actualMode!=='vector')add(lexicalHits,'lexical');
    if(actualMode==='hybrid'||actualMode==='vector')add(vectorHits,'vector');
    const ranked=[...fused.values()].sort((a,b)=>b.scores.rrf-a.scores.rrf||a.id.localeCompare(b.id));
    // A single document should not occupy the whole evidence budget with neighboring chunks.
    const perSource=new Map(),results=[],selectedIds=new Set();
    function select(item){
      if(results.length>=limit||selectedIds.has(item.id))return;
      const count=perSource.get(item.source_path)||0;if(count>=2)return;
      perSource.set(item.source_path,count+1);
      selectedIds.add(item.id);
      const {embedding_text,...result}=item;
      results.push({...result,retrieval_mode:actualMode,explanation:`${result.ranks.lexical?`词法第 ${result.ranks.lexical} 名`:''}${result.ranks.lexical&&result.ranks.vector?'；':''}${result.ranks.vector?`语义第 ${result.ranks.vector} 名`:''}；${result.usage}`});
    }
    if(diversifyTypes){
      for(const type of [...new Set(types||SOURCE_TYPES)]){
        const candidate=ranked.find(item=>item.source_type===type&&(perSource.get(item.source_path)||0)<2);
        if(candidate)select(candidate);
      }
    }
    for(const item of ranked){select(item);if(results.length>=limit)break;}
    return {results,mode:actualMode,requested_mode:mode,warnings,stats:{documents:corpus.documentCount,chunks:corpus.chunks.length,eligible_chunks:corpus.chunks.filter(allow).length,lexical_candidates:lexicalHits.length,vector_candidates:vectorHits.length,returned:results.length,model:mode==='lexical'?null:state.model}};
  }
  async function build({mode='hybrid',batchSize=16,onProgress=()=>{}}={}) {
    if(buildPromise)return buildPromise;
    buildPromise=(async()=>{
      if(!MODES.includes(mode))throw Error('检索模式无效。');
      if(!Number.isInteger(batchSize)||batchSize<1||batchSize>64)throw Error('batchSize 必须为 1–64。');
      await ensureCorpus();
      if(mode==='lexical'){await loadVectors();return {...state,mode:'lexical'};}
      await loadVectors();if(vectors)return {...state,mode:'hybrid',reused:true};
      await fs.mkdir(cacheDir,{recursive:true});
      const lockPath=path.join(cacheDir,'build.lock');
      let lock;
      try{lock=await fs.open(lockPath,'wx');await lock.writeFile(String(process.pid));}catch(error){if(error.code==='EEXIST')throw Error('已有检索索引构建任务；若任务已退出，请删除 output/search-cache/build.lock 后重试。');throw error;}
      try{
        const partialFile=path.join(cacheDir,'vectors.partial.bin'),partialMeta=path.join(cacheDir,'vectors.partial.json');
        let count=0,dimensions=0;
        try{const m=await jsonRead(partialMeta),stat=await fs.stat(partialFile);if(validMetadata(m)&&Number.isInteger(m.count)&&m.count>=0&&m.count<=corpus.chunks.length&&stat.size===m.count*m.dimensions*4){count=m.count;dimensions=m.dimensions;}}catch{}
        if(!count)await fs.writeFile(partialFile,Buffer.alloc(0));
        state={...state,state:'building',vector_count:count};
        onProgress({completed:count,total:corpus.chunks.length,model:state.model});
        for(let offset=count;offset<corpus.chunks.length;offset+=batchSize){
          const texts=corpus.chunks.slice(offset,offset+batchSize).map(c=>c.embedding_text);
          const rows=await provider.embed(texts);
          if(!Array.isArray(rows)||rows.length!==texts.length)throw Error('Embedding 返回数量不一致，停止构建。');
          dimensions=dimensions||rows[0]?.length;
          if(!Number.isInteger(dimensions)||dimensions<1||dimensions>8192)throw Error('Embedding 维度无效。');
          await fs.appendFile(partialFile,vectorBytes(rows,dimensions));count=offset+rows.length;
          await atomicJson(partialMeta,{version:INDEX_VERSION,corpus_fingerprint:corpus.fingerprint,embedding_id:modelId,dimensions,count});
          state={...state,vector_count:count,dimensions};onProgress({completed:count,total:corpus.chunks.length,model:state.model});
        }
        const bytes=await fs.readFile(partialFile),digest=sha256(bytes),file=`vectors-${digest}.bin`,built_at=new Date().toISOString();
        await fs.copyFile(partialFile,path.join(cacheDir,file));
        await atomicJson(path.join(cacheDir,'index.json'),{version:INDEX_VERSION,corpus_fingerprint:corpus.fingerprint,embedding_id:modelId,dimensions,count,file,sha256:digest,built_at});
        vectors=readVectors(bytes,dimensions,count);indexWarning='';
        indexStamp=fileStamp(await fs.stat(path.join(cacheDir,'index.json'),{bigint:true}));
        vectorFile=path.join(cacheDir,file);vectorStamp=fileStamp(await fs.stat(vectorFile,{bigint:true}));
        state={...state,state:'hybrid_ready',vector_ready:true,vector_count:count,dimensions,built_at};
        return {...state,mode:'hybrid',reused:false};
      }catch(error){state={...state,state:'build_failed',vector_ready:false,last_error:safeReason(error)};throw error;}
      finally{await lock.close();await fs.unlink(lockPath).catch(()=>{});}
    })().finally(()=>{buildPromise=null;});
    return buildPromise;
  }
  return {search,status:()=>structuredClone(state),build};
}
