const segmenter = new Intl.Segmenter('zh', {granularity:'word'});
const stop = new Set(['的','了','是','在','和','与','有','我','你','他','她','我们','他们','这个','一个','可以','需要','进行','相关','使用']);
export function searchTerms(value) {
  const text = String(value || '').normalize('NFKC').toLowerCase();
  const words = [...segmenter.segment(text)].filter(x => x.isWordLike && !stop.has(x.segment)).map(x => x.segment);
  const grams = [...text.matchAll(/[\p{Script=Han}]+/gu)].flatMap(m => Array.from({length:Math.max(0,m[0].length-1)},(_,i) => '~' + m[0].slice(i,i+2)));
  return [...words, ...grams];
}
export function buildLexicalIndex(chunks) {
  const entries = [], frequencies = new Map(); let totalLength = 0;
  for (const chunk of chunks) {
    const terms = searchTerms(`${chunk.title} ${chunk.section} ${chunk.content}`), counts = new Map();
    for (const term of terms) counts.set(term,(counts.get(term)||0)+1);
    for (const term of counts.keys()) frequencies.set(term,(frequencies.get(term)||0)+1);
    entries.push({chunk, counts, length:terms.length}); totalLength += terms.length;
  }
  return {entries, frequencies, averageLength:totalLength / Math.max(1,entries.length)};
}
export function lexicalRanking(index, query, allowed, limit = 100) {
  const terms = [...new Set(searchTerms(query))], n = index.entries.length;
  const matches = [];
  for (const entry of index.entries) {
    if (!allowed(entry.chunk)) continue;
    let score = 0; const matched = [];
    for (const term of terms) {
      const frequency = entry.counts.get(term) || 0; if (!frequency) continue;
      const idf = Math.log(1 + (n - (index.frequencies.get(term)||0) + 0.5) / ((index.frequencies.get(term)||0) + 0.5));
      score += (term.startsWith('~') ? 0.45 : 1) * idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * entry.length / (index.averageLength || 1)));
      if (!term.startsWith('~')) matched.push(term);
    }
    if (score > 0) matches.push({chunk:entry.chunk, score, matched_terms:matched.slice(0,20)});
  }
  return matches.sort((a,b) => b.score-a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0,limit);
}
export function cosine(left, right) {
  if (!left?.length || left.length !== right?.length) throw Error('检索向量维度不一致。');
  let dot=0, a=0, b=0;
  for(let i=0;i<left.length;i++){if(!Number.isFinite(left[i])||!Number.isFinite(right[i]))throw Error('检索向量包含无效数值。');dot+=left[i]*right[i];a+=left[i]**2;b+=right[i]**2;}
  return a && b ? dot / Math.sqrt(a*b) : 0;
}
