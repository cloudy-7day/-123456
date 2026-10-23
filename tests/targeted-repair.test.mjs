import test from 'node:test';
import assert from 'node:assert/strict';
import {applyClaimRepairs} from '../src/targeted-repair.mjs';
import {reviewSegments} from '../src/claim-review.mjs';
const output=()=>({customer_insight:'摘要',strategy:'依据[S1]',content:{title:'校园汇报',body:'📚 图书馆\n屏幕支持触控[S1]。键盘保证久用不累[S1]。\n\n🏠 寝室\n你整理参考资料。',call_to_action:'你怎么整理？'},image_plan:[],source_refs:['S1'],pending_confirmation:['软件未知']});
test('targeted repair changes only the failed sentence while retaining paragraphs and supported claims',()=>{
 const draft=output(),segments=reviewSegments(draft),bad=segments.find(x=>x.text.includes('保证'));
 const revised=applyClaimRepairs(draft,{segments,issues:[bad.id+'：缺少效果证据']},{repairs:[{segment_id:bad.id,replacement:'键盘带有背光[S1]。'}]});
 assert.equal(revised.content.body,'📚 图书馆\n屏幕支持触控[S1]。键盘带有背光[S1]。\n\n🏠 寝室\n你整理参考资料。');
 assert.equal(revised.content.title,draft.content.title);assert.deepEqual(revised.pending_confirmation,draft.pending_confirmation);
 assert.match(draft.content.body,/保证/);
});
test('repair cannot edit an approved sentence, omit requested repairs or invent target ids',()=>{
 const draft=output(),segments=reviewSegments(draft),bad=segments.find(x=>x.text.includes('保证')),good=segments.find(x=>x.text.includes('支持'));
 const feedback={segments,issues:[bad.id+'：缺少效果证据']};
 for(const repairs of [[],[{segment_id:good.id,replacement:'修改'}],[{segment_id:'C999',replacement:'修改'}],[{segment_id:bad.id,replacement:''},{segment_id:bad.id,replacement:'重复'}]])assert.throws(()=>applyClaimRepairs(draft,feedback,{repairs}));
});
test('removing an unsupported sentence cannot remove the whole required title',()=>{
 const draft=output(),segments=reviewSegments(draft),title=segments[0];
 assert.throws(()=>applyClaimRepairs(draft,{segments,issues:[title.id+'：标题有问题']},{repairs:[{segment_id:title.id,replacement:''}]}),/标题/);
});

test('failed image descriptions become neutral labels instead of new unverified feature claims',()=>{
 const draft=output();draft.image_plan=[{source_ref:'I1',caption:'手写笔创作场景。',position:'第二段之后'},{source_ref:'I2',caption:'侧面外观。',position:'第三段之后'}];
 const segments=reviewSegments(draft),bad=segments.find(x=>x.location==='image_plan.0.caption');
 const revised=applyClaimRepairs(draft,{segments,issues:[bad.id+'：缺少适配证据']},{repairs:[{segment_id:bad.id,replacement:'支持任意手写笔。'}]});
 assert.equal(revised.image_plan[0].caption,'产品外观图');
 assert.equal(revised.image_plan[0].source_ref,'I1');
 assert.deepEqual(revised.image_plan[1],draft.image_plan[1]);
 assert.equal(revised.content.body,draft.content.body);
});
