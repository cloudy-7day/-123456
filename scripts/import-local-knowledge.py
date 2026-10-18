"""Import an authorized ZIP as inert, content-addressed knowledge assets (no network).

Usage: python scripts/import-local-knowledge.py PATH_TO_ZIP
Pillow is required only for import-time image integrity checks, never at runtime.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile
from PIL import Image


def archive_name(info):
    value = info.filename
    if not info.flag_bits & 0x800:
        try:
            value = value.encode('cp437').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    value = value.replace('\\', '/')
    parts = PurePosixPath(value).parts
    if not parts or value.startswith('/') or any(x in ('..', '.') or ':' in x for x in parts):
        raise ValueError('Unsafe archive path')
    if stat.S_ISLNK(info.external_attr >> 16):
        raise ValueError('Archive symlinks are unsupported')
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    target = Path(__file__).resolve().parent.parent / 'knowledge'
    blobs = target / 'assets'
    entries, raw, image_meta, skipped = {}, {}, {}, []
    with zipfile.ZipFile(args.archive, 'r') as archive:
        if sum(i.file_size for i in archive.infolist()) > 256 * 1024 * 1024:
            raise ValueError('Archive exceeds import limit')
        for info in archive.infolist():
            name = archive_name(info)
            if info.is_dir():
                continue
            suffix = PurePosixPath(name).suffix.lower()
            if suffix not in ('.md', '.csv', '.txt', '.json', '.png', '.jpg', '.jpeg', '.webp'):
                skipped.append(name)
                continue
            if info.file_size > 16 * 1024 * 1024 or name in entries:
                raise ValueError('Oversized or duplicate archive entry')
            data = archive.read(info)
            digest = hashlib.sha256(data).hexdigest()
            if suffix in ('.png', '.jpg', '.jpeg', '.webp'):
                with Image.open(io.BytesIO(data)) as image:
                    extension = {'PNG': 'png', 'JPEG': 'jpg', 'WEBP': 'webp'}.get(image.format)
                    if not extension:
                        raise ValueError('Unexpected image format: ' + name)
                    image_meta[name] = {'extension': extension, 'width': image.width, 'height': image.height}
                    image.verify()
                suffix = '.' + extension
            else:
                data.decode('utf-8-sig')
            file = 'assets/' + digest + suffix
            entries[name] = {'title': PurePosixPath(name).name, 'path': name, 'file': file, 'sha256': digest, 'size': len(data)}
            raw[name] = data
    products = []
    for name in sorted(entries):
        if not name.endswith('/产品事实.md') or '/P1-产品参数库/' not in name:
            continue
        folder = str(PurePosixPath(name).parent)
        model = PurePosixPath(folder).name
        category = PurePosixPath(folder).parent.name
        system = 'HarmonyOS' if '鸿蒙' in category else 'Windows'
        display = model + ('（鸿蒙版）' if system == 'HarmonyOS' else '（Windows 系列）')
        docs = [entries[folder + '/' + title] for title in ('产品事实.md', '卖点与限制.md', '图片索引.csv', '商城款式图片/图片索引.csv') if folder + '/' + title in entries]
        images, seen = [], set()
        for doc in docs:
            if not doc['path'].endswith('.csv'):
                continue
            content = raw[doc['path']].decode('utf-8-sig').replace('\r\r\n', '\n')
            for row in csv.DictReader(io.StringIO(content)):
                filename = row.get('文件名', '')
                if not filename or PurePosixPath(filename).name != filename:
                    raise ValueError('Unsafe or empty indexed image name')
                candidates = [p for p in entries if p.startswith(folder + '/') and PurePosixPath(p).name == filename and p in image_meta]
                # Prefer the subtree of this image index when identical names occur.
                index_folder = str(PurePosixPath(doc['path']).parent)
                candidates = [p for p in candidates if p.startswith(index_folder + '/')]
                if len(candidates) != 1:
                    raise ValueError('Image index must resolve exactly once: ' + doc['path'] + '/' + filename)
                image_path = candidates[0]
                if image_path in seen:
                    continue
                seen.add(image_path)
                images.append({**entries[image_path], **image_meta[image_path], 'description': row.get('官网图片说明') or row.get('画面说明') or filename, 'source_url': row.get('原始图片URL', ''), 'source_page': row.get('来源页面') or row.get('商品页URL', ''), 'usage': row.get('建议用途', ''), 'index_path': doc['path']})
        text = raw[name].decode('utf-8-sig')
        date = re.search(r'抓取日期[：:]\s*(\d{4}-\d{2}-\d{2})', text)
        products.append({'id': 'pc-' + hashlib.sha256(folder.encode()).hexdigest()[:16], 'name': display, 'model': model, 'category': category, 'system': system, 'path': folder, 'source_created_at': date.group(1) + 'T00:00:00Z' if date else None, 'documents': docs, 'images': images})
    roots = {PurePosixPath(p).parts[0] for p in entries}
    if len(roots) != 1 or not products:
        raise ValueError('Expected one knowledge library root with product facts')
    root = next(iter(roots))
    manifest = {'schema_version': 1, 'knowledge_base': root, 'archive_name': args.archive.name, 'archive_version': re.search(r'v\d+$', root).group(0), 'archive_sha256': hashlib.sha256(args.archive.read_bytes()).hexdigest(), 'products': products, 'files': list(entries.values()), 'skipped_entries': skipped}
    blobs.mkdir(parents=True, exist_ok=True)
    for name, entry in entries.items():
        (target / entry['file']).write_bytes(raw[name])
    (target / 'catalog.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'products': len(products), 'archive_files': len(entries), 'unique_assets': len({x['file'] for x in entries.values()}), 'indexed_images': sum(len(p['images']) for p in products), 'skipped': len(skipped)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
