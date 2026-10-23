"""Validate research provenance and build a local, read-only-at-runtime SQLite library.

This is a research artifact builder. It does not modify the production knowledge
catalog or inject research hypotheses into customer/product facts.
"""
from pathlib import Path
import argparse
import csv
import hashlib
import json
import sqlite3

ROOT = Path(__file__).resolve().parent
DATASETS = {
    'products': 'product_candidate_evidence',
    'audience': 'audience_context',
    'xiaohongshu': 'writing_reference',
    'sales-guides': 'sales_guidance',
}

def eligibility(record, sources):
    reasons = []
    if record.get('evidence_status') == 'discovered_unverified':
        reasons.append('record evidence not verified')
    for sid in sorted(refs_in(record)):
        source_type = sources[sid].get('source_type', '')
        if 'excluded' in source_type or source_type in ('award_case_pdf_search_index', 'public_mirror'):
            reasons.append(f'{sid}: {source_type}')
    return not reasons, '; '.join(reasons)

def refs_in(value):
    refs = set()
    if isinstance(value, dict):
        for key, item in value.items():
            if key == 'source_ids':
                if not isinstance(item, list) or not all(isinstance(x, str) for x in item):
                    raise ValueError('source_ids must be a string array')
                refs.update(item)
            elif key == 'source_id' and isinstance(item, str):
                refs.add(item)
            else:
                refs.update(refs_in(item))
    elif isinstance(value, list):
        for item in value:
            refs.update(refs_in(item))
    return refs

def load_validated():
    datasets = {}
    all_ids = set()
    catalog = json.loads((ROOT.parents[1] / 'knowledge/catalog.json').read_text(encoding='utf-8-sig'))
    product_ids = {p['id'] for p in catalog['products']}
    for name in DATASETS:
        path = ROOT / (name + '.json')
        raw = path.read_bytes()
        data = json.loads(raw.decode('utf-8-sig'))
        assert data['schema_version'] == 1, name
        assert data['as_of'] == '2026-10-22', name
        assert isinstance(data['records'], list) and data['records'], name
        sources = {s['id']: s for s in data['source_registry']}
        assert len(sources) == len(data['source_registry']), f'{name}: duplicate source'
        assert not all_ids.intersection(sources), f'{name}: cross-dataset source id collision'
        all_ids.update(sources)
        ids = set()
        for source in sources.values():
            assert source.get('title') and source.get('evidence_scope'), (name, source['id'])
            assert source.get('url') or source.get('local_path') or source.get('path'), (name, source['id'], 'no location')
        for record in data['records']:
            rid = record['id']
            assert rid not in ids, f'{name}: duplicate record {rid}'
            ids.add(rid)
            refs = refs_in(record)
            assert refs <= sources.keys(), f'{name}/{rid}: unknown source {refs - sources.keys()}'
            if name == 'products' and record.get('catalog_product_id'):
                assert record['catalog_product_id'] in product_ids, f'unknown catalog product {rid}'
        datasets[name] = (data, hashlib.sha256(raw).hexdigest())
    return datasets

def build():
    datasets = load_validated()
    target = ROOT / 'research.sqlite'
    conn = sqlite3.connect(target)
    with conn:
        conn.executescript('''
        DROP TABLE IF EXISTS record_sources;
        DROP TABLE IF EXISTS records;
        DROP TABLE IF EXISTS sources;
        DROP TABLE IF EXISTS datasets;
        CREATE TABLE datasets (name TEXT PRIMARY KEY, as_of TEXT NOT NULL, usage_role TEXT NOT NULL, sha256 TEXT NOT NULL, metadata_json TEXT NOT NULL);
        CREATE TABLE sources (id TEXT PRIMARY KEY, dataset TEXT NOT NULL REFERENCES datasets(name), title TEXT NOT NULL, url TEXT, payload_json TEXT NOT NULL);
        CREATE TABLE records (dataset TEXT NOT NULL REFERENCES datasets(name), id TEXT NOT NULL, record_type TEXT NOT NULL, title TEXT NOT NULL, payload_json TEXT NOT NULL, eligible_for_generation INTEGER NOT NULL, exclusion_reason TEXT NOT NULL, PRIMARY KEY(dataset,id));
        CREATE TABLE record_sources (dataset TEXT NOT NULL, record_id TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), PRIMARY KEY(dataset,record_id,source_id), FOREIGN KEY(dataset,record_id) REFERENCES records(dataset,id));
        ''')
        counts = {}
        for name, (data, digest) in datasets.items():
            metadata = {k:v for k,v in data.items() if k not in ('records','source_registry')}
            conn.execute('INSERT INTO datasets VALUES(?,?,?,?,?)', (name, data['as_of'], DATASETS[name], digest, json.dumps(metadata, ensure_ascii=False)))
            for source in data['source_registry']:
                conn.execute('INSERT INTO sources VALUES(?,?,?,?,?)', (source['id'], name, source['title'], source.get('url'), json.dumps(source, ensure_ascii=False)))
            sources = {s['id']:s for s in data['source_registry']}
            excluded = []
            for record in data['records']:
                title = record.get('title') or record.get('name') or record.get('label') or record.get('catalog_name') or record.get('task') or record.get('finding') or record.get('purchase_trigger') or record['id']
                allowed, reason = eligibility(record, sources)
                if not allowed: excluded.append({'id':record['id'],'reason':reason})
                conn.execute('INSERT INTO records VALUES(?,?,?,?,?,?,?)', (name,record['id'],record.get('record_type','product' if name=='products' else 'reference'), title, json.dumps(record, ensure_ascii=False), int(allowed), reason))
                conn.executemany('INSERT INTO record_sources VALUES(?,?,?)', [(name,record['id'],sid) for sid in sorted(refs_in(record))])
            counts[name] = {'records':len(data['records']), 'sources':len(data['source_registry']), 'eligible_records':len(data['records'])-len(excluded), 'excluded_records':excluded, 'sha256':digest}
        assert conn.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        assert not conn.execute('PRAGMA foreign_key_check').fetchall()
    conn.close()
    with (ROOT/'product-classification.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f)
        writer.writerow(['产品ID','完整型号','系统','形态','分类定位（研究判断）','具体SKU价格','支持任务候选（非实测）','能力表述（生成前须核原文）','适用条件','不能承诺的内容','来源编号','已有图片数'])
        for product in datasets['products'][0]['records']:
            classification=product['classification']
            writer.writerow([product['catalog_product_id'],product['catalog_name'],classification.get('system_family'),classification.get('form_factor'),classification.get('tier'),'待核实；详见JSON价格记录',
                '\n'.join(x['task']+': '+x['rationale'] for x in product['task_fit']),
                '\n'.join(x['claim'] for x in product['capabilities']),
                '\n'.join(dict.fromkeys(c for x in product['capabilities'] for c in x.get('conditions',[]))),
                '\n'.join(x['statement'] for x in product['expression_boundaries']),
                ', '.join(sorted(refs_in(product))),len(product['image_assets'])])
    report = {'as_of':'2026-10-22','database':target.name,'datasets':counts,'validation':'passed','production_integration':False}
    (ROOT/'validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))

def query(terms, dataset, limit, full=False):
    if not terms or any(not t.strip() for t in terms):
        raise ValueError('Supply explicit search terms; an empty query must not imply a customer profile')
    assert 1 <= limit <= 20
    conn=sqlite3.connect((ROOT/'research.sqlite').as_uri()+'?mode=ro',uri=True)
    conn.row_factory=sqlite3.Row
    escape=lambda s:'%'+s.replace('\\','\\\\').replace('%','\\%').replace('_','\\_')+'%'
    patterns=[escape(t) for t in terms]
    score=' + '.join("CASE WHEN payload_json LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END" for _ in terms)
    sql=f'SELECT dataset,id,record_type,title,payload_json,({score}) AS matches FROM records WHERE eligible_for_generation=1'
    params=patterns[:]
    if dataset:sql+=' AND dataset=?';params.append(dataset)
    sql+=' ORDER BY matches DESC, dataset, id LIMIT ?';params.append(limit)
    rows=[dict(r) for r in conn.execute(sql,params) if r['matches']>0]
    for r in rows:
        payload = json.loads(r.pop('payload_json'))
        if full: r['material'] = payload
        r['usage_role']=DATASETS[r['dataset']]
        r['source_ids']=[x[0] for x in conn.execute('SELECT source_id FROM record_sources WHERE dataset=? AND record_id=? ORDER BY source_id',(r['dataset'],r['id']))]
        if full:
            r['sources'] = [json.loads(conn.execute('SELECT payload_json FROM sources WHERE id=?',(sid,)).fetchone()[0]) for sid in r['source_ids']]
    conn.close()
    return {'method':'explicit keyword substring matching; no semantic retrieval or probability score', 'query_terms':terms, 'customer_facts':[], 'requires_product_evidence_retrieval':True, 'human_review_required':True,'results':rows}

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--query',nargs='+')
    parser.add_argument('--dataset',choices=list(DATASETS))
    parser.add_argument('--limit',type=int,default=6)
    parser.add_argument('--full',action='store_true',help='Include material and source metadata, with their original evidence limitations')
    args=parser.parse_args()
    if args.query: print(json.dumps(query(args.query,args.dataset,args.limit,args.full),ensure_ascii=False,indent=2))
    else: build()
