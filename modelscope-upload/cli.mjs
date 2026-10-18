import fs from 'node:fs/promises';
import path from 'node:path';
import { doctor, execute } from './src/runtime.mjs';
import { ROOT, safeError } from './src/config.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  if (index !== -1 && (!args[index + 1] || args[index + 1].startsWith('--'))) throw Error(`${name} 缺少参数`);
  return index === -1 ? fallback : args[index + 1];
};
try {
  if (args[0] === 'doctor') {
    const result = await doctor();
    console.log(JSON.stringify(result, null, 2));
    if (Object.values(result).some(x => !x.ok)) process.exitCode = 1;
  } else if (args[0] === 'run') {
    const inputPath = path.resolve(ROOT, option('--input', 'examples/task.json'));
    const outputPath = path.resolve(ROOT, option('--output', 'output/latest.json'));
    const input = JSON.parse((await fs.readFile(inputPath, 'utf8')).replace(/^\uFEFF/, ''));
    const result = await execute(input, message => console.error(message));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify({ ok: true, output: outputPath, title: result.output.content.title, source_count: result.sources.length, duration_ms: result.meta.duration_ms }, null, 2));
  } else {
    console.log('用法：node cli.mjs doctor | run --input examples/task.json --output output/latest.json');
    if (args.length) process.exitCode = 1;
  }
} catch (error) { console.error(safeError(error)); process.exitCode = 1; }
