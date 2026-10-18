import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from '../src/config.mjs';

// This generated folder is the only permitted removal target.
const target = path.resolve(ROOT, 'modelscope-upload');
if (target !== path.join(ROOT, 'modelscope-upload') || path.dirname(target) !== ROOT) throw Error('Unsafe package destination');
const files = ['Dockerfile','.dockerignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','server.mjs','cli.mjs',
  'public/index.html','examples/task.json','modules/scenario/index.html','modules/scenario/package.json',
  'vendor/ima-skills-1.1.10/ima-skill/ima_api.cjs','vendor/ima-skills-1.1.10/ima-skill/meta.json'];
for (const dir of ['src','contracts','prompts','modules/scenario/src','modules/scenario/server','modules/scenario/shared']) {
  for (const entry of await fs.readdir(path.join(ROOT,dir),{withFileTypes:true})) {
    if (!entry.isFile() || !/\.(mjs|js|jsx|css|json|txt)$/.test(entry.name)) throw Error('Unexpected file in runtime directory: '+dir+'/'+entry.name);
    files.push(dir+'/'+entry.name);
  }
}
const contents = await Promise.all(files.map(async file=>({file,bytes:await fs.readFile(path.join(ROOT,file))})));
// Never delete a linked folder or traverse outside the checkout.
try { if ((await fs.lstat(target)).isSymbolicLink()) throw Error('Package destination is a link'); }
catch (error) { if(error.code!=='ENOENT') throw error; }
await fs.rm(target,{recursive:true,force:true});
await fs.mkdir(target,{recursive:true});
for(const {file,bytes} of contents){await fs.mkdir(path.dirname(path.join(target,file)),{recursive:true});await fs.writeFile(path.join(target,file),bytes);}
await fs.writeFile(path.join(target,'.gitignore'),'.env*\nnode_modules/\noutput/\ntmp/\n*.log\n');
await fs.writeFile(path.join(target,'README.md'),`# 门店增长智能体 · 整合部署包

由 scripts/package-modelscope.mjs 从当前源码生成，禁止在此目录手工维护第二套代码。
上传本目录内的文件和子目录到魔搭 Docker 创空间根目录。Dockerfile 必须位于仓库根目录。
使用 Node.js 24，监听 0.0.0.0:7860；构建时安装锁定依赖并编译 React。
应用入口 /scenario/，单平台表单 /。

必填私密环境变量：DEEPSEEK_API_KEY、IMA_OPENAPI_CLIENTID、IMA_OPENAPI_APIKEY。
建议明确填写 IMA_KB_NAME=任德耀新建华为PC知识库、DEEPSEEK_MODEL=deepseek-flash。
DEEPSEEK_BASE_URL 默认 https://api.deepseek.com，HOST/PORT 已在 Dockerfile 中设置。
不要上传 .env.local 或将 SHADOW_ENV_FILE 设为你电脑上的路径。

未包含任何凭证、本地依赖、缓存、历史输出或示例图片。图片由运行时真实检索取得。
没有配置持久化存储；分析确认记录在进程内存中，重启后需要重新理解。
实例没有多用户账号隔离，按团队演示对象设置访问范围。
代码、提示词和构建产物经过本地测试不等于魔搭已部署；请上传后检查连接和生成。
`);
const manifest=contents.map(({file,bytes})=>({file,sha256:createHash('sha256').update(bytes).digest('hex')}));
await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify({generated_from:'integrated-app',files:manifest},null,2)+'\n');
console.log(JSON.stringify({directory:target,runtime_files:contents.length,credentials_included:false}));
