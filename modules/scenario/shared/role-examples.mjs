// Fictional input examples, not customer facts or product capability claims.
export const roleExamples = [
 {id:'student',label:'学生',identity:'我是一名大学生',defaults:['dorm','classroom','library'],scenes:[
  {id:'dorm',label:'寝室',detail:'整理社团素材、创作图文',text:'在寝室，整理手机拍摄的社团照片和视频，尝试制作图文与小组汇报材料，希望素材整理少一些重复操作'},
  {id:'classroom',label:'教室',detail:'看课件、记笔记、小组展示',text:'在教室，看课件、记笔记，与同学一起准备小组展示，需要把资料和自己的想法放在一起梳理'},
  {id:'library',label:'图书馆',detail:'读文献、查资料、写报告',text:'在图书馆，阅读课程文献、查资料、写报告，经常需要边看资料边打字'},
  {id:'club',label:'社团活动',detail:'活动策划、整理现场素材',text:'在社团活动中，和同学一起修改策划文档，活动后整理自己拍摄的照片，准备公开推送'},
  {id:'cafe',label:'校园咖啡馆',detail:'小组讨论、修改作业',text:'在校园咖啡馆，带电脑与同学讨论小组作业，对照反馈修改汇报内容，希望携带和临时展开工作方便'},
  {id:'internship',label:'实习准备',detail:'整理简历、展示作品',text:'准备实习时，整理个人简历与可公开展示的作品，练习向面试官讲清项目过程，不使用他人的保密资料'},
 ]},
 {id:'doctor',label:'医生',identity:'我是一名医生，这次电脑用途是教学、学术交流或公开科普，不用于诊疗决策',defaults:['prep','conference','science'],scenes:[
  {id:'prep',label:'科室备课',detail:'读公开文献、整理课件',text:'在科室备课空间，读公开医学文献、整理教学课件，将文献要点组织成清楚的讲课材料'},
  {id:'conference',label:'学术会议',detail:'参会记录、整理报告要点',text:'参加学术会议时，带电脑记录公开报告要点，会后整理自己的笔记和允许拍摄的会场照片'},
  {id:'science',label:'科普书桌',detail:'整理公开资料、撰写科普',text:'在书桌前，整理公开资料并撰写科普文章，准备配图，不提供个体诊疗建议'},
  {id:'travel',label:'参会途中',detail:'阅读文献、梳理交流提纲',text:'在参会途中，阅读已保存的公开文献，梳理交流提纲，希望带电脑出门方便'},
 ]},
 {id:'lawyer',label:'律师',identity:'我是一名律师，这次关注文档整理、沟通准备和移动办公',defaults:['office','meeting','travel'],scenes:[
  {id:'office',label:'律所',detail:'对照合同、整理批注',text:'在律所，对照不同版本的合同与批注意见，整理需要进一步讨论的问题，仅使用机构允许处理的材料'},
  {id:'meeting',label:'客户会议',detail:'准备材料、展示沟通重点',text:'在客户会议前，整理经过授权的沟通材料，准备展示重点，不把个人设备可用权限当成已经确认'},
  {id:'travel',label:'差旅途中',detail:'读公开资料、写工作提纲',text:'在差旅途中，阅读公开法规资料、整理自己的工作提纲，希望携带电脑和临时阅读方便'},
  {id:'outreach',label:'公开普法',detail:'整理公开资料、制作讲解内容',text:'准备公开普法内容时，整理公开资料、制作讲解材料，不编造真实案件、法律结论或办案效果'},
 ]},
];
export function buildRoleExample(roleId,selectedIds){
 const role=roleExamples.find(r=>r.id===roleId);
 if(!role)throw Error('未知示例身份');
 const selected=new Set(selectedIds);
 const scenes=role.scenes.filter(s=>selected.has(s.id));
 if(!scenes.length)throw Error('请至少选择一个场景');
 const text=['以下是虚构营销输入示例，可按实际需求修改。',role.identity+'。',...scenes.map(s=>s.text+'。'),'请围绕以上选择的场景写一篇完整小红书文案，结合所选华为电脑的真实资料说明它如何帮助完成这些任务。未选择的场景不作为本次写作重点。预算、已有设备、软件与型号均未确定，不要补造成已知条件。',...(role.id==='student'?[]:['仅使用公开或经授权的材料，不使用真实患者、客户或案件资料；机构权限与专业软件兼容性需要另行核对。'])].join('\n');
 return {id:'role-'+role.id,title:role.label+'场景组合',tag:role.label,sourceId:null,label:'虚构'+role.label+'输入示例',product:'',text,basis:'人工设计的身份和场景选项，用于构建可编辑的营销输入。',fiction:'身份与场景均为虚构，选项不证明产品能力或客户实际经历。'};
}
