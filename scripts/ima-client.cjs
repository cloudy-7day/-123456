const fs = require('node:fs');
const path = require('node:path');
const { imaApi } = require('../vendor/ima-skills-1.1.10/ima-skill/ima_api.cjs');

const localDir = path.resolve(__dirname, '../.ima-local');

function credentials() {
  const file = path.join(localDir, 'credentials.json');
  if (!fs.existsSync(file)) throw new Error('未找到本机 ima 凭证配置。');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value.clientId || !value.apiKey) throw new Error('本机 ima 凭证配置不完整。');
  return { clientId: value.clientId, apiKey: value.apiKey };
}

async function callIma(method, body = {}) {
  if (!/^[a-z_]+$/.test(method)) throw new Error('ima 接口名称不合法。');
  const auth = credentials();
  try {
    const raw = await imaApi(`openapi/wiki/v1/${method}`, body, {
      ...auth,
      baseUrl: 'https://ima.qq.com',
      lastCheckFile: path.join(localDir, 'last_update_check'),
    });
    let response;
    try {
      response = JSON.parse(raw);
    } catch {
      throw new Error('ima 未返回有效 JSON；请检查网络或服务状态。');
    }
    if (response.code !== 0) {
      throw new Error(`ima 错误 ${response.code}: ${response.msg || '请求未成功'}`);
    }
    return response.data;
  } catch (error) {
    let message = String(error.msg || error.message || 'ima 调用失败');
    for (const secret of Object.values(auth)) message = message.split(secret).join('[REDACTED]');
    const safeError = new Error(message);
    safeError.code = error.code;
    throw safeError;
  }
}

module.exports = { callIma, localDir };
