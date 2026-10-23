export const standardVersion='0.3';
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
每轮最多 2 个问题，同主题合并；仅追问会改变候选或核验路径的信息。软件系统、必要协同动作与真实约束优先；资料无报价时不能假装预算已参与筛选。普通未知保留，不阻止有限营销草稿；已经说明或回答过的条件不重复追问。`;

export const understandingResearchSources=[
 {id:'xhs-campus',title:'蹲浙大计算机在读！大一笔记本怎么选',url:'https://www.xiaohongshu.com/explore/6a64609e000000001c012cde',accessedAt:'2026-10-18',level:'原帖正文可见',visible:'正文描述编程与 AI 入门、图书馆携带、较长使用周期及预算区间，并询问课程要求、携带负担和是否需要本地运行模型。',needs:['实际课程工具与版本','本地计算或远程资源','携带与使用周期'],limits:'学校资源、具体配置是否够用未核验；评论仅为他人意见。示例移除学校和家庭关系。'},
 {id:'xhs-mechanical',title:'工科女（机械大类）电脑经验 教训版',url:'https://www.xiaohongshu.com/explore/6a809d160000000008010660',accessedAt:'2026-10-18',level:'原帖部分正文可见',visible:'可见正文回顾尚未确定专业就购机，后续机械绘图复杂任务出现卡顿和保存问题，由专业需求触发换机。',needs:['任务复杂度','文件保存可靠性','专业需求变化'],limits:'只读取可见正文段落，未完整翻阅图片；体验与型号性能说法未经验证。示例不保留原帖机型和个人身份。'},
 {id:'xhs-mobile',title:'求推荐一部适合带出门的笔记本电脑',url:'https://www.xiaohongshu.com/explore/6a316c910000000016024e09',accessedAt:'2026-10-18',level:'原帖正文与首张图可见',visible:'正文提出工作使外出也需携带电脑，使用 WPS 文档、演示与表格，希望便携、续航长和便宜；已有平板，表格可能达几万行，并询问同事提出的更换系统方案。',needs:['离电时间与总携带重量','表格规模和功能','已有设备能否替代'],limits:'未获得硬预算、宏和插件要求；同事方案及评论的兼容性判断未核验。便宜不能直接换算预算。'},
{"id": "xhs-chemistry", "title": "化学/化工/材料类研究生笔记本电脑建议", "url": "https://www.xiaohongshu.com/explore/6972f6e70000000022030af1", "accessedAt": "2026-10-18", "level": "首张长图上半段、正文和一条可见评论", "visible": "作者谈到专业软件环境、论文文件交换、维修网点和数据备份；可见评论列举多种科研工具及外设接口需求。", "needs": ["软件与文件交付环境", "售后与数据备份", "外设接口"], "limits": "建议帖及评论均非验证结论；未读完首张长图，不采用其中破解、品牌优劣或兼容性断言。"},
{"id": "xhs-economics", "title": "一万人看过的经济学硕博电脑推荐后续", "url": "https://www.xiaohongshu.com/explore/69cc93b8000000001e00cd59", "accessedAt": "2026-10-18", "level": "正文前段、配件与已安装软件段", "visible": "作者描述论文、数据处理、演示与开会并行，提及 Stata、Office、EndNote 等工具，以及携带、触控板习惯、系统适应和希望用到毕业。", "needs": ["多任务并行", "系统迁移成本", "输入习惯与使用年限"], "limits": "自述使用感受不等于性能测试；未完整阅读所有图片和评论。"},
{"id": "xhs-medicine", "title": "各位院士杰青们，求医学生笔记本推荐", "url": "https://www.xiaohongshu.com/explore/6a3797ad0000000011012690", "accessedAt": "2026-10-18", "level": "正文需求、后续购买更新可见段", "visible": "提出生信分析与大数据任务、Windows 意向、后续租服务器的可能性，并关心内存扩展、已有移动硬盘、重量、续航和购机时间。", "needs": ["本机或服务器分工", "数据规模与内存扩展", "购买时机与预算口径"], "limits": "购买更新是作者自述；价格、补贴、配置建议不用于产品事实或价格推荐。"},
{"id": "xhs-lightoffice", "title": "想买办公笔记本，1kg左右最好", "url": "https://www.xiaohongshu.com/explore/69671769000000000903a828", "accessedAt": "2026-10-18", "level": "完整正文与首图", "visible": "每日通勤跑市场，现有电脑约 1.4kg 仍嫌重；只做文档、表格、演示和邮件，给出新机与二手的不同预算，并在意是否等待新品。", "needs": ["总携带负担与旧机基线", "新机或二手预算", "购买时机"], "limits": "重量与型号评价为作者陈述；“左右最好”属于偏好，不强制转成硬上限。"},
{"id": "xhs-office", "title": "纯办公，电脑挑选纠结症犯了", "url": "https://www.xiaohongshu.com/explore/6a36421700000000060232ef", "accessedAt": "2026-10-18", "level": "完整正文与首图", "visible": "日常文档、表格、演示，偶尔同时开十几个网页；不游戏不剪辑，关心耐用、续航、键盘和多开体验，并给出预算区间。", "needs": ["办公也需确认并发负载", "键盘体验", "耐用和预算"], "limits": "没有实际文件规模、软件版本或性能测试；“纯办公”不能直接等于低性能需求。"},
{"id": "xhs-syncphone", "title": "华为多屏协同失败！！（已破案）", "url": "https://www.xiaohongshu.com/explore/6a6c57cb000000000502aa4f", "accessedAt": "2026-10-18", "level": "正文、首图及一条可见评论", "visible": "作者描述手机升级系统后，多屏协同连接后会关闭，已尝试重启和重装管理软件；补充称售后换电脑可连接。", "needs": ["两端型号与系统版本", "具体协同动作与失败步骤", "现场验证"], "limits": "首图包含 AI 回答截图，其兼容性断言不采信；正文与评论的诊断也未经独立核验。"},
{"id": "xhs-synctablet", "title": "matepad11.5s鸿蒙 4.2 无法使用多屏协同", "url": "https://www.xiaohongshu.com/explore/69401e9c000000001b032894", "accessedAt": "2026-10-18", "level": "完整正文与首图", "visible": "作者使用非华为电脑，平板与电脑均弹出连接确认但无后续反应；提到镜像、共享、拓展不可用，而手机与该电脑可以连接。", "needs": ["逐设备逐功能核验", "镜像/共享/扩展分开记录", "不能从手机成功推断平板支持"], "limits": "非官方安装环境；不采信评论中的显卡诊断，不认定该功能对所有同类设备不可用。"},
{"id": "xhs-video", "title": "剪视频应该买什么电脑？", "url": "https://www.xiaohongshu.com/explore/69f32aeb000000003601fb06", "accessedAt": "2026-10-18", "level": "正文与作者置顶评论", "visible": "正文笼统询问剪辑电脑并提及他人推荐型号，作者置顶补充希望使用 AE；预算、素材和项目复杂度仍未给出。", "needs": ["从笼统任务追问必需软件", "项目复杂度", "他人推荐不等于已选产品"], "limits": "AE 信息来自作者置顶评论；不把其他评论推荐机型当适配依据。"},
{"id": "xhs-videoexperience", "title": "到底谁在用macbook 剪视频", "url": "https://www.xiaohongshu.com/explore/6aafca5a000000002603902b", "accessedAt": "2026-10-18", "level": "正文、首图与一组可见问答", "visible": "作者以剪辑新手身份表达主观顺畅体验；可见问答涉及不会用触控板、需要鼠标及连接方式。", "needs": ["熟练度与输入习惯", "外设连接", "主观流畅需具体项目复现"], "limits": "正文未给出软件版本、素材规格与测试数据；搜索联想词不算作者型号，评论接口说法不作事实。"}
];
