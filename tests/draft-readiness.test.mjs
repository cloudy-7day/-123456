import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveGate,validateUnderstanding} from '../modules/scenario/shared/contract.mjs';
import {buildHandoff} from '../src/handoff.mjs';
const sources=[{id:'scenario',type:'scenario',text:'我要写代码、学一点AI，课程软件和本地算力还不清楚。'}];
const raw={observations:[{id:'task',category:'task',kind:'fact',value:'我要写代码',evidence:[{sourceId:'scenario',quote:'我要写代码'}],rationale:'原话',critical:false},{id:'software',category:'software',kind:'unknown',value:null,evidence:[],rationale:'未提供',critical:true}],questions:[{id:'q',topic:'software',question:'课程软件是什么？',why:'到店检查',priority:'blocking',evidence:[]}],conflicts:[],product:{status:'unspecified',name:null,evidence:[]}};
test('unknown software permits a bounded draft, preserving uncertainty rather than fabricating answers',()=>{
 const understanding=validateUnderstanding(raw,sources),gate=deriveGate(understanding,{reviewed:true});
 assert.equal(gate.status,'ready_for_ima');assert(gate.warnings.some(x=>x.includes('软件')));assert.equal(gate.productFactsVerified,false);
 const analysis={analysisId:'00000000-0000-4000-8000-000000000001',input:{sources},understanding,review:{status:'confirmed'},gate};
 const handoff=buildHandoff(analysis,{analysisId:analysis.analysisId,product:'测试候选产品',productConfirmed:true,platforms:['小红书']});
 assert.equal(handoff.customer_context.understanding.observations.find(x=>x.id==='software').value,null);
 assert(handoff.customer_context.draft_limitations.some(x=>x.includes('软件')));
 const automatic=buildHandoff(analysis,{analysisId:analysis.analysisId,product:'测试候选产品',productConfirmed:true,productOrigin:'system_candidate',platforms:['小红书']});
 assert.equal(automatic.customer_context.product_selection.origin,'system_candidate');
 assert.equal(automatic.customer_context.product_selection.confirmed,false);
 assert.equal(automatic.customer_context.product_selection.approved_for_draft,true);
});
test('unreviewed and conflicting source statements remain blocked',()=>{
 assert.equal(deriveGate(raw).status,'paused');
 assert.equal(deriveGate({...raw,conflicts:[{resolutionQuestion:'预算以哪条为准？'}]},{reviewed:true}).status,'paused');
});
