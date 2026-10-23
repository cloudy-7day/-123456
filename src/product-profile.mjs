// Features describe verified source excerpts, not compatibility or purchase advice.
const qualifier='配置可能因销售版本而异，以实际销售版本为准。';
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
 if(/(?:支持.*)?独立数字(?:小)?键盘/.test(keyboard))add('numpad','独立数字键盘',excerpt(keyboard,/独立数字(?:小)?键盘/));
 if(/支持\s*\d+\s*点触控/.test(screen))add('touch','屏幕触控',excerpt(screen,/支持\s*\d+\s*点触控/));
 if(/OLED/i.test(screen))add('oled','OLED 屏幕',excerpt(screen,/OLED/i));
 const pen=excerpt(keyboard,/M-?PEN|手写笔/i)||excerpt(section('包装清单'),/M-?PEN|手写笔/i);
 if(pen)add('pen','手写笔相关支持',pen);
 if(/隐私开关/.test(ports))add('privacy','隐私开关',excerpt(ports,/隐私开关|防窥功能/));
 if(foldable)add('foldable','折叠屏形态',excerpt(screen,/展开态|折叠态/));
 return features;
}
