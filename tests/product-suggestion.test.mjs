import test from 'node:test';import assert from 'node:assert/strict';
let suggest;try{({suggestProduct:suggest}=await import('../modules/scenario/shared/product-suggestion.mjs'));}catch{}
const products=[{name:'HUAWEI MateBook 14（鸿蒙版）',model:'HUAWEI MateBook 14',system:'HarmonyOS'},{name:'MateBook 14 酷睿 Ultra（Windows 系列）',model:'MateBook 14 酷睿 Ultra',system:'Windows'}];
const analysis={understanding:{product:{status:'unspecified',name:null},observations:[{category:'task',kind:'fact',value:'要写代码，学一点AI'}]}};
test('unspecified product gets a library candidate without claiming customer choice or compatibility',()=>{
 assert(suggest);const result=suggest(analysis,products);assert.equal(result.name,products[1].name);assert.match(result.reason,/候选|未验证/);assert.equal(analysis.understanding.product.name,null);
});
test('explicit model is respected and ambiguous intent is not silently changed',()=>{
 assert(suggest);assert.equal(suggest({understanding:{...analysis.understanding,product:{status:'specified',name:products[0].name}}},products).name,products[0].name);
 assert.equal(suggest({understanding:{...analysis.understanding,product:{status:'ambiguous',name:'MateBook 14'}}},products).name,'');
 assert.equal(suggest(analysis,[]).name,'');
});
