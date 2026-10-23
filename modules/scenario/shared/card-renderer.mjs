// The same renderer creates the on-screen preview and the downloadable PNG files.
const W=1200,H=1600;
export function wrapText(context,text,maxWidth) {
  const lines=[];
  for(const paragraph of String(text).split('\n')) {
    let line='';
    const tokens=paragraph.match(/[A-Za-z0-9]+(?:[.\-][A-Za-z0-9]+)*(?:\s*(?:kg|g|mm|cm|GB|TB|Hz|W)\b)?|[^\x00-\x7F]|./gu)||[];
    for(const token of tokens) {
      if(line&&context.measureText(line+token).width>maxWidth){lines.push(line.trimEnd());line='';}
      if(context.measureText(token).width>maxWidth){
        for(const char of token){if(line&&context.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
      }else line+=(!line?token.trimStart():token);
    }
    lines.push(line);
  }
  return lines;
}
function textBlock(c,text,x,y,width,{size=48,lineHeight=1.5,weight=400,color='#183a32',maxLines=20}={}) {
  let lines;
  do { c.font=`${weight} ${size}px "PingFang SC", "Noto Sans CJK SC", sans-serif`; lines=wrapText(c,text,width); if(lines.length<=maxLines||size<=24)break;size-=2; }while(true);
  c.fillStyle=color; c.textBaseline='top';
  lines.forEach((line,index)=>c.fillText(line,x,y+index*size*lineHeight));
  return y+lines.length*size*lineHeight;
}
function roundRect(c,x,y,w,h,r,color){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();}
export function drawPublicationCard(canvas,card,image) {
  canvas.width=W;canvas.height=H;
  const c=canvas.getContext('2d');
  c.fillStyle=card.kind==='cover'?'#eef3e9':card.index===2?'#163d34':'#f5f2e9';c.fillRect(0,0,W,H);
  const dark=card.kind!=='cover'&&card.index===2;
  const ink=dark?'#f4f4e8':'#173e34', muted=dark?'#bfd1c2':'#667d70';
  textBlock(c,'选购笔记',82,76,600,{size:30,weight:600,color:muted});
  textBlock(c,`${String(card.index+1).padStart(2,'0')} / 04`,960,78,180,{size:27,color:muted});
  if(card.kind==='cover') {
    const coverHeading=card.heading.length>10&&/^[^，,]{4,}[，,].{4,}$/.test(card.heading)?card.heading.replace(/[，,]/, '$&\n'):card.heading;
    const end=textBlock(c,coverHeading,78,180,1040,{size:92,weight:700,lineHeight:1.17,maxLines:3});
    textBlock(c,card.body,82,end+35,1000,{size:39,lineHeight:1.45,maxLines:2,color:'#536e60'});
    roundRect(c,62,650,1076,620,36,'#ffffff');
    if(image){const scale=Math.min(1012/image.width,560/image.height);c.drawImage(image,600-image.width*scale/2,960-image.height*scale/2,image.width*scale,image.height*scale);}
    else textBlock(c,'选电脑，先理清自己的需求',120,880,960,{size:44,weight:600,maxLines:2});
    (card.points||[]).forEach((point,index)=>{
      roundRect(c,82,1305+index*59,36,36,18,'#d2dfcf');
      textBlock(c,String(index+1),93,1310+index*59,30,{size:23,weight:600});
      textBlock(c,point,139,1304+index*59,950,{size:32,maxLines:1});
    });
  } else {
    textBlock(c,`0${card.index}`,73,165,1000,{size:200,weight:700,color:dark?'#426c59':'#c9d5c2'});
    const end=textBlock(c,card.heading,82,425,1020,{size:82,weight:700,lineHeight:1.24,maxLines:3,color:ink});
    c.fillStyle=dark?'#b7cc91':'#74966e';c.fillRect(84,end+45,108,8);
    const bodyY=end+110;
    textBlock(c,card.body,84,bodyY,1000,{size:49,lineHeight:1.62,maxLines:Math.max(4,Math.floor((1400-bodyY)/79)),color:ink});
  }
  c.strokeStyle=dark?'#567361':'#ccd5c7';c.lineWidth=1;c.beginPath();c.moveTo(82,1493);c.lineTo(1118,1493);c.stroke();
  textBlock(c,card.product,82,1516,1040,{size:23,maxLines:1,color:muted});
  textBlock(c,card.kind==='cover'&&image?'配图来自产品资料 · 非通勤实拍':'选购参考 · 具体配置与使用条件请核对',82,1556,1040,{size:20,color:muted,maxLines:1});
  return canvas;
}
