import {plainCopy} from '../modules/scenario/shared/publish-copy.mjs';

// Editorial checks are additional gates; they never approve a factual claim.
export function checkCopyQuality({input,output}) {
 const c=output.content,body=plainCopy(c.body),title=plainCopy(c.title),cta=plainCopy(c.call_to_action);
 const all=[title,body,cta].join('\n'),issues=[];
 if(/还是(?:要)?你自己|只是你自己|动作.{0,8}由你自己完成|电脑负责把|具体哪些.{0,14}要看|具体怎么连|提前.{0,15}试一遍更稳妥|需要提醒的是|需要(?:先)?确认的是|到店核验|以实际体验为准|兼容性.{0,8}(?:核实|核对|确认)/.test(body))issues.push('Q：正文混入能力免责声明或核验说明。直接写人的任务动作，不写“还是你自己做”；普通待核对信息留在折叠区，正文保留真正限定功能范围的条件，不扩大承诺。');
 const clauses=(body+'\n'+cta).split(/[。！？!?；;\n]/).map(x=>x.replace(/\s/g,'')).filter(x=>x.length>=16);
 for(let i=0;i<clauses.length;i++)for(let j=0;j<i;j++){
  if(clauses[i].includes(clauses[j])||clauses[j].includes(clauses[i]))issues.push('Q：正文存在重复句或重复的长句片段，删除重复内容，不能把相邻句抄进修订句。');
 }
 if(/\d+(?:\.\d+)?\s*(?:英寸|kg|mm|GB|TB|GHz|Hz|ppi|点触控)|\d+:\d+|HDMI\s*\d|DisplayPort\s*\d/i.test(all))issues.push('Q：发布文案不要罗列参数数字；只保留型号数字，把产品功能融入具体动作。');
 const count=(body.match(/\p{Script=Han}/gu)||[]).length;
 if(input.platform==='朋友圈'){
  if(count<60||count>150)issues.push(`Q：朋友圈正文应为60—150个汉字，现在${count}字；保留一个任务和一个核心卖点。`);
  const families=[['屏幕',/大屏|屏幕|显示屏|触控屏|OLED/i],['键盘',/键盘|键程/],['协同',/超级终端|中转站|多屏协同|碰一碰|传送|跨设备/],['便携',/轻薄|便携|轻巧|机身重量/],['续航',/续航|电池|充电/],['性能存储',/处理器|内存|固态|SSD|显卡/],['接口',/接口|HDMI|USB/],['系统',/Windows|Linux|HarmonyOS|鸿蒙系统/i]];
  const found=families.filter(([,re])=>re.test(all)).map(([name])=>name);
  if(found.length>1)issues.push(`Q：朋友圈只保留一个核心卖点，标题、正文、引导都围绕它展开；当前同时出现${found.join('、')}。`);
  if(!/咨询|到店|聊聊|联系|私信/.test(cta))issues.push('Q：朋友圈结尾需要与该任务相关的咨询或到店引导，不能编造优惠。');
  if(/#[^\s#]+/.test(body))issues.push('Q：朋友圈不堆小红书话题标签。');
 }else if(input.platform==='小红书'){
  if(count<300||count>650)issues.push(`Q：小红书要完整串联场景，建议400—600字；当前${count}字，须在300—650字内。`);
  if((body.match(/\p{Extended_Pictographic}/gu)||[]).length<2)issues.push('Q：小红书用2—3个emoji场景小标题分段，小标题单独一行，正文另起一行。');
  if((body.match(/#[^\s#]+/g)||[]).length<2)issues.push('Q：小红书正文末尾补2—4个与任务相关的话题标签，不增加未经证实的产品主张。');
 }
 return {method:'channel-copy-rules',passed:issues.length===0,issues:[...new Set(issues)],body_han_count:count};
}
