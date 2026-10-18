import React,{useState} from 'react';

export function ProductVisual({product,className=''}){
 const [failed,setFailed]=useState('');
 const preview=product?.preview;
 return <div className={`product-visual ${className}`}>
  {preview?.url&&failed!==preview.url?<img src={preview.url} alt={product.name+' · '+preview.title} onError={()=>setFailed(preview.url)}/>:<div className="product-placeholder" aria-label="产品图片待补"><span>HUAWEI MateBook</span><small>产品原图待补</small></div>}
 </div>;
}

export function ProductCard({product,reasons=[],selected=false,onSelect,disabled=false}){
 if(!product)return null;
 return <article className={`product-card ${selected?'is-selected':''}`}>
  <ProductVisual product={product}/>
  <div className="product-card-content"><span className="product-system">{product.system==='HarmonyOS'?'鸿蒙电脑':product.system+' 系列'}</span>
   <h3>{product.model||product.name}</h3>
   <div className="feature-tags">{(product.features||[]).slice(0,3).map(f=><span key={f.id}>{f.label}</span>)}</div>
   {reasons.length?<ul className="match-reasons">{reasons.map((r,i)=><li key={i}>{r.label}</li>)}</ul>:null}
   {onSelect?<button type="button" className={selected?'selection-selected':'selection-button'} aria-pressed={selected} disabled={disabled} onClick={()=>onSelect(product.name)}>{selected?'已选此型号':'选择此型号'}</button>:null}
   <details className="product-evidence"><summary>资料与配置说明</summary><p>不同销售版本配置可能不同，请以具体版本与现场核验为准。</p>{(reasons.length?reasons:product.features||[]).map((f,i)=><div key={i}><strong>{f.label}</strong><p>{f.evidence}</p><small>{f.source_path}</small></div>)}{product.preview?<small>原图来源：{product.preview.path}</small>:null}</details>
  </div>
 </article>;
}
