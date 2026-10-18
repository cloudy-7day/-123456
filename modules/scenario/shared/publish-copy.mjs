// Presentation only: retain the original output and source references for verification.
export function cleanReferences(value=''){
 return String(value).replace(/\[\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*\]|【\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*】|［\s*[SI]\d+(?:\s*[,，、;；]\s*[SI]\d+)*\s*］/gi,'').replace(/[ \t]+\n/g,'\n').trim();
}
export function plainCopy(value=''){
 return cleanReferences(value).replace(/^\s*#{1,6}\s+/gm,'').replace(/\*\*([^*\n]+)\*\*/g,'$1');
}
export function publishText(content={}){
 return [content.title,content.body,content.call_to_action].map(plainCopy).filter(Boolean).join('\n\n');
}
export function copyBlocks(body=''){
 const blocks=[];
 for(const paragraph of cleanReferences(body).split(/\n\s*\n/).filter(Boolean)){
  const lines=paragraph.split('\n'),topics=[];
  while(lines.length&&/^(?:#[^\s#]+\s*)+$/.test(lines.at(-1).trim()))topics.unshift(...lines.pop().trim().split(/\s+/));
  if(lines.length){
   const first=lines[0].trim();
   const heading=/^#{1,6}\s+/.test(first)||/^\*\*[^*\n]+\*\*$/.test(first)||(first.length<=80&&/^\p{Extended_Pictographic}/u.test(first));
   blocks.push(heading?{type:'scene',heading:plainCopy(lines.shift()),text:lines.join('\n').trim()}:{type:'paragraph',text:lines.join('\n').trim()});
  }
  if(topics.length)blocks.push({type:'topics',tags:topics});
 }
 return blocks;
}
