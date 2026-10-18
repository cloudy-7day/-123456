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
        { role: 'user', content: JSON.stringify({ task: input, customer_context: customerContext, evidence: sources.map(({ ref, title, kind, text, path, description, index_path, width, height }) => ({ ref, title, kind, text, path, description, index_path, width, height })), output_schema: outputSchema }) },
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
