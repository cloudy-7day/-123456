export async function api(path,body,signal){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'请求失败，请重试。');return result;
}
// Saved results may predate the copy-only contract. Never re-export retired deliverables.
function resultExportReplacer(key,value){
 if(key!=='output'||!value||typeof value!=='object')return value;
 const {sales_plan,follow_up,strategy,...currentOutput}=value;
 return currentOutput;
}
export function downloadJson(data,filename){const url=URL.createObjectURL(new Blob([JSON.stringify(data,resultExportReplacer,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=filename||`scenario-${data.analysisId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function downloadText(text,filename='小红书文案.txt'){
 const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
