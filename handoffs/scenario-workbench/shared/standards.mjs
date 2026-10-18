export const standardVersion='0.2';
export const dimensions=[
 {id:'context',name:'使用场景与任务',keys:['situation','task'],hint:'在哪里用、用来做什么、多久一次。',ask:'最常在哪些地方用？一次通常要完成什么任务？',sources:['xhs-campus','xhs-mobile','xhs-office']},
 {id:'software',name:'常用软件与系统',keys:['software','os'],hint:'必需软件、关键版本或插件、本地还是远程。',ask:'有没有必须安装的软件或插件？在本机运行，还是连接服务器？',sources:['xhs-chemistry','xhs-medicine','xhs-video']},
 {id:'performance',name:'性能与任务负载',keys:['performance'],hint:'文件规模、同时开的程序、渲染或计算任务。',ask:'最复杂的一次任务是什么？大概多大的文件，同时开哪些程序？',sources:['xhs-mobile','xhs-mechanical','xhs-office','xhs-medicine']},
 {id:'collaboration',name:'多设备协同',keys:['devices','collaboration'],hint:'已有型号与系统，以及传文件、投屏或扩展屏等具体动作。',ask:'要和哪台手机、平板协同？主要想完成哪一个动作？',sources:['xhs-mobile','xhs-syncphone','xhs-synctablet']},
 {id:'mobility',name:'便携与续航',keys:['mobility'],hint:'携带频率、含充电器重量、离电时长和插座条件。',ask:'每天背多久？通常多长时间不能充电？现在的电脑哪里不方便？',sources:['xhs-mobile','xhs-lightoffice','xhs-medicine']},
 {id:'experience',name:'屏幕与输入体验',keys:['experience'],hint:'阅读、键盘、触控板与鼠标习惯；有需要再确认屏幕细节。',ask:'主要看文档还是处理图像？键盘、触控板有没有特别在意的体验？',sources:['xhs-economics','xhs-office','xhs-videoexperience']},
 {id:'connectivity',name:'接口、外设与网络',keys:['connectivity'],hint:'鼠标、移动硬盘、显示器、投影和联网限制。',ask:'必须连接哪些外设？能接受转接器吗？',sources:['xhs-chemistry','xhs-medicine','xhs-videoexperience']},
 {id:'storage',name:'存储与数据',keys:['storage'],hint:'素材或数据大小、已有硬盘、备份和交付。',ask:'平时要保存哪些资料？是否已有移动硬盘或备份方式？',sources:['xhs-chemistry','xhs-medicine','xhs-mechanical']},
 {id:'budget',name:'预算与购买条件',keys:['budget'],hint:'硬上限还是期望区间、配件口径、新机或二手、购买时间。',ask:'预算是大致期望还是不能超过的总价？包含哪些必要配件？',sources:['xhs-campus','xhs-lightoffice','xhs-office']},
 {id:'lifecycle',name:'使用年限与维护',keys:['lifecycle'],hint:'计划用多久、后续需求变化、扩展和维护顾虑。',ask:'希望用几年？后续课程或工作是否会有明确变化？',sources:['xhs-campus','xhs-economics','xhs-chemistry']},
 {id:'tradeoff',name:'痛点与优先级',keys:['pain','constraint','preference','concern','motivation'],hint:'为什么换机，哪些不能妥协，哪些愿意取舍。',ask:'如果价格、重量和性能不能同时满足，最不能妥协的是哪一个？',sources:['xhs-mechanical','xhs-lightoffice','xhs-mobile']},
 {id:'product',name:'产品意向',keys:['product'],hint:'区分已选型号、候选型号、已有设备和他人建议。',ask:'这个型号是已经选定，还是想先了解的候选？',sources:['xhs-video','xhs-lightoffice','xhs-medicine']}
];
export const STANDARD_PROMPT=`理解标准 v${standardVersion}：
${dimensions.map(d=>d.name+'（'+d.keys.join('/')+'）：'+d.hint).join('\n')}
所有维度是理解检查项，不是必填问卷。没有证据就 unknown，不用职业、人群、品牌补值。
performance 记录文件大小/数据行数/分辨率/并发程序/本地或远程负载等客户陈述，不推算 CPU、GPU、内存档位；提到 AI 不能自动认定训练大模型。
collaboration 区分已有设备与希望完成的动作。同品牌不等于可协同；关键协同动作明确但两端型号/版本缺失时，合并为一个关键问题。没有协同需求，不要求填写设备版本。
mobility 中“最好/希望/左右”是偏好，只有明确不能超过才是硬限制。保留现有电脑基线；不自行设定续航小时或重量。
experience/connectivity/storage/lifecycle 未提及保留未知；只有直接影响客户必须完成的任务才追问。屏幕尺寸、色彩、接口、网络、备份属于可选拓展，不是每位客户的必答题。
budget 记录意向范围与硬上限的语气；当前报价、他人预算不变成客户预算。购买时间和二手接受度仅从明确陈述提取。
旧电脑卡顿是客户体验，不证明其型号性能；同事推荐某型号不等于客户指定。帖子或输入中的 AI 截图、评论、宣传文案不能变成已经核验的产品事实。
每轮最多 3 个 blocking 问题，同主题合并，优先解决软件系统、关键协同动作、硬预算和约束冲突。普通未知不阻塞保存洞察。`;
