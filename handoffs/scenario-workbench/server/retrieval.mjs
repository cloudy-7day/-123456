// Match identities established by the local product document, never fuzzy model names.
export const normalizeProduct=value=>String(value||'').normalize('NFKC').replace(/HUAWEI|华为/ig,'').replace(/\s/g,'').toLowerCase();
export function productIdentity(product,text){
 const title=text.match(/^#\s+(.+?)\s*[-—]\s*产品事实\s*$/m)?.[1]?.trim();
 const sourceUrl=text.match(/^- 产品页：\s*(https:\/\/\S+)/m)?.[1];
 return {...product,canonicalName:title||product.name,sourceUrl,aliases:[...new Set([product.name,title].filter(Boolean))]};
}
export function resolveProduct(products,name){
 const matches=products.filter(p=>p.aliases.some(a=>normalizeProduct(a)===normalizeProduct(name)));
 return matches.length===1?matches[0]:null;
}
export function retrieveImages(product){
 const seen=new Set();
 const eligible=product.images.filter(image=>normalizeProduct(image.product)===normalizeProduct(product.canonicalName)&&image.sourceUrl===product.sourceUrl&&image.width>0&&image.height>0);
 const score=i=>Math.min(i.width*i.height/1000000,2)+(/主视觉|外观|配色|颜色|KV|key-vision/i.test(i.caption+' '+i.originalUrl)?5:0)-(/手写笔|配件|键盘|处理器|超级终端|屏幕 UX/.test(i.caption)?3:0);
 const selected=eligible.sort((a,b)=>score(b)-score(a)).filter(i=>{const key=i.sha256||i.id;if(seen.has(key))return false;seen.add(key);return true;}).slice(0,3);
 return {selected,trace:{requestedDirectory:product.name,resolvedProduct:product.canonicalName,matchBasis:'产品事实标题 + 图片索引型号 + 相同产品页',sourceUrl:product.sourceUrl,candidateCount:product.images.length,matchedCount:eligible.length,selectedCount:selected.length,missingReason:selected.length?'':'该型号没有同时通过型号与来源核对的本地图片，请补充素材。'}};
}
