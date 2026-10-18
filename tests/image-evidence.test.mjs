import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekClient } from '../src/deepseek.mjs';

test('generation receives image index metadata without local runtime paths',async()=>{
  let request;
  const client=new DeepSeekClient({baseUrl:'http://localhost:1234',model:'test',fetchImpl:async(url,options)=>{
    request=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})};
  }});
  await client.generate({input:{},sources:[{ref:'I1',kind:'image',title:'键盘',description:'舒适键盘细节',index_path:'产品/图片索引.md',width:800,height:600,local_path:'private-runtime-path'}],system:'rules',outputSchema:{}});
  const image=JSON.parse(request.messages[1].content).evidence[0];
  assert.equal(image.description,'舒适键盘细节');
  assert.equal(image.index_path,'产品/图片索引.md');
  assert.equal(image.width,800);
  assert.equal(image.local_path,undefined);
});
