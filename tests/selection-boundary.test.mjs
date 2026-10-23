const noDiagnostics={record:async()=>{},list:async()=>[]};
import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApp} from '../server.mjs';
import {validateUnderstanding} from '../modules/scenario/shared/contract.mjs';
import {localCatalog} from '../src/local-knowledge.mjs';

const sources=[{id:'scenario',type:'scenario',text:'必须使用Windows。想了解MateBook 14酷睿Ultra。'}];
const raw=()=>({observations:[{id:'os',category:'os',kind:'fact',value:'必须使用Windows',evidence:[{sourceId:'scenario',quote:'必须使用Windows'}],rationale:'原话',critical:true}],questions:[],conflicts:[],product:{status:'specified',name:'MateBook 14酷睿Ultra',evidence:[{sourceId:'scenario',quote:'想了解MateBook 14酷睿Ultra'}]}});

test('specified product is reflected once in observations with original evidence',()=>{
 const data=validateUnderstanding(raw(),sources),products=data.observations.filter(o=>o.category==='product');
 assert.equal(products.length,1);assert.equal(products[0].kind,'fact');
 assert.equal(products[0].value,'想了解MateBook 14酷睿Ultra');
 assert.equal(sources[0].text.slice(products[0].evidence[0].start,products[0].evidence[0].end),products[0].value);
});

test('local handoff and generation reject manual system conflict before model call',async()=>{
 const catalog=await localCatalog(),windows=catalog.products.find(p=>p.system==='Windows'),harmony=catalog.products.find(p=>p.system==='HarmonyOS');
 const analysis={analysisId:'00000000-0000-4000-8000-000000000001',input:{sources},understanding:validateUnderstanding(raw(),sources),review:{status:'pending'}};
 let batches=0;
 const server=createApp({settings:{knowledgeSource:'local',baseUrl:'https://api.deepseek.com',port:0},scenarioDependencies:{diagnostics:noDiagnostics,analyze:async()=>structuredClone(analysis),batch:async()=>{batches++;throw Error('must not generate');}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 try{
  await post('/api/analyze',{});await post('/api/confirm',{analysisId:analysis.analysisId,edits:[]});
  const request={analysisId:analysis.analysisId,product:harmony.name,productOrigin:'salesperson_selection',productConfirmed:true,platforms:['小红书']};
  for(const route of ['/api/handoff','/api/run-scenario']){
   const response=await post(route,request);assert.equal(response.status,400,route);assert.match((await response.json()).error.message,/系统.*冲突/);
  }
  assert.equal(batches,0);
  assert.equal((await post('/api/handoff',{...request,product:windows.name})).status,200);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
