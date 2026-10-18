export class DeepSeekClient {
  constructor({ apiKey, model, baseUrl = 'https://api.deepseek.com', fetchImpl = fetch }) {
    this.apiKey = apiKey; this.model = model; this.fetchImpl = fetchImpl;
    const url = new URL(baseUrl);
    if (!(url.protocol === 'https:' && url.hostname === 'api.deepseek.com') && !(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw Error('DeepSeek地址必须为官方API或本地服务，避免误发本地凭证。');
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }
  async request(endpoint, body) {
    if (!this.apiKey && new URL(this.baseUrl).hostname === 'api.deepseek.com') throw Error('缺少 DEEPSEEK_API_KEY，请在本地配置。');
    const response = await this.fetchImpl(`${this.baseUrl}/${endpoint}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(120000), redirect: 'error',
    });
    if (!response.ok) throw Error(`DeepSeek HTTP ${response.status}，请检查模型、额度或认证配置。`);
    return response.json();
  }
  async doctor() {
    const data = await this.request('models');
    const models = (data.data || []).map(x => x.id);
    if (!models.includes(this.model)) throw Error(`配置模型 ${this.model} 不在可用列表：${models.join(', ')}`);
    return { ok: true, model: this.model, models };
  }
  async generate({ input, sources, outputSchema, system, customerContext }) {
    const data = await this.request('chat/completions', {
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ task: input, customer_context: customerContext, evidence: sources.map(({ ref, title, kind, text, path, description, index_path, width, height }) => ({ ref, title, kind, text, path, description, index_path, width, height })), output_schema: outputSchema, writing_requirements: input.platform === '小红书' ? [
          '最终正文是一篇按本次身份和实际任务展开的完整笔记，取2—3个不同场景；职业未知不默认学生，不能只替换职业名。原文没提到的职业经历只能用条件式情境，不得编造门诊、庭审等经历。',
          '采用面向读者的第二人称。禁止虚构第一人称体验：不写“我用过”“最近体验了”“我习惯”“亲测”等。即使输入使用第一人称，也不能把客户未说过的体验补成事实。',
          '把同一项任务贯穿几个场景：麻烦、动作、华为有据功能如何接住，不要写三个产品介绍段落。正文不写参数清单或建议方向；不写尺寸、重量、分辨率等数字。',
          '硬性文风要求：content 内不写“需要提醒的是”“仍需核对”“到店核验”“以实际体验为准”或续航影响因素；这些说明完整放 pending_confirmation。结尾是自然话题互动，不是到店邀请。',
          '产品功能只按本次文字事实来源写，完整使用条件放 pending_confirmation 折叠区，正文保留必要的范围限定而不写核验须知。图片来源[I编号]或图片索引中的画面名不能证明功能，尤其不能据手机协同画面推断手机投屏操作。没有文字证据就删掉该功能说法，不靠补一个引用编号掩盖缺证据。',
          '不要编造诊疗/法律结果、机构授权或软件兼容；使用公开或经授权的材料情境。完整使用条件写入 pending_confirmation，不在正文或CTA出现兼容性、续航或到店核验提醒。'
        ] : undefined }) },
      ],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 5000,
      stream: false,
    });
    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') throw Error('模型结果被截断，请减少输入或调整输出长度。');
    try { return JSON.parse(choice?.message?.content); }
    catch { throw Error('DeepSeek未返回有效JSON，请重试或检查输出提示词。'); }
  }
}
