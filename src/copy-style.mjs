// Remove only screen noun modifiers before fact review, never the model name,
// feature, condition or citation. The resulting sentence is still verified.
export function omitScreenSpecs(text) {
  return text
    .replace(/\d+:\d+\s*(?:比例)?的?\s*(?=(?:OLED\s*)?(?:抗反射\s*)?(?:触控)?(?:大屏|屏))/gi, '')
    .replace(/\d+(?:\.\d+)?\s*英寸\s*(?=(?:OLED\s*)?(?:抗反射\s*)?(?:触控)?(?:大屏|屏))/gi, '');
}

export function preparePublicationStyle(input,output){
 if(input.platform!=='小红书')return output;
 const body=output.content.body;
 if((body.match(/#[^\s#]+/g)||[]).length>=2)return output;
 const context=`${input.audience||''} ${input.scenario||''}`;
 const tags=/学生|校园|寝室|图书馆/.test(context)?'#校园日常 #学习记录':/会议|会前|会后/.test(context)?'#职场日常 #项目会议':'#日常记录 #电脑选购';
 return {...output,content:{...output.content,body:body.trim()+'\n\n'+tags}};
}
