import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_DATABASE = fileURLToPath(new URL('../research/semifinal-2026-10-22/research.sqlite', import.meta.url));
const SCENARIOS = new Set(['auto', 'student', 'meeting', 'creation', 'family', 'enterprise', 'store', 'launch', 'holiday']);
const GOALS = new Set(['conversation', 'save', 'consultation']);

function selectScenario(input, customerContext) {
  const taskCardId=customerContext?.scenario_card?.template_id;
  if(taskCardId==='student'||taskCardId==='meeting')return {id:taskCardId==='student'?'SC01':'SC02',origin:'extracted_task_card'};
  const sources = (customerContext?.original_sources || []).filter(s => s.type !== 'product' && typeof s.text === 'string');
  const revisions = sources.filter(s => s.type === 'revision');
  const customerText = revisions.length ? revisions.at(-1).text : sources.map(s => s.text).join('\n');
  // Original customer words outrank an operator's audience/scenario card.
  const primary = customerText || input.scenario || '';
  const excludesStudent = /(?:不是|并非|不再是|非)(?:一名|一个)?(?:大学生|研究生|学生)/.test(primary);
  const text = (customerText || `${input.scenario || ''}\n${excludesStudent ? '' : input.audience || ''}`)
    .replace(/(?:不是|并非|不再是|非)(?:一名|一个)?(?:大学生|研究生|学生|职场人士|项目经理|律师|医生)/g, ' ');
  const explicitIdentity = (customerText || input.scenario || '').match(/(?:我是|身份是|职业是|作为)(?:一名|一个)?(大学生|研究生|学生|大学新生|项目经理|运营|商务|职场人士|律师|医生|教师|老师|财务|工程师|设计师|程序员|退休人员|自由职业者|创作者)/)?.[1];
  if (explicitIdentity) {
    if (/大学生|研究生|学生|大学新生/.test(explicitIdentity)) return { id: 'SC01', origin: 'explicit_identity' };
    if (/项目经理|运营|商务|职场人士/.test(explicitIdentity)) return { id: 'SC02', origin: 'explicit_identity' };
    return { id: null, origin: 'unsupported_explicit_identity' };
  }
  if (/课程|小组汇报|毕业设计|毕业项目|小组会议/.test(text) && /大学生|研究生|学生|大学新生|课程/.test(text)) return { id: 'SC01', origin: 'explicit_identity_or_task' };
  if (/会议|会前|会后|行动项|客户方案/.test(text)) return { id: 'SC02', origin: 'explicit_task' };
  if (/大学生|研究生|学生|大学新生|课程|小组汇报|毕业设计|毕业项目/.test(text)) return { id: 'SC01', origin: 'explicit_identity_or_task' };
  if (/项目经理|运营|商务|职场|上班|公司|企业|办公室/.test(text)) return { id: 'SC02', origin: 'explicit_identity' };
  if (/律师|医生|教师|老师|财务|工程师|设计师|程序员|退休|自由职业|创作者/.test(text)) return { id: null, origin: 'unsupported_explicit_identity' };
  // A negative identity is still explicit evidence against a conflicting card.
  if (excludesStudent && input.business_scenario === 'student') return { id: null, origin: 'explicit_identity_exclusion' };
  return { id: ({ student: 'SC01', meeting: 'SC02' })[input.business_scenario] || null, origin: input.business_scenario && input.business_scenario !== 'auto' ? 'operator_selected' : 'unknown' };
}

/** Read bounded research candidates. Product claims still require original product evidence. */
export async function retrieveResearchContext(input = {}, { databasePath = DEFAULT_DATABASE, customerContext } = {}) {
  if (input.business_scenario !== undefined && !SCENARIOS.has(input.business_scenario)) throw Error('business_scenario is not supported');
  if (input.content_goal !== undefined && !GOALS.has(input.content_goal)) throw Error('content_goal must be conversation, save or consultation');
  if (input.content_goal_origin !== undefined && !['operator_selected', 'default_suggestion','input_extracted'].includes(input.content_goal_origin)) throw Error('Invalid content_goal_origin');
  const database = path.resolve(databasePath);
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const selection = selectScenario(input, customerContext);
    const read = db.prepare('SELECT dataset, id, record_type, title, payload_json FROM records WHERE eligible_for_generation=1 AND dataset=? AND id=?');
    const sourceQuery = db.prepare('SELECT s.payload_json FROM record_sources rs JOIN sources s ON s.id=rs.source_id WHERE rs.dataset=? AND rs.record_id=? ORDER BY s.id');
    function record(row, usage) {
      if (!row) return null;
      const sources = sourceQuery.all(row.dataset, row.id).map(s => JSON.parse(s.payload_json));
      // Defense in depth if a future database builder mislabels eligibility.
      if (sources.some(s => /excluded/.test(s.source_type || '') || ['public_mirror', 'award_case_pdf_search_index'].includes(s.source_type))) return null;
      const material = JSON.parse(row.payload_json);
      return { record_id: row.id, dataset: row.dataset, record_type: row.record_type, title: row.title,
        usage, is_customer_fact: false, product_facts_allowed: false, source_ids: sources.map(s => s.id), sources, material };
    }
    const get = (dataset, id, usage) => record(read.get(dataset, id), usage);
    const research_context = [];
    const sourceTexts = (customerContext?.original_sources || []).filter(s => s.type !== 'product');
    const revisions = sourceTexts.filter(s => s.type === 'revision');
    const text = revisions.length ? revisions.at(-1).text : sourceTexts.length ? sourceTexts.map(s => s.text || '').join('\n') : `${input.scenario || ''}\n${input.audience || ''}`;
    if (selection.id) {
      const student = selection.id === 'SC01';
      const marketingId = student ? (/毕业|旧电脑|旧机|换机/.test(text) ? 'MC02' : /开学|入学|新生/.test(text) ? 'MC01' : null)
        : (/比较|对比/.test(text) ? 'MC04' : /出差|差旅|移动|跨地点/.test(text) ? 'MC03' : null);
      research_context.push(
        get('audience', selection.id, 'candidate_scenario'),
        marketingId ? get('audience', marketingId, 'candidate_angle') : null,
        get('audience', student ? 'AE02' : 'AE04', 'aggregate_background_only'),
      );
    }
    const patterns = db.prepare("SELECT dataset,id,record_type,title,payload_json FROM records WHERE eligible_for_generation=1 AND dataset='xiaohongshu' AND record_type='writing_pattern' ORDER BY id").all();
    const preferred = input.content_goal === 'save' ? ['XP08', 'XP03', 'XP04', 'XP09'] : ['XP08', 'XP03', 'XP04', 'XP05'];
    const writing_patterns = (input.platform==='朋友圈'?[]:patterns).filter(row => preferred.includes(row.id)).sort((a, b) => preferred.indexOf(a.id) - preferred.indexOf(b.id)).slice(0, 4)
      .map(row => record(row, 'writing_reference_only')).filter(Boolean);
    let product_classification = null;
    if (typeof input.product === 'string' && input.product.trim()) {
      // Full names only: no substring/family matching and no model suffix stripping.
      const matches = db.prepare("SELECT dataset,id,record_type,title,payload_json FROM records WHERE eligible_for_generation=1 AND dataset='products' AND (json_extract(payload_json,'$.catalog_name')=? OR json_extract(payload_json,'$.verified_model_name')=?) LIMIT 2")
        .all(input.product.trim(), input.product.trim());
      if (matches.length === 1) {
        const candidate = record(matches[0], 'product_classification_candidate');
        if (candidate) {
          const p = candidate.material;
          // Do not inject entire archived specifications or price options into the research channel.
          product_classification = { ...candidate, catalog_name: p.catalog_name, verified_model_name: p.verified_model_name,
            catalog_product_id: p.catalog_product_id, candidate_only: true, requires_product_evidence_retrieval: true,
            material: { classification: p.classification, positioning: p.positioning, task_fit: p.task_fit, expression_boundaries: p.expression_boundaries } };
        }
      }
    }
    const selected = [...research_context.filter(Boolean), ...writing_patterns, product_classification].filter(Boolean);
    const metadata = db.prepare('SELECT name,as_of,sha256 FROM datasets ORDER BY name').all();
    return {
      scenario_id: selection.id, research_context: research_context.filter(Boolean), writing_patterns, product_classification,
      content_brief: { goal: input.content_goal || 'conversation', goal_origin: input.content_goal ? input.content_goal_origin || 'operator_selected' : 'default_suggestion', buying_stage: customerContext?.scenario_card?.buying_stage?.kind==='fact'?customerContext.scenario_card.buying_stage.value:'unknown',scenario_card:customerContext?.scenario_card },
      provenance: { database: path.basename(database), as_of: metadata.every(d => d.as_of === metadata[0]?.as_of) ? metadata[0]?.as_of : null,
        datasets: metadata.map(d => ({ ...d })), record_ids: selected.map(r => r.record_id), source_ids: [...new Set(selected.flatMap(r => r.source_ids))],
        scenario_origin: selection.origin, method: 'read_only_sqlite_explicit_selection', requires_product_evidence_retrieval: true,
        limitations: 'Research and marketing hypotheses are candidates only; aggregate statistics are neither customer facts nor product evidence.' },
      customer_facts: [],
    };
  } finally { db.close(); }
}
