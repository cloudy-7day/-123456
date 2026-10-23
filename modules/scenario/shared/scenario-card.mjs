import {businessSceneLabels} from './business-examples.mjs';
// Task candidates are writing material, never additional customer facts.
export const taskTemplates={
 student:{entry:'学生',title:'小组汇报：从素材到定稿',task:'完成一份小组汇报',steps:['寝室 · 整理素材、搭建初稿','教室 · 展示汇报、记录反馈','图书馆 · 查阅文献、补充引用并定稿'],problem:'可围绕素材分散、反馈难对应、改稿来回找版本展开。'},
 meeting:{entry:'职场人士',title:'项目会议：从准备到行动',task:'推进一次项目会议',steps:['会前 · 整理参考材料、准备讨论稿','会中 · 展示方案、记录结论与负责人','会后 · 整理行动项、修订下一轮方案'],problem:'可围绕会前材料分散、会中意见难定位、会后行动项不清楚展开。'},
};
export const cardKindLabels={fact:'原文提取',inference:'有据推断',suggestion:'建议补充',unknown:'暂未提供',operator:'本轮选择'};
const entry=(value,kind='suggestion',evidence=[],rationale='用于组织内容，不代表客户已经确认。')=>({value,kind,evidence,rationale});
const unknown=value=>entry(value,'unknown',[],'不影响先生成有限草稿。');
const goalLabels={conversation:'话题互动',save:'收藏参考',consultation:'引导咨询'};
export function buildScenarioCard(analysis={},options={}){
 const observations=analysis.understanding?.observations||[];
 const known=category=>observations.filter(o=>o.category===category&&o.value&&['fact','inference'].includes(o.kind)).sort((a,b)=>(a.kind==='fact'?0:1)-(b.kind==='fact'?0:1));
 const asEntry=o=>entry(o.value,o.kind,o.evidence||[],o.rationale||'');
 const identityObservation=known('identity')[0]||known('situation').find(o=>/学生|职场|工作人员|项目经理|医生|律师|教师|工程师|运营|商务|我是一名/.test(o.value));
 const identity=identityObservation?asEntry(identityObservation):unknown('身份未说明，按实际任务展开');
 const tasks=known('task').slice(0,3).map(o=>{
   const item=asEntry(o);
   for(const evidence of item.evidence){
     const source=analysis.input?.sources?.find(s=>s.id===evidence.sourceId)?.text||'';
     const at=source.indexOf(evidence.quote);if(at<0)continue;
     const start=Math.max(source.lastIndexOf('\n',at-1),source.lastIndexOf('。',at-1))+1;
     const context=source.slice(start,at+evidence.quote.length);
     const scene=context.match(/^(?:在|到|回到)?(寝室|教室|图书馆|会前|会议中|会后|工位|会议室)/);
     if(scene){item.scene_label=scene[1];item.evidence=[...item.evidence,{sourceId:evidence.sourceId,quote:scene[0]}];break;}
   }
   return item;
 }),taskText=tasks.map(t=>t.value).join('；');
 const studentIdentity=/学生|大学新生|研究生/.test(identity.value)&&!/(?:不是|并非|不再是|非)(?:一名|一个)?(?:学生|大学生|研究生)/.test(identity.value);
 let id=null;
 if(studentIdentity)id='student';
 else if(/会议|会前|会中|会后|行动项/.test(taskText))id='meeting';
 else if(!tasks.length&&/职场|项目经理|工作人员|商务|运营/.test(identity.value))id='meeting';
 else if(identity.kind==='unknown'&&!tasks.length&&taskTemplates[options.businessScenario])id=options.businessScenario;
 const template=taskTemplates[id];
 const effectiveTasks=tasks.length?tasks:(template?template.steps.map(t=>entry(t)): [entry('从原文涉及的一件具体工作或学习任务展开，不补造职业经历。')]);
 const problemObservation=known('pain')[0]||known('concern')[0];
 const matchesTemplate=!tasks.length||(id==='student'?/汇报|小组作业/.test(taskText):id==='meeting'&&/会议|会前|会中|会后|行动项/.test(taskText));
 const problem=problemObservation?asEntry(problemObservation):entry(template&&matchesTemplate?template.problem:`可从“${taskText.slice(0,80)||'本次任务'}”中反复查找、整理或修改的环节切入；具体困扰尚待确认。`);
 const stage=known('purchase_stage').find(o=>o.kind==='fact'&&!/未知|未说明|未确定|未提供|不清楚|不知道|假设|推断|补造/.test(o.value.split(/[，；。]/)[0]));
 const goalObservation=known('content_goal').find(o=>! /未知|未说明|未确定|未提供|不清楚|不知道|不要补|不得补|不作设定/.test(o.value));
 const extractedGoal=goalObservation&&(/咨询|预约|到店|购机/.test(goalObservation.value)?'consultation':/收藏|保存/.test(goalObservation.value)?'save':/互动|评论|讨论/.test(goalObservation.value)?'conversation':null);
 const goalId=goalLabels[options.contentGoal]?options.contentGoal:extractedGoal||'conversation';
 const goal=goalLabels[options.contentGoal]?entry(goalLabels[goalId],'operator',[],'运营者选择，不代表客户购买阶段。'):extractedGoal?entry(goalLabels[goalId],'inference',goalObservation.evidence,'从原文内容目标归纳。'):entry('话题互动');
 // Business taxonomy is independent of legacy task templates (SC01/SC02).
 const businessObservation=known('situation').find(o=>/开学季|职场办公|内容创作|家庭换新|企业采购|门店到访|新品首发|节日营销/.test(o.value));
 const observedScene=businessObservation&&Object.entries(businessSceneLabels).find(([,label])=>businessObservation.value.includes(label));
 const businessScene=observedScene?entry(observedScene[1],'inference',businessObservation.evidence,'从原文场景归纳业务分类。'):businessSceneLabels[options.businessScenario]?entry(businessSceneLabels[options.businessScenario],'operator',[],'运营者选择的业务分类；不改写实际任务模板或购买阶段。'):id?entry(businessSceneLabels[id],'inference',[...identity.evidence,...tasks.flatMap(t=>t.evidence)],'按已识别的身份与任务归类；分类不证明购买阶段。'):unknown('业务场景待确认');
 const product=options.product?entry(options.product,'operator',[],'本轮用于检索的产品，不代表客户已经购买。'):analysis.understanding?.product?.name?entry(analysis.understanding.product.name,'fact',analysis.understanding.product.evidence||[],'原文产品意向。'):entry('按需求匹配候选，支持更换');
 return {schema_version:'scenario_card.1',template_id:id,business_scene:businessScene,title:template&&matchesTemplate?template.title:'围绕实际任务展开',identity,tasks:effectiveTasks,problem,buying_stage:stage?asEntry(stage):unknown('购买阶段未知'),goal:{...goal,id:goalId},product,platform:entry(options.platform||'小红书','operator',[],'本轮发布渠道。'),rule:'原文提取与有据推断沿用其依据；建议补充只作条件式情境，不能写成客户事实。产品功能仍须检索知识库核验。'};
}
