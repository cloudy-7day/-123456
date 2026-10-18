import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';

export async function readEvidenceSnapshot(file, kbName) {
  const snapshot=JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,''));
  if(!snapshot.input?.product || !snapshot.meta?.created_at || !Array.isArray(snapshot.sources)) throw Error('缓存必须是此前保存的完整运行结果。');
  if(kbName && snapshot.meta.knowledge_base!==kbName) throw Error('缓存知识库与当前指定知识库不一致。');
  if(!snapshot.sources.some(s=>s.kind==='text'&&s.text?.trim())) throw Error('缓存没有可读产品原文。');
  const sourceTime=snapshot.meta.retrieval?.source_created_at || snapshot.meta.created_at;
  if(!Number.isFinite(Date.parse(sourceTime))) throw Error('缓存原始资料日期无效。');
  snapshot.meta.retrieval={mode:'cached',source_created_at:sourceTime};
  return snapshot;
}

export async function retrieveEvidence(ima, input, settings, progress) {
  if(!settings.evidenceCacheFile){
    const evidence=await ima.retrieve(input,progress);
    return {...evidence,retrieval:{mode:'live',source_created_at:new Date().toISOString()}};
  }
  const snapshot=await readEvidenceSnapshot(settings.evidenceCacheFile,settings.kbName);
  if(snapshot.input.product!==input.product) throw Error('缓存型号与选择的完整型号不一致；请使用实时检索或对应型号的缓存。');
  const sourceTime=snapshot.meta.retrieval.source_created_at;
  const warning=`本次使用此前真实检索保存的缓存资料（${sourceTime}），未执行新的 ima 检索。`;
  progress(warning);
  const sources=[];
  for(const source of snapshot.sources){
    const {ref,kind,title,path:sourcePath,text,truncated}=source;
    const clean={ref,kind,title,path:sourcePath,...(kind==='text'?{text,truncated}:{})};
    if(kind==='image'){
      if(!/^output\/media\/[a-f0-9-]{36}\.(png|jpg|webp)$/.test(source.local_path||'')) throw Error('缓存图片路径不受支持。');
      const bytes=await fs.readFile(path.join(path.dirname(settings.evidenceCacheFile),'media',path.basename(source.local_path)));
      const name=randomUUID()+path.extname(source.local_path);
      await fs.mkdir(path.join(ROOT,'output/media'),{recursive:true});
      await fs.writeFile(path.join(ROOT,'output/media',name),bytes);
      clean.local_path='output/media/'+name;
    }
    sources.push(clean);
  }
  return {knowledgeBase:snapshot.meta.knowledge_base,sources,warnings:[warning],retrieval:{mode:'cached',source_created_at:sourceTime}};
}
