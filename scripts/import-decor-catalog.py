#!/usr/bin/env python3
"""Importa o acervo local auditado, sem rede; mídias imutáveis ficam fora do Git."""
import argparse
import collections
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'public/decor')
args = parser.parse_args()
root = args.source.resolve()
out = args.output.resolve()
media = out / 'media'
media.mkdir(parents=True, exist_ok=True)
load = lambda name: json.loads((root / name).read_text())
assets = {a['url']: a for a in load('assets-manifest.json') + load('supplement-assets.json') if 'path' in a}
slots = {'Avatar Decoration': 'avatar_deco', 'Nameplate': 'nameplate', 'Profile Effect': 'profile_fx'}
copied = {}
provenance = {}
previous = {}
if (out / 'import-manifest.json').exists():
    for url, relative in json.loads((out / 'import-manifest.json').read_text())['files'].items():
        original = root / relative
        target = media / Path(url).name
        if original.exists() and target.exists() and os.path.samefile(original, target):
            copied[original] = url
            provenance[url] = relative

def source_path(relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError('arquivo ausente ou fora do acervo: ' + relative)
    return path

def put(path):
    path = Path(path)
    if path in copied:
        return copied[path]
    data = path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n'): ext = '.png'
    elif data.startswith(b'\x1aE\xdf\xa3'): ext = '.webm'
    elif data[:4] == b'RIFF' and data[8:12] == b'WEBP': ext = '.webp'
    else: raise ValueError('formato inesperado: ' + str(path))
    digest = hashlib.sha256(data).hexdigest()
    dest = media / (digest + ext)
    if not dest.exists():
        try: os.link(path, dest)
        except OSError: shutil.copyfile(path, dest)
    url = '/decor/media/' + dest.name
    copied[path] = url
    if path.is_relative_to(root): provenance[url] = str(path.relative_to(root))
    return url

def local(url):
    if url not in assets: raise ValueError('recurso não baixado: ' + url)
    return put(source_path(assets[url]['path']))

def still(path):
    # Primeiro quadro real, nunca uma animação escondida atrás de CSS.
    with tempfile.TemporaryDirectory() as tmp:
        dest = Path(tmp) / 'preview.png'
        data = path.read_bytes()
        if data.startswith(b'\x89PNG\r\n\x1a\n'):
            # Um APNG também contém um PNG padrão; retirar somente os chunks
            # de animação evita limitações do demuxer para quadros parciais.
            chunks = [data[:8]]
            pos = 8
            while pos + 12 <= len(data):
                length = struct.unpack('>I', data[pos:pos+4])[0]
                chunk = data[pos:pos+12+length]
                if data[pos+4:pos+8] not in (b'acTL', b'fcTL', b'fdAT'):
                    chunks.append(chunk)
                pos += length + 12
            dest.write_bytes(b''.join(chunks))
        else:
            subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-frames:v', '1', '-update', '1', str(dest)], check=True)
        # Não memorizar caminhos temporários reutilizados.
        result = put(dest)
        copied.pop(dest, None)
        return result

def png_info(path):
    b = path.read_bytes()
    w, h = struct.unpack('>II', b[16:24])
    duration = 0
    p = 8
    while p + 12 <= len(b):
        n = struct.unpack('>I', b[p:p+4])[0]
        if b[p+4:p+8] == b'fcTL':
            num, den = struct.unpack('>HH', b[p+28:p+32])
            duration += 1000 * num / (den or 100)
        p += n + 12
    return w, h, max(100, round(duration or 3000))

current = load('current-manifest.json')
previews = {a['id']: a for a in current}
entries = []
for record in load('catalog-index.json'):
    slot = slots[record['type']]
    entry = {'id': record['id'], 'slot': slot, 'name': record['name'], 'source': 'catalog'}
    config = record.get('config', {})
    if slot == 'avatar_deco':
        entry['image'] = put(source_path(record['asset']['path']))
        entry['preview'] = put(source_path(previews[record['id']]['path']))
    elif slot == 'nameplate':
        entry['video'] = put(source_path(record['asset']['path']))
        path = config.get('assets', {}).get('static_image_path')
        entry['preview'] = local(path if path and path.startswith('https://') else 'https://cdn.discordapp.com/' + path) if path else still(source_path(record['asset']['path']))
        entry['palette'] = config.get('palette', 'violet')
    else:
        entry['preview'] = put(source_path(previews[record['id']]['path']))
        entry['layers'] = []
        for layer in config['effects']:
            entry['layers'].append({
                'src': local(layer['src']),
                'variants': [local(v['src']) for v in layer.get('randomized_sources', [])],
                'start': layer.get('start', 0), 'duration': layer.get('duration', 3000),
                'loop': bool(layer.get('loop')), 'loopDelay': layer.get('loop_delay', 0),
                'zIndex': layer.get('z_index', 0), 'position': layer.get('position', {'x': 0, 'y': 0}),
                'width': layer.get('width') or 450, 'height': layer.get('height') or 880,
            })
    entries.append(entry)

# Inclui também TODO grupo histórico baixado, mesmo quando a API já removeu seu SKU.
known_ids = {e['id'] for e in entries}
known_names = {(e['slot'], e['name'].casefold()) for e in entries}
groups = collections.defaultdict(list)
for f in load('archive-manifest.json'):
    parts = Path(f['path']).parts
    groups[(parts[1], parts[2])].append(source_path(f['path']))
category_slots = {'Avatar_Decorations': 'avatar_deco', 'Nameplates': 'nameplate', 'Profile_Effects': 'profile_fx'}
archive_ids = {(slots[i['type']], i['name']): i['id'] for i in load('archive-items.json')}
covered = []
for (category, name), files in sorted(groups.items()):
    slot = category_slots[category]
    ident = archive_ids.get((slot, name))
    if ident in known_ids or (not ident and (slot, name.casefold()) in known_names):
        covered.append({'category': category, 'name': name, 'included': 'current'})
        continue
    ident = ident or 'archive-' + hashlib.sha256((slot + name).encode()).hexdigest()[:20]
    e = {'id': ident, 'slot': slot, 'name': name, 'source': 'archive'}
    static = next((p for p in files if p.parent.name == 'Static' and p.suffix == '.png'), None)
    if slot == 'avatar_deco':
        animated = next((p for p in files if p.parent.name == 'Animated'), None) or static
        e['image'] = put(animated)
        e['preview'] = put(static) if static else still(animated)
    elif slot == 'nameplate':
        video = next(p for p in files if p.suffix == '.webm')
        e['video'] = put(video)
        e['preview'] = put(static) if static else still(video)
        e['palette'] = 'violet'
    else:
        layers = sorted([p for p in files if '_layer_' in p.name], key=lambda p: int(re.search(r'_layer_(\d+)', p.name)[1]))
        if not layers: layers = [p for p in files if p.parent.name == 'Animated'] or [static]
        e['preview'] = put(static) if static else still(layers[0])
        e['timingSource'] = 'apng-fallback'
        e['layers'] = []
        intro = 0
        for i, p in enumerate(layers):
            w, h, duration = png_info(p)
            e['layers'].append({'src': put(p), 'variants': [], 'start': intro if i else 0,
                'duration': duration, 'loop': i > 0 or len(layers) == 1, 'loopDelay': 0,
                'zIndex': i, 'position': {'x': 0, 'y': 0}, 'width': w, 'height': h})
            if not i: intro = duration
    entries.append(e)
    known_ids.add(ident)
    covered.append({'category': category, 'name': name, 'included': ident})

# Alguns grupos têm mais de um SKU (mesmo nome, variantes diferentes).
# Não perder um SKU histórico só porque outro do grupo ainda está no catálogo.
for record in load('archive-extra-items.json'):
    if record['id'] in known_ids:
        continue
    slot = slots[record['type']]
    category = next(k for k, v in category_slots.items() if v == slot)
    files = groups.get((category, record['name']), [])
    matching = [p for p in files if record['id'] in p.name]
    if slot != 'nameplate' or not matching:
        raise ValueError('SKU histórico não coberto: ' + record['id'])
    video = next(p for p in matching if p.suffix == '.webm')
    static = next((p for p in matching if p.parent.name == 'Static'), None)
    entries.append({'id': record['id'], 'slot': slot, 'name': record['name'],
        'source': 'archive', 'video': put(video), 'preview': put(static) if static else still(video),
        'palette': 'violet'})
    known_ids.add(record['id'])

entries.sort(key=lambda e: (e['slot'], e['name'].casefold(), e['id']))
payload = {'version': 1, 'items': entries}
encoded = json.dumps(payload, ensure_ascii=False, separators=(',', ':'))
(out / 'catalog.json').write_text(encoded + '\n')
(out / 'catalog.js').write_text('window.DUSKY_DECOR_CATALOG=' + encoded.replace('<', '\\u003c') + ';\n')
(out / 'import-manifest.json').write_text(json.dumps({'files': provenance, 'archiveCoverage': covered}, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'items': len(entries), 'slots': dict(collections.Counter(e['slot'] for e in entries)),
    'historicalGroupsCovered': len(covered), 'fallbackEffects': sum('timingSource' in e for e in entries), 'mediaFiles': len(list(media.iterdir()))}, ensure_ascii=False))
