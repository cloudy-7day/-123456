// Citation identifiers are case-insensitive presentation tokens, not product numbers.
// Unknown identifiers remain intact for the existing source-membership validator.
export function canonicalizeCitations(value){
 if(typeof value==='string')return value.replace(/\[([si]\d+)\]/gi,(_,ref)=>`[${ref.toUpperCase()}]`).replace(/^[si]\d+$/i,s=>s.toUpperCase());
 if(Array.isArray(value))return value.map(canonicalizeCitations);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,canonicalizeCitations(v)]));
 return value;
}
