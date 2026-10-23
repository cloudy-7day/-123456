// Presentation only: retain the original output and source references for verification.
export function cleanReferences(value=''){
 return String(value).replace(/\[\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*\]|【\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*】|［\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*］/gi,'').replace(/[ \t]+\n/g,'\n').trim();
}
export function plainCopy(value=''){
 return cleanReferences(value).replace(/^\s*#{1,6}\s+/gm,'').replace(/\*\*([^*\n]+)\*\*/g,'$1');
}
export function publishText(content={}){
 const c=publicationContent(content);
 return [c.title,c.body,c.call_to_action].map(plainCopy).filter(Boolean).join('\n\n');
}
// Presentation only, like hidden citations: consolidate existing topic labels.
// No claim or narrative sentence is rewritten, and audit output stays intact.
export function publicationContent(content={}){
 const body=cleanReferences(content.body),cta=cleanReferences(content.call_to_action);
 const tags=[...new Set((body+'\n'+cta).match(/#[^\s#]+/g)||[])].slice(0,4);
 if(!tags.length)return {...content};
 const strip=s=>s.replace(/#[^\s#]+/g,'').trim();
 return {...content,body:strip(body)+'\n\n'+tags.join(' '),call_to_action:strip(cta)};
}
export function copyBlocks(body=''){
 const blocks=[];
 for(const paragraph of cleanReferences(body).split(/\n\s*\n/).filter(Boolean)){
  const lines=paragraph.split('\n'),topics=[];
  while(lines.length&&/^(?:#[^\s#]+\s*)+$/.test(lines.at(-1).trim()))topics.unshift(...lines.pop().trim().split(/\s+/));
  if(lines.length){
   const first=lines[0].trim();
   const shortScene=first.match(/^(\p{Extended_Pictographic}[^，。！？：\n]{0,22})[，。：](.+)$/u);
   if(first.length>80&&shortScene){
    blocks.push({type:'scene',heading:plainCopy(shortScene[1]),text:[shortScene[2],...lines.slice(1)].join('\n').trim()});
   }else{
   const heading=/^#{1,6}\s+/.test(first)||/^\*\*[^*\n]+\*\*$/.test(first)||(first.length<=80&&/^\p{Extended_Pictographic}/u.test(first));
   blocks.push(heading?{type:'scene',heading:plainCopy(lines.shift()),text:lines.join('\n').trim()}:{type:'paragraph',text:lines.join('\n').trim()});
   }
  }
  if(topics.length)blocks.push({type:'topics',tags:topics});
 }
 return blocks;
}

// Layout only. Never invent an image, alter a verified caption, or attach one twice.
export function publicationBlocks(body='',plan=[],sources=[]){
 const blocks=copyBlocks(body),seen=new Set();
 const images=plan.flatMap(item=>{
  const source=sources.find(s=>s.kind==='image'&&s.ref===item.source_ref);
  if(!source?.local_path||seen.has(source.local_path))return [];
  seen.add(source.local_path);return [{type:'image',item,source}];
 });
 const slots=blocks.map((b,i)=>b.type!=='topics'?i:-1).filter(i=>i>=0);
 if(!slots.length)return [...images,...blocks];
 const after=new Map();
 images.forEach((image,i)=>{
  const slot=slots[Math.min(slots.length-1,Math.floor(i*slots.length/Math.max(1,images.length)))];
  after.set(slot,[...(after.get(slot)||[]),image]);
 });
 return blocks.flatMap((block,i)=>[block,...(after.get(i)||[])]);
}
