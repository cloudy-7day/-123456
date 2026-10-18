export async function api(path,body,signal){
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 const result=await response.json();if(!response.ok)throw new Error(result.error?.message||'请求失败，请重试。');return result;
}
export function downloadJson(data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`scenario-${data.analysisId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
