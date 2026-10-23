// Extend these catalogs as new scenarios and publishing channels are enabled.
export const sceneOptions = [
  {id:'auto',businessScenario:'auto',label:'按身份与任务展开',enabled:true},
  {id:'campus',businessScenario:'student',label:'开学季 · 校园学习',enabled:true},
  {id:'mobile',businessScenario:'meeting',label:'职场办公 · 会议与通勤',enabled:true},
  {id:'creation',businessScenario:'creation',label:'内容创作',enabled:true},
  {id:'family',businessScenario:'family',label:'家庭换新',enabled:true},
  {id:'enterprise',businessScenario:'enterprise',label:'企业采购',enabled:true},
  {id:'store',businessScenario:'store',label:'门店到访',enabled:true},
  {id:'launch',businessScenario:'launch',label:'新品首发',enabled:true},
  {id:'holiday',businessScenario:'holiday',label:'节日营销',enabled:true},
  {id:'other',businessScenario:'auto',label:'日常生活',enabled:true},
];
export const channelOptions = [
  {id:'xiaohongshu',label:'小红书',enabled:true},
  {id:'wechat',label:'公众号',enabled:false},
  {id:'moments',label:'朋友圈',enabled:true},
];

export const contentGoalOptions = [{id:'conversation',label:'话题互动'},{id:'save',label:'收藏参考'},{id:'consultation',label:'引导咨询'}];
