import fs from 'node:fs';

// Offline, SHA-bound image fingerprints. No model calls or functional evidence.
let defaultIndex={assets:{}};
try { defaultIndex=JSON.parse(fs.readFileSync(new URL('../knowledge/image-diversity.json',import.meta.url),'utf8')); } catch {}
const angleRules=[
  ['keyboard',/键盘|触控板|俯视/], ['side',/侧面|双侧|接口/],
  ['back',/A面|背面|顶盖/], ['front',/正面/],
  ['open',/开合/], ['pen-scene',/手写|创作场景/],
  ['collaboration-scene',/协同|互联|超级终端|多屏/],
  ['screen',/屏幕|柔光屏|护眼屏|全面屏|OLED/i],
  ['color-overview',/配色|颜色/], ['hero',/主视觉|\bKV\b/i],
];
export function imageDiversityMetadata(asset,reviewIndex=defaultIndex){
  const indexed=reviewIndex?.assets?.[asset.sha256];
  const visual=asset.visual_review?.sha256===asset.sha256?asset.visual_review:null;
  const text=`${asset.title||''} ${asset.description||''}`;
  return {angle_group:visual?.angle_group||indexed?.angle_group||angleRules.find(([,rule])=>rule.test(text))?.[0]||null,
    review_basis:indexed?'offline-fingerprint-and-index':'index-description-only',
    dhash:indexed?.dhash||null,ahash:indexed?.ahash||null};
}
function distance(a,b){
  if(!/^[a-f0-9]{16}$/i.test(a||'')||!/^[a-f0-9]{16}$/i.test(b||''))return Infinity;
  let bits=BigInt(`0x${a}`)^BigInt(`0x${b}`),count=0;
  while(bits){bits&=bits-1n;count++;}return count;
}
export function selectDiverseImages(images,{productPath,minimum=3,limit=6,reviewIndex=defaultIndex}={}){
  const selected=[],rejected=[],identities=new Set();
  for(const image of images){
    let reason=null;
    const identity=image.sha256||image.file||image.path||image.ref;
    const meta=imageDiversityMetadata(image,reviewIndex);
    if(image.visual_review&&(image.visual_review.sha256!==image.sha256||!image.visual_review.allowed))reason='visual-content-not-approved';
    else if(productPath&&!image.path?.startsWith(productPath+'/'))reason='wrong-product';
    else if(identity&&identities.has(identity))reason='exact-duplicate';
    else if(selected.some(x=>distance(meta.dhash,x.meta.dhash)<=4&&distance(meta.ahash,x.meta.ahash)<=4))reason='visual-near-duplicate';
    else if(meta.angle_group&&selected.some(x=>x.meta.angle_group===meta.angle_group))reason='same-angle';
    else if(selected.length>=limit)reason='limit';
    if(reason)rejected.push({image,reason});
    else {selected.push({image,meta});if(identity)identities.add(identity);}
  }
  const missing=Math.max(0,minimum-selected.length);
  const warnings=missing?[`不同画面配图仍缺${missing}张，请补充所选完整型号原图；不使用重复角度凑数。`]:[];
  if(selected.some(x=>!x.meta.angle_group))warnings.push('部分图片索引未说明角度，离线指纹仅筛查近似重复，不能保证所有画面角度均不同。');
  return {images:selected.map(x=>x.image),rejected,missing,warnings};
}
export function reviewImagePlan(plan,sources,options={}){
  const images=sources.filter(x=>x.kind==='image');
  const byRef=new Map(images.map(x=>[x.ref,x]));
  const requested=plan.map(x=>byRef.get(x.source_ref)).filter(Boolean);
  const minimum=options.minimum??3;
  const result=selectDiverseImages([...requested,...images.filter(x=>!requested.includes(x))],{...options,limit:Math.max(minimum,plan.length)});
  const original=new Map(plan.map(x=>[x.source_ref,x]));
  return {...result,image_plan:result.images.map(x=>original.get(x.ref)||{source_ref:x.ref,position:'正文配图',caption:'产品外观图'})};
}
