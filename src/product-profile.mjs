// Features describe verified source excerpts, not compatibility or purchase advice.
const qualifier='配置可能因销售版本而异，以实际销售版本为准。';
const sectionsOf = text => new Map([...String(text).matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map(m=>[m[1],m[2].trim()]));

// Retain the individual source values and their qualifiers; never average versions.
export function productProfile(text='',sourcePath=''){
 const sections=sectionsOf(text);
 const measure=(body,pattern,unit)=>{
  const values=[];
  for(const paragraph of body.split(/\r?\n\s*\r?\n/)){
   if(/^\*/.test(paragraph.trim()))continue; // explanatory repeats are not another configuration
   for(const match of paragraph.matchAll(pattern)){
    const raw=Number(match[1]);
    const value=unit==='kg'&&/^(g|克)$/i.test(match[2])?raw/1000:raw;
    if(!Number.isFinite(value)||value<=0)continue;
    values.push({value,unit,evidence:paragraph.trim(),source_path:sourcePath});
   }
  }
  const conditions=body.split(/\r?\n\s*\r?\n/).filter(p=>/^\*/.test(p.trim())||/不含键盘|裸机|平板|展开态|折叠态|闭合态|版本|配置/.test(p)).map(p=>p.trim());
  return {status:!values.length?'unknown':conditions.length||new Set(values.map(v=>v.value)).size>1?'conditional':'verified',values,
   min:values.length?Math.min(...values.map(v=>v.value)):null,max:values.length?Math.max(...values.map(v=>v.value)):null,conditions};
 };
 const dimensions=sections.get('尺寸与重量')||'',screen=sections.get('屏幕')||'';
 const weight=measure(dimensions,/(\d+(?:\.\d+)?)\s*(kg|g|公斤|千克|克)(?![a-z])/gi,'kg');
 weight.scope=/不含键盘|裸机|平板/.test(dimensions)?'partial_device':'device';
 const display=measure(screen,/(\d+(?:\.\d+)?)\s*(英寸|inch(?:es)?)/gi,'inch');
 display.scope=/展开态|折叠态|闭合态/.test(screen)?'multiple_states':'display';
 const constraints=String(text).split(/\r?\n\s*\r?\n/).filter(p=>/仅限|仅.*支持|不支持|需.*(?:设备|系统|版本|账号)|不含键盘|依配置|根据配置|因配置/.test(p)).map(evidence=>({evidence:evidence.trim(),source_path:sourcePath}));
 return {source_path:sourcePath,weight,screen:display,constraints};
}
export function productFeatures(text,sourcePath){
 const sourceModel=text.match(/^# (.+?)(?: - 产品事实)?\r?$/m)?.[1];
 const sections=new Map([...text.matchAll(/^## ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map(m=>[m[1],m[2].trim()]));
 const section=name=>sections.get(name)||'';
 const excerpt=(body,pattern)=>{
  const paragraphs=body.split(/\r?\n\s*\r?\n/);const selected=new Set();
  paragraphs.forEach((p,i)=>{if(pattern.test(p)){selected.add(i);for(let j=i+1;j<paragraphs.length&&/^\*/.test(paragraphs[j]);j++)selected.add(j);}});
  return [...selected].sort((a,b)=>a-b).map(i=>paragraphs[i]).join('\n');
 };
 const dimensions=section('尺寸与重量'),screen=section('屏幕'),keyboard=section('键盘和触控板'),ports=section('接口');
 const foldable=/展开态|折叠态|闭合态/.test(dimensions+' '+screen);
 const weights=[...dimensions.matchAll(/(\d+(?:\.\d+)?)\s*(kg|g)\b/gi)].map(m=>Number(m[1])*(m[2].toLowerCase()==='g'?0.001:1));
 const features=[];
 const add=(id,label,evidence)=>{if(evidence)features.push({id,label,evidence:`${sourceModel?`资料型号：${sourceModel}\n`:''}${evidence}\n${qualifier}`,source_path:sourcePath});};
 if(!foldable&&weights.length&&weights.every(w=>w>0&&w<=1.5)&&!/不含键盘|裸机|平板/.test(dimensions)&&/全尺寸.*键盘/.test(keyboard))add('portable','便于携带',excerpt(dimensions,/\b(?:kg|g)\b/i));
 if([...screen.matchAll(/(\d+(?:\.\d+)?)\s*英寸/g)].some(m=>Number(m[1])>=16))add('large_screen','大屏显示',excerpt(screen,/英寸/));
 if(/\d+(?:\.\d+)?\s*英寸/.test(screen))add('screen','屏幕尺寸',excerpt(screen,/英寸/));
 if(/全尺寸.*键盘/.test(keyboard))add('keyboard','全尺寸键盘',keyboard);
 if(/OLED/i.test(screen))add('oled','OLED 屏幕',excerpt(screen,/OLED/i));
 const pen=excerpt(keyboard,/M-?PEN|手写笔/i)||excerpt(section('包装清单'),/M-?PEN|手写笔/i);
 if(pen)add('pen','手写笔相关支持',pen);
 if(/隐私开关/.test(ports))add('privacy','隐私开关',excerpt(ports,/隐私开关|防窥功能/));
 if(foldable)add('foldable','折叠屏形态',excerpt(screen,/展开态|折叠态/));
 return features;
}
