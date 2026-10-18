const fs = require('node:fs');
const path = require('node:path');
const { callIma, localDir } = require('./ima-client.cjs');

const targetName = '任德耀新建华为PC知识库';

async function main() {
  const matches = [];
  let cursor = '';
  const seen = new Set();
  do {
    if (seen.has(cursor)) throw new Error('ima 返回重复分页游标，已停止检查。');
    seen.add(cursor);
    const data = await callIma('search_knowledge_base', {
      query: targetName, cursor, limit: 20,
    });
    matches.push(...(data.info_list || []));
    if (data.is_end !== false) break;
    cursor = data.next_cursor;
    if (!cursor) throw new Error('ima 分页响应缺少下一页游标。');
  } while (true);
  console.log('凭证验证成功，已连接 ima 官方接口。');
  const exact = matches.filter(item => (item.kb_name || item.name) === targetName);
  if (exact.length !== 1) {
    throw new Error(`指定知识库精确匹配数为 ${exact.length}，请在同一 ima 账号中确认已加入比赛共享库。`);
  }
  const kbId = exact[0].kb_id || exact[0].id;
  if (!kbId) throw new Error('知识库响应缺少有效标识。');
  const data = await callIma('get_knowledge_list', {
    knowledge_base_id: kbId, cursor: '', limit: 20,
  });
  const entries = data.knowledge_list || [];
  fs.mkdirSync(localDir, { recursive: true });
  fs.writeFileSync(path.join(localDir, 'connection.json'), JSON.stringify({
    knowledge_base_id: kbId, knowledge_base_name: targetName,
    verified_at: new Date().toISOString(),
    first_page_count: entries.length, has_more: data.is_end === false,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(localDir, 'root-list.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`知识库：${targetName}`);
  console.log(`目录读取成功：首批 ${entries.length} 项${data.is_end === false ? '，还有后续分页' : ''}。`);
  for (const entry of entries.slice(0, 8)) {
    console.log(`- ${entry.title || entry.name || '未命名条目'}`);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
