const noDiagnostics={record:async()=>{},list:async()=>[]};
import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenarioService} from '../src/scenario-service.mjs';
test('local examples endpoint returns stored completed examples without model calls',async()=>{
 const examples=[{id:'student',label:'学生学习',result:{complete:true,results:[]}}];let response;
 const service=createScenarioService({}, {diagnostics:noDiagnostics,loadExamples:async()=>examples});
 const handled=await service({method:'GET'}, {}, '/api/scenario-examples',(status,data)=>{response={status,data};});
 assert.equal(handled,true);assert.deepEqual(response,{status:200,data:{examples}});
});
