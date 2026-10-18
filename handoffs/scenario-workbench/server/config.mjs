import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
// Deliberately read only the two authorized fields; never load unrelated credentials.
export function loadConfig(env=process.env){
 const path=env.SCENARIO_ENV_FILE || resolve('.env.local'); const values={};
 if(existsSync(path)) for(const line of readFileSync(path,'utf8').split(/\r?\n/)){
  const match=line.match(/^\s*(DEEPSEEK_API_KEY|LLM_PROVIDER)\s*=\s*(.*?)\s*$/); if(match) values[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');
 }
 const provider=env.LLM_PROVIDER||values.LLM_PROVIDER||'deepseek';
 if(provider!=='deepseek') throw new Error('本模块只支持 DeepSeek');
 return {apiKey:env.DEEPSEEK_API_KEY||values.DEEPSEEK_API_KEY||'',model:'deepseek-flash',endpoint:'https://api.deepseek.com/chat/completions',port:Number(env.PORT||4320)};
}
