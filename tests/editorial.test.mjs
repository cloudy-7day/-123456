import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCopyQuality} from '../src/editorial.mjs';
const check=(body,title='会议记录',call_to_action='带一份脱敏表格，到店试试数字输入。')=>checkCopyQuality({input:{platform:'朋友圈',product:'MateBook D 16'},output:{content:{title,body,call_to_action}}});
test('detects a repaired sentence that embeds its unchanged neighbour',()=>{
 const s='这台电脑配有独立数字键盘，记录会议预算时可以集中输入数字。';
 assert(check('会中，'+s+s).issues.some(x=>x.includes('重复')));
});
test('moments requires one benefit across title, body and invitation, with no spec dump',()=>{
 const r=check('会前翻阅方案，用大屏对照材料。会中录入预算，用独立数字键盘输入。');
 assert(r.issues.some(x=>x.includes('一个核心卖点')));
 assert(check('这台电脑配备16英寸屏幕。','大屏看方案','带资料来咨询。').issues.some(x=>x.includes('参数')));
});
test('one task and one keyboard benefit can pass without inventing conditions',()=>{
 const r=check('会议上刚确认完一笔预算，下一项数字又来了。把讨论中的金额留在同一份记录里，后续再按项目归档。MateBook D 16 配有独立数字键盘，录入这些数字时，手指就集中在右侧这一小块区域。','预算别散在便签里');
 assert.deepEqual(r.issues,[]);
});
test('copy cannot slip capability disclaimers back into the story',()=>{
 assert(check('这些动作还是你自己做，归类还是要你自己一步步做。').issues.some(x=>x.includes('说明')));
});
test('a body question must not repeat in the separate invitation',()=>{
 const question='你在项目会议后最想先整理哪一份材料？';
 assert(check(question,'开会',question+'评论区聊聊。').issues.some(x=>x.includes('重复')));
});
