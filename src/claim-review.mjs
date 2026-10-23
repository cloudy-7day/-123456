// Independent, evidence-bound review. A model verdict is never a factual guarantee.
const REF = /\[(S\d+|I\d+)\]/g;
const FACT_HINT = /\[(?:S|I)\d+\]|支持|搭载|配备|内置|兼容|重约|轻至|零卡顿|绝不卡|\d+(?:\.\d+)?\s*(?:kg|g|GB|TB|Hz|英寸|小时|元|%)/i;
const LIMIT_HINT = /仅(?:限|支持|适用|在)|需(?:要|配合|使用|搭配|同|满足|支持)|前提|取决于|部分(?:型号|设备|版本)|同一(?:账号|帐号)|同账号|不(?:支持|保证)|无法(?:保证|支持)/;
const VERDICTS = new Set(['supported', 'unsupported', 'contradicted', 'missing_conditions', 'not_applicable']);
// Effects need their own evidence. A correct specification does not establish an
// inferred benefit, even if a reviewer calls it a reasonable/common-sense result.
const EFFECT_HINT = /更(?:快|慢|多|少|省|易|容易|轻松|流畅|顺畅|舒适|舒服|清晰|稳定|安全|高效|方便|专注|放心|好用|耐用|长|短|薄|轻)|提升|提高|改善|降低|减轻|缓解|减少|缩短|节省|省去|省下|免去|避免|告别|消除|解决|延长|加快|加速|保护|不用|无需|不必|不需要|不容易|不会再|再也不|不再|不怕|零卡顿|不卡顿|不费力|不累|无压力|顺滑|流畅|轻松|省心|省力|舒适|(?:多|少)(?:一点|一些|几[行次步页]|次数|步骤)|(?:能|可以|可)(?:多|少)(?:看|读|写|做|放|装)|让|使(?:得|你|人|操作|工作)|带来|意味着|因此|所以|从而|因而|就能|即可|便能|只需|直接|全天|一整天|整天/g;
const effectText = text => String(text).normalize('NFKC').replace(REF, '').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();

function effectClauses(text) {
  const clauses = text.split(/[，,；;。！？!?\n]/).map(value => value.trim()).filter(Boolean);
  return clauses.filter(clause => {
    // Questions/actions to check a result and explicit limits do not assert it.
    // This is clause-local, so a question at the end cannot excuse an earlier promise.
    if (/^(?:怎么|如何|怎样)(?:判断|比较|核对|确认|了解|选择|选出)/.test(clause)) return false;
    if (/^(?:想要|希望|担心|你是否|你会不会|是否|能否|会不会)/.test(clause) || /(?:试试|尝试|试用|试打|观察|检查|确认|核对|比较|看一看|看看)[^，,。；;]*(?:是否|能否|会不会|有没有)/.test(clause)) return false;
    if (/(?:无法|不能|尚不能|未能)(?:确认|证明|保证|断言)|(?:不|未)(?:代表|意味着)|没有(?:证据|依据)|(?:效果|体验|收益)(?:尚|仍)?(?:待|需)(?:确认|核验|验证|体验)/.test(clause)) return false;
    const effects = [...clause.matchAll(EFFECT_HINT)].filter(match => positiveClause(clause, match.index));
    // A causal word can introduce a selection method, not a product effect.
    // Only exempt an unquantified instruction; an added benefit remains checked.
    const method = !/[\d]|\[(?:S|I)\d+\]/.test(clause)
      && /(?:建议|先|要|应|请|记得|别忘|可以).{0,24}(?:核对|核查|对照|确认|检查|列出|列清|清点|称重|比较|算进去|计入|一起算)/.test(clause)
      && /总重|重量|充电器|配件|行李|软件|系统|接口|清单|版本|外设/.test(clause);
    if (method && effects.every(match => /^(?:所以|因此|因而|从而)$/.test(match[0]))) return false;
    return effects.length > 0;
  });
}

function imageFactText(text) {
  const topic = '(?:重量|续航|性能|功能|参数|软件兼容性?|兼容性|适配|舒适度|使用体验|使用效果)';
  const denial = new RegExp(`^(?:该|本)?(?:画面|图片|图像|产品图|外观图)(?:本身)?(?:不能|无法|不可)(?:直接)?(?:证明|验证|推断|认定)(?:产品的?)?${topic}(?:(?:或|和|与|及|以及|、)${topic})*$`);
  return text.replace(/\[I\d+\]/g, '').split(/[，,。；;！？!?]/).filter(clause => !denial.test(clause.trim())).join('。');
}

function effectChecks(segment, segments, row, validated) {
  if (segment.field.startsWith('image_plan.') && /^(?:知识库原图|产品图名称)/.test(segment.text) && !FACT_HINT.test(segment.text.replace(/\[I\d+\]/g, ''))) return [];
  const position = segments.indexOf(segment);
  const previous = segments[position - 1];
  // Benefits can be orphaned in a new sentence and incorrectly called "scene prose".
  // Only carry product context within the same field/paragraph, never across a title.
  const nearbyProduct = previous && (previous.field === segment.field && segment.start - previous.end < 2 || marketingSurface(previous.field) && marketingSurface(previous.field) === marketingSurface(segment.field)) && FACT_HINT.test(previous.text);
  if (row.verdict === 'not_applicable' && !FACT_HINT.test(segment.text) && !nearbyProduct && !/(?:这台|电脑|屏幕|键盘|触控板|电池|内存|处理器|华为|MateBook)/i.test(segment.text)) return [];
  return effectClauses(segment.text).map(text => {
    const matching = validated.find(item => effectText(item.quote).includes(effectText(text)));
    return { text, status: matching ? 'source_wording_present' : 'missing_explicit_effect_evidence', source_ref: matching?.source_ref || null };
  });
}

function marketingSurface(field) {
  if (/^marketing_package\.cover_(?:title|subtitle)$/.test(field)) return 'marketing_package.cover';
  return field.match(/^marketing_package\.(?:cards|consultation_replies)\.\d+/)?.[0] || null;
}

function packageIssues(output) {
  if (!Object.hasOwn(output, 'marketing_package')) return [];
  const value = output.marketing_package;
  const plain = item => item && typeof item === 'object' && !Array.isArray(item);
  const text = item => typeof item === 'string' && item.trim();
  const allowed = (item, keys) => plain(item) && Object.keys(item).every(key => keys.includes(key));
  const valid = allowed(value, ['cover_title','cover_subtitle','cards','consultation_replies'])
    && text(value.cover_title) && text(value.cover_subtitle)
    && Array.isArray(value.cards) && value.cards.length === 3 && value.cards.every(card => allowed(card, ['heading','body']) && text(card.heading) && text(card.body))
    && Array.isArray(value.consultation_replies) && value.consultation_replies.length === 2 && value.consultation_replies.every(reply => allowed(reply, ['question','reply']) && text(reply.question) && text(reply.reply));
  return valid ? [] : [{ code: 'incomplete_marketing_package', message: '营销图文包需包含完整封面、三张有标题和正文的卡片、两组完整咨询问答；存在空缺或未知字段，不能交付半成品。' }];
}

export function factSource(source) {
  if (source?.kind !== 'text' || !source.text?.trim() || source.supports_product_fact === false) return false;
  if (/图片索引|image[_ -]?index|\.csv$/i.test(`${source.title || ''} ${source.path || ''}`)) return false;
  if (source.source_type) return source.source_type === 'product_fact';
  const legacyIdentity = `${source.title || ''} ${source.path || ''}`;
  if (/P[2678][-_/]|话术|案例|问题清单|文案模板/.test(legacyIdentity)) return false;
  return /P1[-_/]|产品事实|卖点与限制|产品参数|产品资料|产品说明|产品介绍|规格|使用限制|article\.md/i.test(legacyIdentity);
}

export function reviewSegments(output) {
  const fields = Object.entries(output.content || {}).filter(([key]) => ['title', 'body', 'call_to_action'].includes(key));
  for (const [index, image] of (output.image_plan || []).entries()) fields.push([`image_plan.${index}.caption`, image.caption]);
  if (output.marketing_package && typeof output.marketing_package === 'object') {
    const pack = output.marketing_package;
    for (const key of ['cover_title','cover_subtitle']) fields.push([`marketing_package.${key}`, pack[key]]);
    for (const [index, card] of (Array.isArray(pack.cards) ? pack.cards : []).entries()) for (const key of ['heading','body']) fields.push([`marketing_package.cards.${index}.${key}`, card?.[key]]);
    for (const [index, reply] of (Array.isArray(pack.consultation_replies) ? pack.consultation_replies : []).entries()) for (const key of ['question','reply']) fields.push([`marketing_package.consultation_replies.${index}.${key}`, reply?.[key]]);
  }
  const segments = [];
  for (const [field, value] of fields) {
    if (typeof value !== 'string') continue;
    // Keep citations immediately following punctuation with the statement they support.
    for (const match of value.matchAll(/[^。！？!?\n]+(?:[。！？!?]+(?:\s*\[(?:S|I)\d+\])*)?|\[(?:S|I)\d+\]/g)) {
      const text = match[0];
      const clean = text.trim();
      if (clean) { const start = match.index + text.indexOf(clean); segments.push({ id: `C${segments.length + 1}`, field, text: clean, start, end: start + clean.length }); }
    }
  }
  return segments;
}

function positiveClause(clause, index) {
  const prefix = clause.slice(Math.max(0, index - 10), index);
  return !/(?:不能|不应|不得|禁止|不要|别|勿|拒绝|避免|并非|没有|未曾|未能|不保证)[^，,。；;]{0,6}$/.test(prefix);
}

function modelName(text) {
  return text.match(/MateBook\s*(?:Fold(?:\s*非凡大师)?|Pro\s*S|Pro|D\s*16\s*SE|D\s*16|D\s*14|14|GT|X(?:\s*Pro)?)/i)?.[0].toLowerCase().replace(/\s+/g, '') || null;
}

function metricValues(text) {
  const clean = text.replace(REF, '').replace(/(?:HUAWEI\s*)?MateBook\s*(?:D\s*)?\d+/gi, '');
  return [...clean.matchAll(/\d+(?:\.\d+)?\s*(?:GHz|MHz|GB|TB|kg|g|克|千克|Hz|mAh|Wh|W|mm|cm|毫米|厘米|英寸|寸|小时|分钟|元|%|％|倍|点触控|核|线程|nits?|尼特)(?![a-z])/gi)]
    .map(match => match[0].toLowerCase().replace(/\s/g, '').replace('％', '%'));
}

export function auditSurface({ input, output, segments = reviewSegments(output) }) {
  const issues = packageIssues(output);
  const support = input.store_support || 'selection_guidance';
  for (const segment of segments) {
    const text = segment.text;
    for (const expression of [/全网最低|行业第一|世界第一|百分之百|100[%％]|绝不卡顿|零卡顿|永不卡|任何软件(?:都)?(?:能|可)|所有软件(?:都)?(?:能|可)|所有手机(?:都)?(?:能|可)/g, /我(?:亲测|用了|用过|体验了)|亲测(?:有效|好用|流畅)|用了(?:半年|一年|两年)/g]) {
      for (const match of text.matchAll(expression)) if (positiveClause(text, match.index)) issues.push({ segment_id: segment.id, code: 'unsupported_promotion', message: `“${match[0]}”属于缺乏当前依据的宣传或亲测表达。` });
    }
    const expected = modelName(input.product), actual = modelName(text);
    if (expected && actual && expected !== actual) issues.push({ segment_id: segment.id, code: 'model_mismatch', message: '文案出现了与本轮指定产品不同的型号。' });
    if (/鸿蒙/.test(input.product) && /(?:搭载|运行|采用|预装)\s*Windows/i.test(text)) issues.push({ segment_id: segment.id, code: 'system_mismatch', message: '鸿蒙版产品被写成 Windows 系统。' });
    if (/Windows/i.test(input.product) && /(?:搭载|运行|采用|预装)\s*鸿蒙/i.test(text)) issues.push({ segment_id: segment.id, code: 'system_mismatch', message: 'Windows 产品被写成鸿蒙系统。' });
    // Questions supplied for customer consultation are not themselves an offer by
    // the store. Their factual assumptions remain covered by semantic review.
    if (/^marketing_package\.consultation_replies\.\d+\.question$/.test(segment.field)) continue;
    for (const clause of text.split(/[，,。；;！？!?\n]/).filter(Boolean)) {
      const uncertain = /(?:不能|无法|尚未|还未|未曾)(?:确认|承诺|保证)|(?:服务|安排|是否.{0,8})(?:仍|尚)?(?:待|需|要)(?:另行|先)?(?:确认|核对)|(?:不提供|不支持|暂无|暂不)(?:.{0,6})(?:试机|体验|测试|实测)|(?:体验|试机|实测|测试|库存|价格|优惠|预约)(?:.{0,4})(?:未知|未确认|待确认|需确认|另行确认)/.test(clause);
      if (uncertain) continue;
      if (support !== 'in_store_demo' && /到店|来店|进店|门店(?:体验|试机|试用|演示)|现场(?:体验|试机|试用|演示)|预约(?:体验|试机|到店)/.test(clause)) issues.push({segment_id:segment.id,code:'store_support_unconfirmed',message:'店员未确认可提供到店体验，文案不能自行邀请或承诺该服务。'});
      if (support !== 'software_check' && /帮(?:你|您)?|协助|替(?:你|您)|我们(?:会|可)|我(?:会|可)/.test(clause) && /核对|核查|确认|查(?:询)?/.test(clause) && /软件|兼容|适配|版本/.test(clause)) issues.push({segment_id:segment.id,code:'store_support_unconfirmed',message:'店员未确认可协助核对软件公开适配资料，不能把这一服务写成已可提供。'});
      const prohibited = /预约(?:已|已经)?(?:成功|确定|确认)|(?:现场|门店|店里|到店|我们|本店).{0,8}(?:备有|备好|现货|随到随试)|(?:免费|不限时).{0,8}(?:试机|体验|检测|测试)|(?:今天|明天|每天|周[一二三四五六日天]|\d{1,2}[:：]\d{2}).{0,12}(?:到店|预约|体验|试机)|实测(?:通过|有效|流畅|可用|正常|兼容|支持)|(?:帮你|帮您|我们|本店|店里|我)(?:已|已经|会|可|能|提供|安排)?.{0,14}(?:实测|测试软件|软件测试|现场测|运行测试)|(?:本店|我们|店里|这款|这台).{0,12}(?:有现货|赠送|优惠|促销|补贴|折扣)/g;
      for (const match of clause.matchAll(prohibited)) if (positiveClause(clause,match.index)) issues.push({segment_id:segment.id,code:'unconfirmed_store_promise',message:'运营选项只确认咨询服务范围，不能证明预约成功、指定时段、备机库存、费用优惠或软件实测结果。'});
    }
  }
  return issues;
}

function evidenceContext(source, quote) {
  const start = source.text.indexOf(quote), end = start + quote.length;
  const lineStart = Math.max(source.text.lastIndexOf('\n', start), source.text.lastIndexOf('。', start)) + 1;
  const nextLine = source.text.indexOf('\n', end), nextSentence = source.text.indexOf('。', end);
  const finishes = [nextLine, nextSentence].filter(x => x >= 0);
  const contextEnd = /[。！？!?；;\n]\s*$/.test(quote) ? end : finishes.length ? Math.min(...finishes) + 1 : source.text.length;
  return source.text.slice(Math.max(lineStart, start - 180), Math.min(contextEnd, end + 180));
}

export function validateClaimReview(raw, { input, output, sources, segments = reviewSegments(output) }) {
  const issues = auditSurface({ input, output, segments });
  const sourceMap = new Map(sources.map(source => [source.ref, source]));
  const rows = Array.isArray(raw?.segments) ? raw.segments : [];
  const seen = new Set(), claims = [], metricInquiries = [];
  if (!Array.isArray(raw?.segments)) issues.push({ code: 'invalid_review', message: '审核没有返回逐句记录。' });
  for (const row of rows) {
    const segment = segments.find(value => value.id === row?.id);
    if (!segment || seen.has(row.id)) { issues.push({ code: 'invalid_coverage', message: '审核返回了未知或重复的句段编号。' }); continue; }
    seen.add(row.id);
    const rowIssues = [];
    // verdict is the single discriminator. Older reviewer responses sometimes copied
    // classification=product_claim into every row while correctly returning not_applicable.
    const claim = row.verdict !== 'not_applicable';
    if (!VERDICTS.has(row.verdict) || typeof row.reason !== 'string' || !row.reason.trim()) rowIssues.push('审核判断或说明不完整。');
    const factText = segment.field.startsWith('image_plan.') ? imageFactText(segment.text) : segment.text;
    const compatibilityInquiry = !FACT_HINT.test(factText.replace(/兼容/g,'')) && (
      /^marketing_package\.consultation_replies\.\d+\.question$/.test(segment.field)
      || input.store_support === 'software_check' && /核对|核查|查询/.test(factText) && /公开.*资料|软件.*要求|兼容.*资料/.test(factText) && !/保证|一定|已经|已通过|可用|正常运行|无障碍|所有|任意|全部/.test(factText));
    // A short FAQ question may refer to a verified number without asserting a
    // new fact. Its paired answer must actually pass review for that same number.
    const questionMetrics = metricValues(factText);
    const metricInquiry = !claim && /^marketing_package\.consultation_replies\.\d+\.question$/.test(segment.field)
      && /^[^；;。！？!?\n]+吗[？?]$/.test(factText) && questionMetrics.length > 0
      && !FACT_HINT.test(factText.replace(/\d+(?:\.\d+)?\s*(?:kg|g|GB|TB|Hz|英寸|小时|元|%)/gi,''));
    if (metricInquiry) metricInquiries.push({segment, metrics:questionMetrics, replyField:segment.field.replace(/\.question$/,'.reply')});
    if (!claim && FACT_HINT.test(factText) && !compatibilityInquiry && !metricInquiry) rowIssues.push('含产品事实线索的句段不能跳过事实审查。');
    if (claim && row.verdict !== 'supported') rowIssues.push(row.reason || '本句产品主张没有通过证据审查。');
    const evidence = Array.isArray(row.evidence) ? row.evidence : [];
    const conditions = Array.isArray(row.conditions) ? row.conditions : [];
    if (claim && !evidence.length) rowIssues.push('产品主张缺少可定位的原文证据。');
    const validated = [];
    for (const item of evidence) {
      const source = sourceMap.get(item?.source_ref);
      if (!factSource(source)) { rowIssues.push('图片、话术、场景案例或无效来源不能支持产品事实。'); continue; }
      if (typeof item.quote !== 'string' || !item.quote.trim() || item.quote.length > 2200 || !source.text.includes(item.quote)) { rowIssues.push('证据引文不是本轮资料中的连续逐字原文。'); continue; }
      if (source.product_name && source.product_name !== input.product) { rowIssues.push('证据所属型号与本轮指定产品不一致。'); continue; }
      const expectedSystem = /鸿蒙/.test(input.product) ? 'harmony' : /windows/i.test(input.product) ? 'windows' : null;
      if (expectedSystem && source.system && ((expectedSystem === 'harmony' && /windows/i.test(source.system)) || (expectedSystem === 'windows' && /鸿蒙|harmony/i.test(source.system)))) { rowIssues.push('证据所属系统与指定产品不一致。'); continue; }
      validated.push({ source_ref: source.ref, quote: item.quote, path: source.path || source.source_path, section: source.section });
      const context = evidenceContext(source, item.quote);
      if (LIMIT_HINT.test(context) && !conditions.some(condition => condition.source_ref === source.ref)) rowIssues.push('证据附近含适用条件，审核未交代它在文案中的表达。');
    }
    for (const condition of conditions) {
      const source = sourceMap.get(condition?.source_ref);
      if (!factSource(source) || typeof condition.quote !== 'string' || !condition.quote.trim() || !source.text.includes(condition.quote)) { rowIssues.push('适用条件缺少有效的逐字来源。'); continue; }
      // A condition immediately adjacent in the same field is visible to the reader.
      // Folded pending_confirmation is deliberately not part of this scope.
      const position = segments.indexOf(segment);
      const surface = marketingSurface(segment.field);
      const visibleScope = (surface ? segments.filter(item => marketingSurface(item.field) === surface) : segments.slice(Math.max(0, position - 1), position + 2).filter(item => item.field === segment.field)).map(item => item.text).join('\n');
      if (typeof condition.rendered_quote !== 'string' || !condition.rendered_quote.trim() || !visibleScope.includes(condition.rendered_quote)) rowIssues.push('必要的适用条件没有出现在对应文案或紧邻句段中。');
    }
    if (claim) {
      const cited = [...segment.text.matchAll(REF)].map(match => match[1]);
      if (cited.length && cited.some(ref => !validated.some(item => item.source_ref === ref))) rowIssues.push('文案所标来源未被审核证据支持。');
      const metrics = metricValues(segment.text);
      const evidenceText = validated.map(item => item.quote).join('\n');
      for (const metric of metrics) if (!metricValues(evidenceText).includes(metric)) rowIssues.push(`数值“${metric}”没有出现在本句核验原文中；换算也需另行核对。`);
    }
    const effects = effectChecks(segment, segments, row, validated);
    for (const effect of effects.filter(item => item.status === 'missing_explicit_effect_evidence')) rowIssues.push(`效果子句“${effect.text}”没有被已核对的原文直接覆盖；参数或功能不能单独证明其用户收益，合理推断也不等于知识库支持。`);
    const inherited = issues.filter(issue => issue.segment_id === segment.id).map(issue => issue.message);
    for (const message of rowIssues) issues.push({ segment_id: segment.id, code: 'claim_rejected', message });
    if (claim || rowIssues.length || inherited.length) claims.push({ id: segment.id, field: segment.field, text: segment.text, status: rowIssues.length || inherited.length ? 'rejected' : 'supported', reason: [...new Set([...inherited, ...rowIssues])].join('；') || row.reason, source_ref: validated[0]?.source_ref || null, quote: validated[0]?.quote || null, evidence: validated, conditions, effect_checks: effects });
  }
  for (const inquiry of metricInquiries) {
    const metrics = claims.filter(claim => claim.field === inquiry.replyField && claim.status === 'supported').flatMap(claim => metricValues(claim.text));
    if (inquiry.metrics.some(metric => !metrics.includes(metric))) {
      const message='咨询问题中的数值未在同组已核验答复中获得支持。';
      issues.push({segment_id:inquiry.segment.id,code:'question_metric_unverified',message});
      claims.push({id:inquiry.segment.id,field:inquiry.segment.field,text:inquiry.segment.text,status:'rejected',reason:message,evidence:[],conditions:[],effect_checks:[]});
    }
  }
  for (const segment of segments) if (!seen.has(segment.id)) issues.push({ segment_id: segment.id, code: 'missing_coverage', message: '审核遗漏了文案句段，不能交付。' });
  if (segments.length && !rows.some(row => VERDICTS.has(row?.verdict) && row.verdict !== 'not_applicable')) issues.push({ code: 'no_product_claim', message: '本轮营销文案没有可核验的产品卖点，需补充有依据的功能表达。' });
  const supported = claims.filter(claim => claim.status === 'supported').length;
  const coreClaims = claims.filter(claim => {
    if (claim.status !== 'supported' || claim.field.startsWith('image_plan.')) return false;
    const positive = claim.text.replace(/[^，,。；;]*(?:以[^，,。；;]*为准|核验|核对|待确认|无法确认|不保证|未测试)[^，,。；;]*/g, '');
    return /支持|配备|搭载|内置|屏幕比例|OLED|触控|全尺寸|背光|指纹|USB|英寸|轻至|重约|重量\s*[:：]?\s*(?:约|为|是)?\s*\d|处理器|内存|硬盘|分辨率|协同|传送/i.test(positive);
  });
  if (supported && !coreClaims.length) issues.push({ code: 'no_core_product_claim', message: '保留内容只有条件或说明，没有正文中可核验的核心产品卖点，暂停交付。' });
  return { status: issues.length ? 'blocked' : 'passed', method: 'independent_model_with_exact_evidence_checks',
    coverage: { total_segments: segments.length, reviewed_segments: seen.size, product_claims: claims.length, supported_claims: supported, core_product_claims: coreClaims.length },
    claims, issues, segment_reviews: rows.filter(row => segments.some(segment => segment.id === row?.id)).map(({id,verdict,reason}) => ({id,verdict,reason})),
    note: '逐句覆盖由程序核对，事实含义由独立模型辅助判断；通过仍需人工复核，不等于实机兼容测试或事实认证。' };
}

export async function reviewDraft({ input, output, sources, review, system }) {
  const segments = reviewSegments(output);
  if (!review) return { status: 'not_performed', method: 'none', coverage: { total_segments: segments.length, reviewed_segments: 0, product_claims: 0, supported_claims: 0 }, claims: [], issues: [], note: '未执行独立语义审查。' };
  if (!segments.length) return { status: 'not_applicable', method: 'none', coverage: { total_segments: 0, reviewed_segments: 0, product_claims: 0, supported_claims: 0 }, claims: [], issues: [], note: '生成阶段已暂停成稿。' };
  try {
    const raw = await review({ input, output, sources, segments, system });
    return validateClaimReview(raw, { input, output, sources, segments });
  } catch {
    // Provider responses may contain sensitive or uncontrolled text; keep a stable diagnostic.
    return { status: 'error', method: 'independent_model_with_exact_evidence_checks', coverage: { total_segments: segments.length, reviewed_segments: 0, product_claims: 0, supported_claims: 0 }, claims: [], issues: [{ code: 'review_unavailable', message: '独立事实审查未完成，已暂停交付。请检查模型连接后重新生成。' }], note: '审核异常没有被当作审核通过。' };
  }
}

export function blockReviewedOutput(output, report, sources) {
  const allowed = new Set(sources.map(source => source.ref));
  const cleanRefs = value => String(value).replace(REF, (text, ref) => allowed.has(ref) ? text : '[无效引用]');
  const reasons = [...new Set(report.issues.map(issue => cleanRefs(issue.message)))].slice(0, 8);
  const next = structuredClone(output);
  next.content = { title: '', body: '', call_to_action: '' };
  next.image_plan = [];
  delete next.marketing_package;
  next.strategy = '独立辅助审查未通过，已暂停营销成稿与配图交付。';
  next.pending_confirmation = [...reasons, ...(output.pending_confirmation || [])].slice(0, 16);
  const refs = [...new Set(JSON.stringify({ customer_insight: next.customer_insight, strategy: next.strategy, pending_confirmation: next.pending_confirmation }).matchAll(REF))].map(match => match[1]);
  next.source_refs = [...new Set(refs)];
  if (!next.source_refs.length) {
    const source = sources.find(factSource) || sources.find(source => source.kind === 'text');
    if (source) { next.strategy += `本轮已取得资料 [${source.ref}]，存在资料不代表文案主张已获证实。`; next.source_refs = [source.ref]; }
  }
  return next;
}

const compactQuote = text => String(text).normalize('NFKC').replace(/\s/g, '').replace(/^[“”"'。；;，,、*#]+|[“”"'。；;，,、*#]+$/g, '');
function readableEvidenceQuote(quote) {
  const lines = String(quote).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || /^(?:重量|高度|宽度|深度|尺寸|分辨率|内存|类型|屏幕比例|亮度|屏占比|电池容量|容量|操作系统)$/.test(lines[0])) return null;
  const sentence = lines.join(' ').trim();
  // Parameters copied out of tables are evidence for review, not publishable
  // sentences. Do not invent a subject or a conclusion to make them readable.
  if (!/[。！？!?]/.test(sentence) || !/支持|搭载|配备|采用|内置|包含|配有|提供|可选|系统列有|容量(?:为|是)|重量(?:约|为|是)|重约|轻至|厚度(?:为|约)|包装含/.test(sentence)) return null;
  return sentence;
}
function isEvidenceOnlyReplacement(replacement, evidence) {
  if (!replacement.trim()) return true;
  let cursor = 0, count = 0;
  for (const match of replacement.matchAll(/\[(S\d+)\]/g)) {
    const quote = compactQuote(replacement.slice(cursor, match.index));
    if (!quote || !evidence.some(item => item.source_ref === match[1] && compactQuote(item.quote) === quote)) return false;
    cursor = match.index + match[0].length; count++;
  }
  return count > 0 && !compactQuote(replacement.slice(cursor));
}

// The repair model selects evidence; it never retypes it. Assembly stays local,
// followed by the same patch validation and a fresh independent review.
export function evidenceSelectionPatches(report, selection) {
  if (!selection || !Array.isArray(selection.selections) || Object.keys(selection).some(key => key !== 'selections')) throw Error('证据修订必须只返回 selections。');
  const rejected = new Map((report.claims || []).filter(claim => claim.status === 'rejected' && !claim.field?.startsWith('image_plan.')).map(claim => [claim.id, claim]));
  const byId = new Map();
  for (const item of selection.selections) {
    if (!item || !rejected.has(item.id) || byId.has(item.id) || Object.keys(item).some(key => !['id', 'quote_indices'].includes(key))) throw Error('证据选择包含未知、已支持或重复的句段。');
    byId.set(item.id, item.quote_indices);
  }
  return { replacements: [...rejected].map(([id, claim]) => {
    const indices = byId.get(id), evidence = claim.evidence || [];
    const valid = Array.isArray(indices) && indices.every(index => Number.isInteger(index) && index >= 0 && index < evidence.length && typeof evidence[index]?.quote === 'string' && evidence[index].quote.trim() && /^S\d+$/.test(evidence[index]?.source_ref));
    const selected = valid ? [...new Set(indices)].map(index => ({...evidence[index],readable:readableEvidenceQuote(evidence[index].quote)})) : [];
    // A partial selection might drop a required condition, so reject the whole
    // selection if any chosen excerpt cannot stand as a readable source sentence.
    const replacement = selected.length && selected.every(item => item.readable) ? selected.map(item => `${item.readable}[${item.source_ref}]`).join('\n') : '';
    // Do not truncate a quotation or keep a partial invalid selection.
    return { id, replacement: replacement.length <= 2400 ? replacement : '' };
  }) };
}

// Repairs cannot rewrite supported prose or introduce new facts. Rejected sentences
// become approved exact quotations or are deleted; the whole result is reviewed again.
export function applyReviewPatches(output, report, patch, sources) {
  if (!patch || !Array.isArray(patch.replacements) || Object.keys(patch).some(key => key !== 'replacements')) throw Error('修订必须只返回 replacements 局部补丁。');
  const segments = reviewSegments(output), byId = new Map(segments.map(segment => [segment.id, segment]));
  const rejected = new Set([
    ...(report.claims || []).filter(claim => claim.status === 'rejected').map(claim => claim.id),
    ...(report.issues || []).map(issue => issue.segment_id).filter(id => byId.has(id)),
  ]);
  const replacements = new Map();
  for (const item of patch.replacements) {
    if (!item || typeof item.id !== 'string' || typeof item.replacement !== 'string' || item.replacement.length > 2400 || Object.keys(item).some(key => !['id','replacement'].includes(key)) || !rejected.has(item.id) || replacements.has(item.id)) throw Error('修订包含未获准、更改已支持句或重复的句段。');
    replacements.set(item.id, item.replacement.trim());
  }
  const next = structuredClone(output), actions = [], edits = new Map();
  for (const id of rejected) {
    const segment = byId.get(id); if (!segment || segment.field.startsWith('image_plan.')) continue;
    const claim = (report.claims || []).find(value => value.id === id);
    const requested = replacements.get(id) || '';
    const accepted = isEvidenceOnlyReplacement(requested, claim?.evidence || []);
    const replacement = accepted ? requested : '';
    if (!edits.has(segment.field)) edits.set(segment.field, []);
    edits.get(segment.field).push({ ...segment, replacement });
    actions.push({ id, field: segment.field, action: replacement ? 'replace_with_evidence' : 'delete', reason: accepted ? replacement ? '仅使用该句已逐字核验的原文证据。' : '缺少可安全保留的表达，删除该句。' : '修订新增了已核验引文以外的表述，已删除该句。' });
  }
  for (const [field, changes] of edits) {
    const keys = field.startsWith('marketing_package.') ? field.split('.') : ['content',field];
    let owner = next;
    for (const key of keys.slice(0,-1)) owner = owner?.[key];
    const key = keys.at(-1);
    if (!owner || typeof owner[key] !== 'string') throw Error('局部修订字段已不存在。');
    let value = owner[key];
    for (const change of changes.sort((a,b) => b.start - a.start)) value = value.slice(0, change.start) + change.replacement + value.slice(change.end);
    owner[key] = value.replace(/\n{3,}/g, '\n\n').trim();
  }
  if (packageIssues(next).length) throw Error('局部修订使营销图文包不完整，需要重新生成，不能交付半空卡片。');
  for (const [index, image] of next.image_plan.entries()) {
    const source = sources.find(item => item.kind === 'image' && item.ref === image.source_ref);
    if (!source) throw Error('修订图注找不到本轮原图。');
    image.caption = `知识库原图：${String(source.title || '产品图').slice(0, 500)}。具体画面与配置待人工核对。`;
    actions.push({ field: `image_plan.${index}.caption`, action: 'source_caption', reason: '图注只标注原图名称和核对边界，不扩展功能。' });
  }
  const {source_refs: unused, ...referencedOutput} = next;
  next.source_refs = [...new Set([
    ...[...JSON.stringify(referencedOutput).matchAll(REF)].map(match => match[1]),
    ...next.image_plan.map(image => image.source_ref),
  ])];
  return { output: next, actions };
}
