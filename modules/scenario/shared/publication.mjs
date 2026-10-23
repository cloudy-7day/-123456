export function publicationBlocks(output) {
  const body = output.content.body.replace(/\r\n/g, '\n');
  // Models also use single-line emoji scene breaks. Keep repaired quotation
  // continuations inside that scene so image positions still refer to scenes.
  const separator = /\n\s*\n/.test(body) ? /\n\s*\n/
    : /\n(?=[\p{Extended_Pictographic}#])/u.test(body) ? /\n(?=[\p{Extended_Pictographic}#])/u : /\n+/;
  const paragraphs = body.split(separator).map(text => text.trim()).filter(Boolean);
  const blocks = paragraphs.map(text => ({ text, images: [], beforeImages: [] }));
  if (!blocks.length) blocks.push({ text: '', images: [], beforeImages: [] });
  for (const image of output.image_plan) {
    const position = image.position || '';
    if (/封面|首图/.test(position)) { blocks[0].beforeImages.push(image); continue; }
    const match = position.match(/第?\s*([一二三四五六七八九十\d]+)\s*段/);
    const numeral = match ? (/^\d+$/.test(match[1]) ? Number(match[1]) : ({一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10})[match[1]]) : null;
    const index = numeral ? Math.max(0, Math.min(blocks.length - 1, numeral - 1))
      : /开头|导语|首段|标题/.test(position) ? 0 : blocks.length - 1;
    blocks[index].images.push(image);
  }
  return blocks;
}

const escape = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export function publicationHtml(result, imageData = {}, cardData = []) {
  if (result.delivery?.status === 'blocked') throw Error('暂停成稿的内容不能导出。');
  const { output } = result;
  if(output.marketing_package) {
    const cards=publicationCards(result);
    const gallery=cards.map((card,index)=>/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(cardData[index]||'')?`<img src="${cardData[index]}" alt="${escape(card.heading)}">`:`<article><h2>${escape(card.heading)}</h2><p>${escape(card.body)}</p></article>`).join('');
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(publicationText(output.content.title))}</title><style>body{background:#f5f3ed;color:#193c33;font:17px/1.9 system-ui,sans-serif;margin:0}main{max-width:900px;margin:32px auto;padding:24px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:20px}.cards img{width:100%;border-radius:16px}.cards article{background:#e8eddf;padding:30px;border-radius:16px}pre{font:inherit;white-space:pre-wrap;background:white;padding:32px;border-radius:16px}@media(max-width:600px){.cards{grid-template-columns:1fr}main{padding:16px}pre{padding:20px}}</style><main><div class="cards">${gallery}</div><h2>发布文案</h2><pre>${escape(publicationCopy(output))}</pre><details><summary>客户咨询回复 · 供店员参考</summary>${output.marketing_package.consultation_replies.map(item=>`<h3>${escape(publicationText(item.question))}</h3><p>${escape(publicationText(item.reply))}</p>`).join('')}</details></main></html>`;
  }
  const renderImages = plans => plans.map(plan => {
    const data = imageData[plan.source_ref];
    const image = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data || '') ? `<img src="${data}" alt="${escape(plan.caption)}">` : '<p>图片未包含，请按来源补充。</p>';
    return `<figure>${image}<figcaption>${escape(plan.caption)} · ${escape(plan.source_ref)}</figcaption></figure>`;
  }).join('');
  const blocks = publicationBlocks(output).map(block => `${renderImages(block.beforeImages)}<p>${escape(block.text).replaceAll('\n', '<br>')}</p>${renderImages(block.images)}`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(output.content.title)}</title><style>body{margin:0;background:#f4f4f4;color:#202020;font:17px/1.9 system-ui,sans-serif}main{max-width:760px;margin:32px auto;padding:40px;background:white;border-radius:20px}h1{font-size:30px;line-height:1.4}figure{margin:28px 0}img{display:block;width:100%;max-height:540px;object-fit:contain}figcaption,footer,details{color:#666;font-size:13px}p{white-space:normal}footer{border-top:1px solid #ddd;padding-top:20px}@media(max-width:600px){main{margin:0;padding:24px;border-radius:0}}@media print{body{background:white}main{margin:0;padding:0}figure{break-inside:avoid}}</style><main><h1>${escape(output.content.title)}</h1>${blocks}<p>${escape(output.content.call_to_action)}</p><footer><p>产品：${escape(result.input?.product)} · 资料来源：${escape(result.meta?.retrieval?.archive_name || result.meta?.knowledge_base || '随附产品资料')}</p><details><summary>使用条件与资料依据</summary><ul>${output.pending_confirmation.map(text => `<li>${escape(text)}</li>`).join('')}</ul>${result.sources.filter(source => output.source_refs.includes(source.ref)).map(source => `<p>${escape(source.ref)} · ${escape(source.title)} · ${escape(source.path)}</p>`).join('')}</details><p>模型辅助审查：${escape(result.checks?.claim_review?.status || '未执行')}。使用前请核对产品版本、使用条件及原图。</p></footer></main></html>`;
}

// Provenance stays in the saved output; public-facing copy contains only readable text.
export const publicationText = value => String(value ?? '').replace(/\[(?:[SI]\d+)(?:\s*[,，、]\s*[SI]?\d+)*\]/g, '').replace(/[ \t]+\n/g, '\n').trim();
export function publicationCopy(output) {
  return [output.content.title, output.content.body, output.content.call_to_action].map(publicationText).filter(Boolean).join('\n\n');
}
export function publicationCards(result) {
  const pack = result.output.marketing_package;
  if (!pack || result.delivery?.status === 'blocked') return [];
  const allowed = new Set(result.output.image_plan.map(plan => plan.source_ref));
  const images = result.sources.filter(source => source.kind === 'image' && allowed.has(source.ref));
  const hero = images.find(source => /整机|外观|配色|主视觉/.test(source.title + ' ' + source.description)) || images[0];
  const common = {product:result.input?.product || '', total:4};
  return [
    {...common, index:0, kind:'cover', heading:publicationText(pack.cover_title), body:publicationText(pack.cover_subtitle), imageRef:hero?.ref, imagePath:hero?.local_path, points:pack.cards.map(card=>publicationText(card.heading))},
    ...pack.cards.map((card,index)=>({...common,index:index+1,kind:'detail',heading:publicationText(card.heading),body:publicationText(card.body)})),
  ];
}
