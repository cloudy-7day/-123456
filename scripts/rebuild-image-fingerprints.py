"""Rebuild pixel-similarity hashes. Visual approval remains in catalog.json."""
import json
from pathlib import Path
from PIL import Image,ImageOps
root=Path(__file__).resolve().parents[1]
catalog=json.loads((root/'knowledge/catalog.json').read_text(encoding='utf-8'))
assets={}
def bits(values):
    result=0
    for value in values:result=(result<<1)|int(value)
    return f'{result:016x}'
for product in catalog['products']:
    for asset in product['images']:
        im=ImageOps.exif_transpose(Image.open(root/'knowledge'/asset['file'])).convert('RGBA')
        bg=Image.new('RGBA',im.size,'white');bg.alpha_composite(im);gray=bg.convert('L')
        diff=list(gray.resize((9,8),Image.Resampling.LANCZOS).getdata())
        avg=list(gray.resize((8,8),Image.Resampling.LANCZOS).getdata());mean=sum(avg)/64
        assets[asset['sha256']]={'dhash':bits(diff[y*9+x]>diff[y*9+x+1] for y in range(8) for x in range(8)),'ahash':bits(v>mean for v in avg),'product_id':product['id']}
(root/'knowledge/image-diversity.json').write_text(json.dumps({'schema_version':1,'method':'Pillow EXIF-normalized, white alpha composite, grayscale 64-bit difference/average hash. Visual roles and angles are SHA-bound reviews in catalog.json; hashes only detect similarity.','assets':assets},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Indexed {len(assets)} image fingerprints')
