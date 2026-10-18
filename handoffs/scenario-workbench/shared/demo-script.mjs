export function demoScriptText(script,{product='',paused=true}={}){
 if(!script)throw new Error('请先生成店员演示脚本。');
 return ['店员演示脚本 · 待现场执行与复核',product?`候选产品：${product}`:'',paused?'适配判断暂停：先确认关键条件，本脚本不代表产品已经适配。':'现场验证完成后再确认适配。',`\n${script.title}`,`建议时长：${script.durationMinutes} 分钟（按现场情况调整）`,'\n演示前准备',...script.preparation.map(x=>'□ '+x),'\n开场话术',script.opening,...script.steps.flatMap((s,i)=>[`\n${i+1}. ${s.title}`,`店员说：${s.say}`,`现场做：${s.action}`,`向客户确认：${s.question}`,`观察与记录：${s.observe}`,`未通过 / 条件不足：${s.onIssue}`]),'\n结束话术',script.closing,'\n现场记录（由店员填写，不代表已经完成）','软件版本 / 样机配置：________','测试文件及任务：________','实际观察与客户反馈：________','未解决问题 / 下一步：________','\n产品事实仅限本次 ima 本地资料依据；不将一次现场操作推为普遍兼容或续航承诺。'].filter(Boolean).join('\n');
}
