"""Cache a pinned public embedding model when Node cannot use the local proxy.
No knowledge-base or customer content is sent. Model files remain in ignored output/.
"""
import concurrent.futures, hashlib, json, os, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
REVISION = '2c4055b12046f11709e9df2c122e59ffbdc2f900'
CACHE = pathlib.Path(os.environ.get('SEARCH_CACHE_DIR', ROOT / 'output/search-cache')) / 'models' / MODEL / REVISION
FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx']
def cache(name):
    target = CACHE / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        partial = target.with_suffix(target.suffix + '.partial')
        request = urllib.request.Request(f'https://huggingface.co/{MODEL}/resolve/{REVISION}/{name}', headers={'User-Agent': 'Huawei-PC-local-embedding-setup/1.0'})
        with urllib.request.urlopen(request, timeout=90) as response, partial.open('wb') as output:
            while data := response.read(1024 * 1024): output.write(data)
        partial.replace(target)
    result = {'file': name, 'bytes': target.stat().st_size, 'sha256': hashlib.sha256(target.read_bytes()).hexdigest()}
    print(json.dumps(result), flush=True)
    return result
if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool: manifest = list(pool.map(cache, FILES))
    (CACHE / 'download-manifest.json').write_text(json.dumps({'model': MODEL, 'revision': REVISION, 'files': manifest}, indent=2))
