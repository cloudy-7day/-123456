"""Import a user-provided ima knowledge-base export into private local storage."""
from pathlib import Path, PurePosixPath
from datetime import datetime
from zoneinfo import ZoneInfo
import csv, hashlib, json, os, stat, sys, zipfile
if len(sys.argv) != 2:
    raise SystemExit('用法：python3 scripts/import-knowledge-base.py 知识库.zip')
archive=Path(sys.argv[1]).resolve()
private=Path(os.environ['IMA_LOCAL_DIR']).expanduser().resolve() if os.environ.get('IMA_LOCAL_DIR') else Path(__file__).resolve().parents[1]/'.local'
private.mkdir(parents=True,exist_ok=True,mode=0o700)
sha=hashlib.sha256(archive.read_bytes()).hexdigest()
destination=private/'knowledge-base-imports'/sha[:16]
destination.mkdir(parents=True,exist_ok=True,mode=0o700)
with zipfile.ZipFile(archive) as z:
    entries=z.infolist()
    if len(entries)>10000 or sum(i.file_size for i in entries)>512*1024*1024:
        raise SystemExit('压缩包超过当前导入限制。')
    for i in entries:
        p=PurePosixPath(i.filename)
        if p.is_absolute() or '..' in p.parts or stat.S_ISLNK(i.external_attr>>16):
            raise SystemExit('压缩包包含不安全路径。')
        f=destination.joinpath(*p.parts)
        if i.is_dir():f.mkdir(parents=True,exist_ok=True);continue
        f.parent.mkdir(parents=True,exist_ok=True)
        f.write_bytes(z.read(i))
roots=list(destination.glob('*/P1-产品参数库'))
if len(roots)!=1:raise SystemExit('未找到唯一的 P1-产品参数库。')
root=roots[0].parent
products=[]
for f in sorted(roots[0].rglob('产品事实.md')):
    folder=f.parent
    if not (folder/'卖点与限制.md').exists():continue
    images=[];image_index=folder/'图片索引.csv'
    if image_index.exists():
        for row in csv.DictReader(image_index.open(encoding='utf-8-sig')):
            image=(folder/'images'/row['文件名']).resolve()
            if not image.is_relative_to(root) or not image.is_file() or image.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):continue
            images.append({'id':hashlib.sha256(str(image.relative_to(root)).encode()).hexdigest()[:24],'file':str(image),'name':image.name,'product':row['产品型号'],'sourceUrl':row['来源页面'],'originalUrl':row['原始图片URL'],'caption':row['官网图片说明'],'width':int(row['宽度']),'height':int(row['高度']),'sha256':hashlib.sha256(image.read_bytes()).hexdigest()})
    images.sort(key=lambda x:('blur' in x['originalUrl'],'主视觉' not in x['name'],-x['width']))
    products.append({'name':folder.name,'relativePath':str(folder.relative_to(root)),'sources':[{'title':name,'file':str(folder/name)} for name in ('产品事实.md','卖点与限制.md')],'images':images})
if not products:raise SystemExit('没有可读取的产品资料。')
meta={'archiveName':archive.name,'archiveSha256':sha,'importedAt':datetime.now(ZoneInfo('Asia/Shanghai')).date().isoformat(),'root':str(root),'provider':'ima_local_export','knowledgeBase':'任德耀新建华为PC知识库','products':products}
path=private/'knowledge-base-index.json';temp=private/'knowledge-base-index.tmp'
temp.write_text(json.dumps(meta,ensure_ascii=False),encoding='utf8');temp.chmod(0o600);temp.replace(path)
print(f'已导入 {len(products)} 个产品、{sum(len(p["images"]) for p in products)} 张图片。重启工作台后生效。')
