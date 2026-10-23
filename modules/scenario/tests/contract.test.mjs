import test from 'node:test';import assert from 'node:assert/strict';
import {validateUnderstanding,deriveGate,inputSchema} from '../shared/contract.mjs';
import {confirmAnalysis} from '../server/review.mjs';
import {understand} from '../server/understand.mjs';
const sources=[{id:'scenario',type:'scenario',text:'我要写代码。预算还没定。软件还不知道。'}];
function fixture(){return {observations:[{id:'o1',category:'task',kind:'fact',value:'我要写代码',evidence:[{sourceId:'scenario',quote:'我要写代码'}],rationale:'明确陈述',critical:false},{id:'o2',category:'software',kind:'unknown',value:null,evidence:[{sourceId:'scenario',quote:'软件还不知道'}],rationale:'关键软件缺失',critical:true}],questions:[{id:'q1',topic:'software',question:'课程必须使用哪些软件？',why:'决定系统和安装环境核验范围',priority:'blocking',evidence:[]}],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};}
test('缺软件仍可写有限草稿，但预算未知不补事实',()=>{const d=validateUnderstanding(fixture(),sources);assert.equal(d.observations.find(o=>o.category==='budget').value,null);assert.equal(deriveGate(d,{reviewed:true}).status,'ready_for_ima');assert(deriveGate(d,{reviewed:true}).warnings.length>0);assert.equal(d.observations[0].evidence[0].start,0);});
test('拒绝未出现在输入的引用与凭空预算',()=>{const f=fixture();f.observations[0].evidence[0].quote='预算8000';assert.throws(()=>validateUnderstanding(f,sources),/原文|事实/);});
test('拒绝将推断改写成明确事实',()=>{const f=fixture();f.observations[0].value='必须买高性能电脑';assert.throws(()=>validateUnderstanding(f,sources),/逐字/);});
test('推断须有依据和理由，未知不能有值',()=>{const f=fixture();f.observations[0].kind='inference';f.observations[0].rationale='';assert.throws(()=>validateUnderstanding(f,sources));f.observations[0].kind='unknown';assert.throws(()=>validateUnderstanding(f,sources));});
test('指定产品必须源自输入，不能把现有设备当意向',()=>{const f=fixture();f.product={status:'specified',name:'MateBook 14',evidence:[]};assert.throws(()=>validateUnderstanding(f,sources),/产品/);});
test('冲突必须提供两侧证据，确认不解除冲突',()=>{const s=[{id:'scenario',type:'scenario',text:'预算4000。预算7000。'}];const f=fixture();f.observations=[{id:'o1',category:'budget',kind:'fact',value:'预算4000',evidence:[{sourceId:'scenario',quote:'预算4000'}],rationale:'原文',critical:false}];f.questions=[];f.conflicts=[{description:'预算冲突',evidence:[{sourceId:'scenario',quote:'预算4000'},{sourceId:'scenario',quote:'预算7000'}],resolutionQuestion:'预算以哪条为准？'}];assert.equal(deriveGate(validateUnderstanding(f,s),{reviewed:true}).status,'paused');});
test('用户修订保留模型原判并要求重新理解',()=>{const a={analysisId:'12345678-1234-4123-8123-123456789abc',understanding:validateUnderstanding(fixture(),sources)};const r=confirmAnalysis(a,{analysisId:a.analysisId,edits:[{id:'o1',value:'我只阅读文档'}]});assert.equal(r.understanding.observations[0].value,'我要写代码');assert.equal(r.review.edits[0].value,'我只阅读文档');assert.equal(r.gate.status,'paused');assert.equal(r.review.status,'revised_pending_analysis');});
test('无阻塞且人工确认才能进入 ima，永不宣称已核验',()=>{const f=fixture();f.observations=f.observations.slice(0,1);f.questions=[];const d=validateUnderstanding(f,sources);assert.equal(deriveGate(d).status,'paused');const g=deriveGate(d,{reviewed:true});assert.equal(g.status,'ready_for_ima');assert.equal(g.productFactsVerified,false);});
test('输入来源 ID 不允许重复',()=>assert.equal(inputSchema.safeParse({sources:[sources[0],sources[0]]}).success,false));
const config={apiKey:'test-only',endpoint:'https://api.deepseek.com/chat/completions',model:'deepseek-flash'};
const response=content=>({ok:true,json:async()=>({id:'mock-test',choices:[{finish_reason:'stop',message:{content}}]})});
test('模型结构错误仅重试一次，成功结果带调用记录',async()=>{let n=0;const r=await understand({sources},config,{fetchImpl:async()=>response(++n===1?'{}':JSON.stringify(fixture()))});assert.equal(n,2);assert.equal(r.call.attempts,2);});
test('反复无效输出明确失败，无硬编码回退',async()=>{await assert.rejects(understand({sources},config,{fetchImpl:async()=>response('{}')}),e=>e.code==='INVALID_MODEL_OUTPUT');});
test('认证失败不重试，不暴露上游响应',async()=>{let n=0;await assert.rejects(understand({sources},config,{fetchImpl:async()=>{n++;return {ok:false,status:401};}}),e=>e.code==='AUTH_ERROR'&&!e.message.includes('test-only'));assert.equal(n,1);});
test('输入提取以真实单一引文替代模型改写，不接纳错误概括也无需用户重试',async()=>{
 const raw=fixture();raw.observations[0].value='必须买高性能电脑';let n=0;
 const a=await understand({sources},config,{fetchImpl:async()=>{n++;return response(JSON.stringify(raw));}});
 assert.equal(n,1);assert.equal(a.understanding.observations[0].value,'我要写代码');
 assert(!JSON.stringify(a.understanding).includes('必须买高性能电脑'));
});
test('超时与主动取消有独立状态',async()=>{const fetchImpl=async(_,o)=>new Promise((_,reject)=>{o.signal.addEventListener('abort',()=>reject(new Error('abort')),{once:true});setTimeout(()=>reject(new Error('test fallback')),200);});await assert.rejects(understand({sources},config,{fetchImpl,timeoutMs:10}),e=>e.code==='TIMEOUT');const c=new AbortController();setTimeout(()=>c.abort(),10);await assert.rejects(understand({sources},config,{fetchImpl,signal:c.signal}),e=>e.code==='CANCELLED');});
