export {supplementExamples} from './business-examples.mjs';
// Fictional input examples, not customer facts or product capability claims.
export const roleExamples = [
 {id:'student',label:'学生',identity:'我是一名大学生',selectionBrief:'经常背电脑往返寝室、教室和图书馆，希望轻便，最看重用手指触控屏幕翻阅资料',defaults:['dorm','classroom','library'],scenes:[
  {id:'dorm',label:'寝室',detail:'整理同一份汇报素材',text:'在寝室，为同一份小组汇报整理同学授权分享的照片、文字和参考资料，搭好汇报初稿，希望素材整理少一些重复操作'},
  {id:'classroom',label:'教室',detail:'看课件、记笔记、小组展示',text:'在教室，展示同一份小组汇报，记录老师和同学的反馈，把修改意见对应到汇报内容'},
  {id:'library',label:'图书馆',detail:'读文献、查资料、写报告',text:'在图书馆，为同一份小组汇报查阅公开文献，对照课堂反馈补充引用、修改初稿，完成最终汇报'},
  {id:'club',label:'社团活动',detail:'活动策划、整理现场素材',text:'在社团活动中，和同学一起修改策划文档，活动后整理自己拍摄的照片，准备公开推送'},
  {id:'cafe',label:'校园咖啡馆',detail:'小组讨论、修改作业',text:'在校园咖啡馆，带电脑与同学讨论小组作业，对照反馈修改汇报内容，希望携带和临时展开工作方便'},
  {id:'internship',label:'实习准备',detail:'整理简历、展示作品',text:'准备实习时，整理个人简历与可公开展示的作品，练习向面试官讲清项目过程，不使用他人的保密资料'},
 ]},
 {id:'meeting',label:'职场会议',identity:'我是一名职场工作人员，正在准备同一个项目会议的方案材料',selectionBrief:'本次必须选择 Windows 电脑，主要放在办公桌和会议室使用，最看重大屏查看讨论稿，希望有独立数字键盘录入项目数据',defaults:['before','during','after'],scenes:[
  {id:'before',label:'会前准备',detail:'整理材料、准备项目讨论稿',text:'会前，为同一个项目会议整理经授权的参考材料，形成方案讨论稿和需要讨论的问题'},
  {id:'during',label:'会议进行',detail:'展示讨论稿、记录行动项',text:'会议中，展示同一个项目会议的方案讨论稿，记录讨论结论、负责人和待确认的行动项'},
  {id:'after',label:'会后整理',detail:'对照行动项、修改项目方案',text:'会后，将同一个项目会议的行动项整理成清单，对照反馈修订项目方案，形成下一轮沟通材料'},
 ]},

];
export function buildRoleExample(roleId,selectedIds){
 const role=roleExamples.find(r=>r.id===roleId);
 if(!role)throw Error('未知示例身份');
 const selected=new Set(selectedIds);
 const scenes=role.scenes.filter(s=>selected.has(s.id));
 if(!scenes.length)throw Error('请至少选择一个场景');
 const text=['以下是虚构营销输入示例，可按实际需求修改。',role.identity+'。',...(role.selectionBrief?[role.selectionBrief+'。']:[]),...scenes.map(s=>s.text+'。'),'请围绕以上选择的场景写一篇适合所选发布渠道的完整文案，结合所选华为电脑的真实资料说明它如何帮助完成这些任务。未选择的场景不作为本次写作重点。预算、已有设备、软件、型号与购买阶段均未确定，不要补造成已知条件。',...(role.id==='student'?[]:['仅使用公开或经授权的材料，不使用未经授权的工作资料；机构权限与专业软件兼容性需要另行核对。'])].join('\n');
 return {id:'role-'+role.id,title:role.label+'场景组合',tag:role.label,sourceId:null,label:'虚构'+role.label+'输入示例',product:'',text,basis:'人工设计的身份和场景选项，用于构建可编辑的营销输入。',fiction:'身份与场景均为虚构，选项不证明产品能力或客户实际经历。'};
}
