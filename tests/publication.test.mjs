import {test} from 'node:test';import assert from 'node:assert/strict';
import {publicationBlocks,publicationHtml} from '../modules/scenario/shared/publication.mjs';
const result={input:{product:'测试型号'},output:{content:{title:'<script>alert(1)</script>',body:'第一段\n\n第二段',call_to_action:'hello'},image_plan:[{source_ref:'I1',position:'正文第二段之后',caption:'<img onerror="alert(1)">'},{source_ref:'I2',position:'封面',caption:'封面'}],pending_confirmation:[],source_refs:['I1','I2']},sources:[],checks:{},delivery:{status:'draft'}};
test('publication keeps Chinese paragraph position and cover before first paragraph',()=>{const blocks=publicationBlocks(result.output);assert.equal(blocks[1].images[0].source_ref,'I1');assert.equal(blocks[0].beforeImages[0].source_ref,'I2');});
test('HTML export escapes model text and rejects script or remote image sources',()=>{const html=publicationHtml(result,{I1:'javascript:alert(1)',I2:'https://untrusted.example/pixel.png'});assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('src="javascript:'));assert(!html.includes('src="https:'));assert(!html.includes('<img onerror='));assert(html.indexOf('封面')<html.indexOf('<p>第一段'))});
test('blocked draft cannot be exported',()=>assert.throws(()=>publicationHtml({...result,delivery:{status:'blocked'}}),/不能导出/));
test('single-line scene paragraphs keep repaired fact continuations with the intended image',()=>{
 const output={...result.output,content:{...result.output.content,body:'教室读文档。\n📚 图书馆写作业。全尺寸键盘[S1]\n触控板支持五点触控[S1]\n🎒 回宿舍继续改。'},image_plan:[{source_ref:'I3',position:'正文第三段之后',caption:'侧面外观'}]};
 const blocks=publicationBlocks(output);assert.equal(blocks.length,3);assert(blocks[1].text.includes('触控板'));assert.equal(blocks[2].images[0].source_ref,'I3');
});

test('publishable text removes citation markers without changing internal output', async()=>{
 const {publicationCopy,publicationCards}=await import('../modules/scenario/shared/publication.mjs');
 const output={...result.output,content:{title:'通勤选电脑[S1]',body:'机身参数[I1,S2]。\n\n具体条件见资料[S2]。',call_to_action:'说说你的需求'},marketing_package:{cover_title:'通勤选电脑[S1]',cover_subtitle:'先看自己的需求',cards:[{heading:'先理清需求',body:'按自己的情况选择[S1]。'},{heading:'看使用条件',body:'列出日常软件。'},{heading:'再做选择',body:'确认配置。'}],consultation_replies:[]}};
 const clean=publicationCopy(output);assert(!/\[[SI]\d/.test(clean));assert(output.content.title.includes('[S1]'));
 const cards=publicationCards({...result,output});assert.equal(cards.length,4);assert.equal(cards[0].heading,'通勤选电脑');assert.equal(publicationCards({...result,output,delivery:{status:'blocked'}}).length,0);
 const html=publicationHtml({...result,output}, {},['javascript:alert(1)']);assert(!html.includes('src="javascript:'));assert(!html.includes('[S1]'));
});
test('ZIP export preserves UTF-8 names and complete body bytes',async()=>{
 const {zipFiles}=await import('../modules/scenario/shared/zip.mjs');
 const bytes=new Uint8Array(await zipFiles([{name:'正文.txt',data:'通勤：先确认需求'}]).arrayBuffer());
 const view=new DataView(bytes.buffer);assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x800);
 const n=view.getUint16(26,true),size=view.getUint32(18,true);assert.equal(new TextDecoder().decode(bytes.slice(30,30+n)),'正文.txt');assert.equal(new TextDecoder().decode(bytes.slice(30+n,30+n+size)),'通勤：先确认需求');assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
});
