import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createKnowledgeSearch} from '../src/retrieval/index.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),arg=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const search=createKnowledgeSearch({knowledgeDir:path.resolve(arg('--knowledge-dir',process.env.LOCAL_KNOWLEDGE_DIR||path.join(root,'knowledge'))),cacheDir:path.resolve(arg('--cache-dir',process.env.SEARCH_CACHE_DIR||path.join(root,'output','search-cache')))});
try{
 let last=-1;
 const result=await search.build({mode:args.includes('--lexical')?'lexical':'hybrid',batchSize:Number(arg('--batch-size','16')),onProgress:({completed,total,model})=>{
  const percent=Math.floor(completed/Math.max(total,1)*100);
  if(percent!==last){last=percent;process.stdout.write(JSON.stringify({event:'index_progress',completed,total,percent,model})+'\n');}
 }});
 process.stdout.write(JSON.stringify({event:'index_ready',...result})+'\n');
}catch(error){process.stderr.write(JSON.stringify({event:'index_error',message:error.message})+'\n');process.exitCode=1;}
