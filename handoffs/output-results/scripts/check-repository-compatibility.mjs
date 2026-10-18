import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {validate} from '../../../src/pipeline.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const schema=read('contracts/output.schema.json');
const rows=[];
for(const c of read('examples/cases.json')){
  let error=null;
  try { validate(read('examples/'+c.output),schema,'output'); }
  catch(e){error=e.message;}
  const rejected=['conflicting-facts','no-sources-diagnostic'].includes(c.case_id);
  assert.equal(Boolean(error),rejected,c.case_id);
  if(rejected)assert.match(error,/content\.title/);
  rows.push({case:c.case_id,result:error?'rejected':'accepted',error});
}
const report={scope:'使用原仓库validate函数和本包schema检查静态样例；没有真实模型调用。异常样例被拒绝是记录到的兼容性差异，不是已完成异常页面支持。',cases:rows,result:'EXPECTED_RESULTS_CONFIRMED'};
fs.writeFileSync(path.join(root,'repository-compatibility-report.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report,null,2));
